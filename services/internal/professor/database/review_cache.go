package database

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

// Professor pages are the main source of database egress: every view used to
// download the professor's full review list. Each instance now keeps the
// shared (non-personal) part of that list in memory, keyed by professor, along
// with an md5 fingerprint of the exact rows. A page view asks Postgres only for
// the current fingerprint (32 bytes) plus the visitor's own ratings and hidden
// reviews, and downloads the full list again only when the fingerprint changed.
// Because the fingerprint covers every column we return, a cache hit is never
// stale, and no write path needs to invalidate anything.

// reviewCacheTTL only bounds how long an unvisited professor stays in memory;
// freshness comes from the fingerprint check on every request.
const reviewCacheTTL = 6 * time.Hour

// emptyReviewFingerprint is the md5 of an empty string: what the fingerprint
// query returns for a professor with no visible reviews.
const emptyReviewFingerprint = "d41d8cd98f00b204e9800998ecf8427e"

// reviewColumns is shared by every review query so the cached rows, the
// visitor's hidden rows, and the fingerprint all see the same columns.
const reviewColumns = `
	SELECT r.sort_index,
		r.id,
		r.score,
		r.positive,
		r.content,
		r.grade_received,
		r.course_taken,
		NULLIF(c.name, '') AS course_name,
		r.language,
		r.like_count,
		r.dislike_count,
		r.reply_count,
		r.uaeu_origin,
		r.created_at,
		ra.id AS attachment_id,
		ra.height AS attachment_height,
		ra.width AS attachment_width,
		ra.blob_name AS attachment_blob_name,
		ra.mime_type AS attachment_mime_type,
		r.session_id,
		r.user_id,
		r.gif
	FROM professor.review r
	LEFT JOIN course.course c ON c.tag = r.course_taken
	LEFT JOIN professor.review_attachment ra ON r.attachment = ra.id AND ra.visible
	WHERE r.professor_email = $1
	  AND r.deleted_at IS NULL
	  AND r.created_at >= NOW() - INTERVAL '2 years'`

const visibleReviewsSQL = reviewColumns + `
	  AND r.visible`

const reviewFingerprintExpr = `md5(COALESCE(string_agg(b::text, '|' ORDER BY b.sort_index DESC, b.id DESC), ''))`

// reviewFingerprintSQL returns only the fingerprint of the visible reviews.
const reviewFingerprintSQL = `SELECT ` + reviewFingerprintExpr + ` FROM (` + visibleReviewsSQL + `) b`

// visibleReviewsWithFingerprintSQL returns the visible reviews and, on the
// first row only, the fingerprint of the same snapshot.
const visibleReviewsWithFingerprintSQL = `
	WITH base AS MATERIALIZED (` + visibleReviewsSQL + `),
	fp AS (SELECT ` + reviewFingerprintExpr + ` AS fingerprint FROM base b)
	SELECT CASE WHEN row_number() OVER (ORDER BY b.sort_index DESC, b.id DESC) = 1 THEN fp.fingerprint END,
		b.*
	FROM base b
	CROSS JOIN fp
	ORDER BY b.sort_index DESC, b.id DESC`

// ownHiddenReviewsSQL returns hidden reviews the visitor wrote; they still see
// their own review while it waits for moderation. Usually no rows.
const ownHiddenReviewsSQL = reviewColumns + `
	  AND NOT r.visible
	  AND (r.session_id = $2 OR ($3::bigint IS NOT NULL AND r.user_id = $3))`

// visitorRatingsSQL returns the visitor's latest rating per review of this
// professor. Usually a handful of rows.
const visitorRatingsSQL = `
	SELECT DISTINCT ON (rr.review_id) rr.review_id, rr.value
	FROM professor.review_rating rr
	JOIN professor.review r ON r.id = rr.review_id
	WHERE r.professor_email = $1
	  AND r.deleted_at IS NULL
	  AND (rr.session_id = $2 OR ($3::bigint IS NOT NULL AND rr.user_id = $3))
	ORDER BY rr.review_id, rr.created_at DESC`

