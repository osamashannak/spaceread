package database

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

const mySpaceListLimit = 20

func (db *DB) GetMySpaceSummary(ctx context.Context, userID int64) (v1.MySpaceSummaryResponse, error) {
	var summary v1.MySpaceSummaryResponse

	err := db.Pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM professor.review WHERE user_id = $1 AND deleted_at IS NULL),
			(SELECT count(*) FROM professor.review_reply WHERE user_id = $1 AND deleted_at IS NULL),
			(SELECT count(*) FROM course.file WHERE user_id = $1),
			(SELECT count(*) FROM course.file WHERE user_id = $1 AND NOT visible AND NOT reviewed)`,
		userID).Scan(
		&summary.Reviews,
		&summary.Replies,
		&summary.Uploads,
		&summary.PendingUploads,
	)

	return summary, err
}

func (db *DB) ListMySpaceReviews(ctx context.Context, userID int64) ([]v1.MySpaceReviewResponse, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT
			r.id,
			r.professor_email,
			COALESCE(p.name, ''),
			r.score,
			r.positive,
			r.content,
			r.visible,
			r.reviewed,
			CASE
				WHEN r.visible THEN 'published'
				WHEN NOT r.visible AND NOT r.reviewed THEN 'held'
				ELSE 'hidden'
			END,
			r.like_count,
			r.dislike_count,
			r.reply_count,
			r.course_taken,
			r.grade_received,
			r.created_at
		FROM professor.review r
		LEFT JOIN professor.professor p ON p.email = r.professor_email
		WHERE r.user_id = $1
		  AND r.deleted_at IS NULL
		ORDER BY r.created_at DESC
		LIMIT $2`, userID, mySpaceListLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	reviews := make([]v1.MySpaceReviewResponse, 0)
	for rows.Next() {
		var review v1.MySpaceReviewResponse
		if err := rows.Scan(
			&review.ID,
			&review.ProfessorEmail,
			&review.ProfessorName,
			&review.Score,
			&review.Positive,
			&review.Text,
			&review.Visible,
			&review.Reviewed,
			&review.Status,
			&review.LikeCount,
			&review.DislikeCount,
			&review.ReplyCount,
			&review.CourseTaken,
			&review.GradeReceived,
			&review.CreatedAt,
		); err != nil {
			return nil, err
		}

		reviews = append(reviews, review)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return reviews, nil
}

func (db *DB) ListMySpaceReplies(ctx context.Context, userID int64) ([]v1.MySpaceReplyResponse, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT
			rr.id,
			rr.review_id,
			r.professor_email,
			COALESCE(p.name, ''),
			LEFT(r.content, 160),
			rr.content,
			rr.visible,
			CASE WHEN rr.visible THEN 'published' ELSE 'hidden' END,
			rr.like_count,
			rr.created_at
		FROM professor.review_reply rr
		JOIN professor.review r ON r.id = rr.review_id
		LEFT JOIN professor.professor p ON p.email = r.professor_email
		WHERE rr.user_id = $1
		  AND rr.deleted_at IS NULL
		  AND r.deleted_at IS NULL
		ORDER BY rr.created_at DESC
		LIMIT $2`, userID, mySpaceListLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	replies := make([]v1.MySpaceReplyResponse, 0)
	for rows.Next() {
		var reply v1.MySpaceReplyResponse
		if err := rows.Scan(
			&reply.ID,
			&reply.ReviewID,
			&reply.ProfessorEmail,
			&reply.ProfessorName,
			&reply.ReviewPreview,
			&reply.Comment,
			&reply.Visible,
			&reply.Status,
			&reply.LikeCount,
			&reply.CreatedAt,
		); err != nil {
			return nil, err
		}

		replies = append(replies, reply)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return replies, nil
}

func (db *DB) ListMySpaceUploads(ctx context.Context, userID int64) ([]v1.MySpaceUploadResponse, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT
			f.id,
			f.course_tag,
			COALESCE(c.name, ''),
			f.name,
			f.type,
			f.size,
			f.download_count,
			f.visible,
			f.reviewed,
			f.reviewed_at,
			CASE
				WHEN f.visible AND f.reviewed THEN 'approved'
				WHEN NOT f.visible AND NOT f.reviewed THEN 'pending'
				ELSE 'rejected'
			END,
			f.created_at
		FROM course.file f
		LEFT JOIN course.course c ON c.tag = f.course_tag
		WHERE f.user_id = $1
		ORDER BY f.created_at DESC
		LIMIT $2`, userID, mySpaceListLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	uploads := make([]v1.MySpaceUploadResponse, 0)
	for rows.Next() {
		var upload v1.MySpaceUploadResponse
		var reviewedAt pgtype.Timestamptz
		if err := rows.Scan(
			&upload.ID,
			&upload.CourseTag,
			&upload.CourseName,
			&upload.Name,
			&upload.Type,
			&upload.Size,
			&upload.DownloadCount,
			&upload.Visible,
			&upload.Reviewed,
			&reviewedAt,
			&upload.Status,
			&upload.CreatedAt,
		); err != nil {
			return nil, err
		}

		if reviewedAt.Valid {
			t := reviewedAt.Time
			upload.ReviewedAt = &t
		}

		uploads = append(uploads, upload)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return uploads, nil
}
