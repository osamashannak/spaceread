package database

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/osamashannak/uaeu-space/services/internal/professor/ranking"
)

const (
	reviewRankingLockID = 775001170011
	laneSize            = int64(1 << 61)
)

type reviewRankingRow struct {
	input     ranking.Review
	createdAt time.Time
}

func (db *ProfessorDB) RecomputeReviewSortIndex(ctx context.Context, reviewID int64, now time.Time) (bool, error) {
	row, err := db.getReviewRankingRow(ctx, reviewID, now)
	if err != nil {
		return false, err
	}
	if row == nil {
		return false, nil
	}

	result := ranking.Compute(row.input)
	_, err = db.Db.Pool.Exec(ctx,
		`UPDATE professor.review
		 SET sort_index = $2
		 WHERE id = $1 AND deleted_at IS NULL`,
		reviewID, result.SortIndex)
	if err != nil {
		return false, err
	}

	return true, nil
}

func (db *ProfessorDB) RecomputeReviewAndBurstSortIndexes(ctx context.Context, reviewID int64, now time.Time) (int, error) {
	row, err := db.getReviewRankingRow(ctx, reviewID, now)
	if err != nil {
		return 0, err
	}
	if row == nil {
		return 0, nil
	}

	ids := []int64{reviewID}
	if row.input.Score == 1 || row.input.Score == 5 {
		burstIDs, err := db.getBurstReviewIDs(ctx, row.input.ProfessorEmail, row.input.Score, row.createdAt)
		if err != nil {
			return 0, err
		}
		ids = appendUniqueReviewIDs(ids, burstIDs...)
	}

	return db.RecomputeReviewSortIndexes(ctx, ids, now)
}

func (db *ProfessorDB) RecomputeReviewSortIndexes(ctx context.Context, reviewIDs []int64, now time.Time) (int, error) {
	count := 0
	for _, reviewID := range reviewIDs {
		updated, err := db.RecomputeReviewSortIndex(ctx, reviewID, now)
		if err != nil {
			return count, err
		}
		if updated {
			count++
		}
	}
	return count, nil
}

func (db *ProfessorDB) GetReviewSortIndex(ctx context.Context, reviewID int64) (int64, bool, error) {
	var sortIndex int64
	err := db.Db.Pool.QueryRow(ctx,
		`SELECT sort_index
		 FROM professor.review
		 WHERE id = $1 AND deleted_at IS NULL`,
		reviewID).Scan(&sortIndex)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, false, nil
		}
		return 0, false, err
	}
	return sortIndex, true, nil
}

func (db *ProfessorDB) ListReviewIDsForRankingBackfill(ctx context.Context, afterID int64, limit int) ([]int64, error) {
	return db.listReviewIDs(ctx,
		`SELECT id
		 FROM professor.review
		 WHERE deleted_at IS NULL AND id > $1
		 ORDER BY id
		 LIMIT $2`,
		afterID, limit)
}

func (db *ProfessorDB) ListReviewIDsForRankingRefresh(ctx context.Context, afterID int64, limit int) ([]int64, error) {
	return db.listReviewIDs(ctx,
		`SELECT id
		 FROM professor.review
		 WHERE deleted_at IS NULL
		   AND id > $1
		   AND (
		       created_at >= NOW() - INTERVAL '8 days'
		       OR (sort_index >= $2 AND sort_index < $3)
		   )
		 ORDER BY id
		 LIMIT $4`,
		afterID, 2*laneSize, 3*laneSize, limit)
}

func (db *ProfessorDB) TryAcquireReviewRankingLock(ctx context.Context) (func(context.Context) error, bool, error) {
	tx, err := db.Db.Pool.Begin(ctx)
	if err != nil {
		return nil, false, err
	}

	var locked bool
	if err := tx.QueryRow(ctx, `SELECT pg_try_advisory_xact_lock($1)`, reviewRankingLockID).Scan(&locked); err != nil {
		_ = tx.Rollback(ctx)
		return nil, false, err
	}

	if !locked {
		_ = tx.Rollback(ctx)
		return nil, false, nil
	}

	unlock := func(ctx context.Context) error {
		return tx.Rollback(ctx)
	}
	return unlock, true, nil
}