type cachedAttachment struct {
	ID       int64
	Height   int
	Width    int
	BlobName string
	MimeType string
}

// cachedReview is one review without the visitor-specific fields. Instances
// are shared between requests and must not be modified after caching.
type cachedReview struct {
	review     v1.Review
	attachment *cachedAttachment
	sessionID  *int64
	userID     *int64
}

type reviewSnapshot struct {
	fingerprint string
	reviews     []cachedReview
}

func (db *ProfessorDB) GetProfessorReviews(ctx context.Context, sessionId int64, userId *int64, email string) (*[]v1.Review, *float64, *[]int64, *bool, error) {
	snapshot, cached := db.reviewCache.Get(email)

	batch := &pgx.Batch{}
	if cached {
		batch.Queue(reviewFingerprintSQL, email)
	} else {
		batch.Queue(visibleReviewsWithFingerprintSQL, email)
	}
	batch.Queue(visitorRatingsSQL, email, sessionId, userId)
	batch.Queue(ownHiddenReviewsSQL, email, sessionId, userId)

	results := db.Db.Pool.SendBatch(ctx, batch)

	refresh := false
	if cached {
		var fingerprint string
		if err := results.QueryRow().Scan(&fingerprint); err != nil {
			results.Close()
			return nil, nil, nil, nil, fmt.Errorf("review fingerprint: %w", err)
		}
		refresh = fingerprint != snapshot.fingerprint
	} else {
		rows, err := results.Query()
		if err != nil {
			results.Close()
			return nil, nil, nil, nil, fmt.Errorf("visible reviews: %w", err)
		}
		snapshot, err = scanReviewSnapshot(rows)
		if err != nil {
			results.Close()
			return nil, nil, nil, nil, fmt.Errorf("visible reviews: %w", err)
		}
		db.reviewCache.Set(email, snapshot)
	}

	ratings, err := scanVisitorRatings(results)
	if err != nil {
		results.Close()
		return nil, nil, nil, nil, fmt.Errorf("visitor ratings: %w", err)
	}

	hidden, err := scanReviewList(results)
	if err != nil {
		results.Close()
		return nil, nil, nil, nil, fmt.Errorf("own hidden reviews: %w", err)
	}

	if err := results.Close(); err != nil {
		return nil, nil, nil, nil, err
	}

	if refresh {
		rows, err := db.Db.Pool.Query(ctx, visibleReviewsWithFingerprintSQL, email)
		if err != nil {
			return nil, nil, nil, nil, fmt.Errorf("visible reviews: %w", err)
		}
		snapshot, err = scanReviewSnapshot(rows)
		if err != nil {
			return nil, nil, nil, nil, fmt.Errorf("visible reviews: %w", err)
		}
		db.reviewCache.Set(email, snapshot)
	}

	reviews, averageScore, sessionIDs, reviewed := buildReviews(snapshot.reviews, hidden, ratings, sessionId, userId, db.formatAttachmentURL)

	return &reviews, &averageScore, &sessionIDs, &reviewed, nil
}

// buildReviews combines the shared cached rows with the visitor's own hidden
// reviews and ratings into the response, in sort order.
func buildReviews(
	visible []cachedReview,
	hidden []cachedReview,
	ratings map[int64]string,
	sessionID int64,
	userID *int64,
	formatURL func(blobName string) string,
) ([]v1.Review, float64, []int64, bool) {
	rows := visible
	if len(hidden) > 0 {
		rows = make([]cachedReview, 0, len(visible)+len(hidden))
		rows = append(rows, visible...)
		rows = append(rows, hidden...)
		sort.SliceStable(rows, func(i, j int) bool {
			if rows[i].review.SortIndex != rows[j].review.SortIndex {
				return rows[i].review.SortIndex > rows[j].review.SortIndex
			}
			return rows[i].review.ID > rows[j].review.ID
		})
	}

	reviews := make([]v1.Review, 0, len(rows))
	sessionIDs := make([]int64, 0, len(rows))
	scoreSum := 0.0
	reviewed := false

	for _, row := range rows {
		rev := row.review
		rev.Author = "User"
		rev.Self = (row.sessionID != nil && *row.sessionID == sessionID) ||
			(userID != nil && row.userID != nil && *row.userID == *userID)
		if rev.Self {
			reviewed = true
		}

		if rated, ok := ratings[rev.ID]; ok {
			rev.Rated = &rated
		}

		if row.attachment != nil {
			rev.Attachment = &v1.ReviewAttachment{
				ID:       row.attachment.ID,
				Height:   row.attachment.Height,
				Width:    row.attachment.Width,
				URL:      formatURL(row.attachment.BlobName),
				MimeType: row.attachment.MimeType,
			}
		}

		scoreSum += float64(rev.Score)
		reviews = append(reviews, rev)

		if row.sessionID != nil {
			sessionIDs = append(sessionIDs, *row.sessionID)
		}
	}

	averageScore := 0.0
	if len(reviews) > 0 {
		averageScore = scoreSum / float64(len(reviews))
	}

	return reviews, averageScore, sessionIDs, reviewed
}

func scanReviewSnapshot(rows pgx.Rows) (reviewSnapshot, error) {
	defer rows.Close()

	snapshot := reviewSnapshot{
		fingerprint: emptyReviewFingerprint,
		reviews:     make([]cachedReview, 0),
	}

	for rows.Next() {
		var fingerprint *string
		row, err := scanCachedReview(rows, &fingerprint)
		if err != nil {
			return reviewSnapshot{}, err
		}
		if fingerprint != nil {
			snapshot.fingerprint = *fingerprint
		}
		snapshot.reviews = append(snapshot.reviews, row)
	}

	if err := rows.Err(); err != nil {
		return reviewSnapshot{}, err
	}

	return snapshot, nil
}

func scanReviewList(results pgx.BatchResults) ([]cachedReview, error) {
	rows, err := results.Query()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []cachedReview
	for rows.Next() {
		row, err := scanCachedReview(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, row)
	}

	return list, rows.Err()
}

func scanVisitorRatings(results pgx.BatchResults) (map[int64]string, error) {
	rows, err := results.Query()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ratings := make(map[int64]string)
	for rows.Next() {
		var (
			reviewID int64
			value    *bool
		)
		if err := rows.Scan(&reviewID, &value); err != nil {
			return nil, err
		}
		if value == nil {
			continue
		}
		if *value {
			ratings[reviewID] = "like"
		} else {
			ratings[reviewID] = "dislike"
		}
	}

	return ratings, rows.Err()
}

// scanCachedReview scans reviewColumns, after any leading columns in prefix.
func scanCachedReview(rows pgx.Rows, prefix ...any) (cachedReview, error) {
	var (
		row         cachedReview
		attID       *int64
		attHeight   *int
		attWidth    *int
		attBlobName *string
		attMimeType *string
	)

	dest := append(prefix,
		&row.review.SortIndex,
		&row.review.ID,
		&row.review.Score,
		&row.review.Positive,
		&row.review.Text,
		&row.review.GradeReceived,
		&row.review.CourseTaken,
		&row.review.CourseName,
		&row.review.Language,
		&row.review.LikeCount,
		&row.review.DislikeCount,
		&row.review.ReplyCount,
		&row.review.UaeuOrigin,
		&row.review.CreatedAt,
		&attID,
		&attHeight,
		&attWidth,
		&attBlobName,
		&attMimeType,
		&row.sessionID,
		&row.userID,
		&row.review.Gif,
	)

	if err := rows.Scan(dest...); err != nil {
		return cachedReview{}, err
	}

	if attID != nil {
		row.attachment = &cachedAttachment{ID: *attID}
		if attHeight != nil {
			row.attachment.Height = *attHeight
		}
		if attWidth != nil {
			row.attachment.Width = *attWidth
		}
		if attBlobName != nil {
			row.attachment.BlobName = *attBlobName
		}
		if attMimeType != nil {
			row.attachment.MimeType = *attMimeType
		}
	}

	return row, nil
}