func (db *ProfessorDB) getReviewRankingRow(ctx context.Context, reviewID int64, now time.Time) (*reviewRankingRow, error) {
	var (
		row             reviewRankingRow
		courseTaken     *string
		gradeReceived   *string
		attachment      bool
		gif             bool
		reportCount     int
		burstSiblingCnt int
	)

	err := db.Db.Pool.QueryRow(ctx,
		`SELECT
		     r.id,
		     r.score,
		     r.content,
		     r.professor_email,
		     r.course_taken,
		     r.grade_received,
		     r.created_at,
		     r.visible,
		     r.uaeu_origin,
		     r.attachment IS NOT NULL,
		     r.gif IS NOT NULL,
		     r.like_count,
		     r.dislike_count,
		     r.reply_count,
		     COALESCE(reports.report_count, 0),
		     COALESCE(burst.burst_sibling_count, 0)
		 FROM professor.review r
		 LEFT JOIN LATERAL (
		     SELECT COUNT(*)::int AS report_count
		     FROM professor.review_report rr
		     WHERE rr.review_id = r.id
		 ) reports ON true
		 LEFT JOIN LATERAL (
		     SELECT COUNT(*)::int AS burst_sibling_count
		     FROM professor.review b
		     WHERE b.professor_email = r.professor_email
		       AND b.score = r.score
		       AND b.id <> r.id
		       AND b.deleted_at IS NULL
		       AND b.created_at >= r.created_at - INTERVAL '12 hours'
		       AND b.created_at < r.created_at + INTERVAL '12 hours'
		 ) burst ON true
		 WHERE r.id = $1 AND r.deleted_at IS NULL`,
		reviewID).Scan(
		&row.input.ID,
		&row.input.Score,
		&row.input.Content,
		&row.input.ProfessorEmail,
		&courseTaken,
		&gradeReceived,
		&row.createdAt,
		&row.input.Visible,
		&row.input.UaeuOrigin,
		&attachment,
		&gif,
		&row.input.LikeCount,
		&row.input.DislikeCount,
		&row.input.ReplyCount,
		&reportCount,
		&burstSiblingCnt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	row.input.CourseTaken = courseTaken
	row.input.GradeReceived = gradeReceived
	row.input.HasAttachment = attachment
	row.input.HasGif = gif
	row.input.ReportCount = reportCount
	row.input.BurstSiblingCount = burstSiblingCnt
	row.input.CreatedAtUnixHour = unixHour(row.createdAt)
	row.input.NowUnixHour = unixHour(now)

	return &row, nil
}

func (db *ProfessorDB) getBurstReviewIDs(ctx context.Context, professorEmail string, score int, createdAt time.Time) ([]int64, error) {
	rows, err := db.Db.Pool.Query(ctx,
		`SELECT id
		 FROM professor.review
		 WHERE professor_email = $1
		   AND score = $2
		   AND deleted_at IS NULL
		   AND created_at >= $3::timestamp - INTERVAL '12 hours'
		   AND created_at < $3::timestamp + INTERVAL '12 hours'`,
		professorEmail, score, createdAt)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (db *ProfessorDB) listReviewIDs(ctx context.Context, query string, args ...any) ([]int64, error) {
	rows, err := db.Db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func appendUniqueReviewIDs(ids []int64, more ...int64) []int64 {
	seen := make(map[int64]struct{}, len(ids)+len(more))
	for _, id := range ids {
		seen[id] = struct{}{}
	}
	for _, id := range more {
		if _, ok := seen[id]; ok {
			continue
		}
		ids = append(ids, id)
		seen[id] = struct{}{}
	}
	return ids
}

func unixHour(value time.Time) int64 {
	return value.Unix() / int64(time.Hour/time.Second)
}
