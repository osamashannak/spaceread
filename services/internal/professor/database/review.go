package database

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/osamashannak/uaeu-space/services/internal/professor/model"
)

func (db *ProfessorDB) GetReview(ctx context.Context, id int64) (*model.Review, error) {
	var review model.Review

	err := db.Db.Pool.QueryRow(ctx,
		`SELECT id, score, positive, content, attachment, professor_email, session_id, user_id, language
		 FROM professor.review WHERE id = $1 AND deleted_at IS NULL`, id).Scan(
		&review.ID,
		&review.Score,
		&review.Positive,
		&review.Content,
		&review.Attachment,
		&review.ProfessorEmail,
		&review.SessionId,
		&review.UserId,
		&review.Language)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &review, nil
}

func (db *ProfessorDB) ExistsReviewIdentity(ctx context.Context, email string, sessionId int64, userId *int64) (bool, error) {
	var exists bool

	err := db.Db.Pool.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1
			FROM professor.review
			WHERE professor_email = $1
			  AND deleted_at IS NULL
			  AND (session_id = $2 OR ($3::bigint IS NOT NULL AND user_id = $3))
		)`, email, sessionId, userId).Scan(&exists)
	if err != nil {
		return false, err
	}

	return exists, nil
}

func (db *ProfessorDB) InsertReview(ctx context.Context, review *model.Review) error {
	_, err := db.Db.Pool.Exec(ctx,
		`INSERT INTO professor.review (
			sort_index, id, score, positive, content, attachment, professor_email, ip_address, session_id, user_id,
			visible, uaeu_origin, language, created_at, gif, grade_received, course_taken,
			browser_fingerprint, thumbmark_fingerprint, creep_fingerprint
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20)`,
		review.SortIndex,
		review.ID,
		review.Score,
		review.Positive,
		review.Content,
		review.Attachment,
		review.ProfessorEmail,
		review.IpAddress,
		review.SessionId,
		review.UserId,
		review.Visible,
		review.UaeuOrigin,
		review.Language,
		review.CreatedAt,
		review.Gif,
		review.GradeReceived,
		review.CourseTaken,
		review.BrowserFingerprint,
		review.ThumbmarkFingerprint,
		review.CreepFingerprint)
	return err
}

func (db *ProfessorDB) SoftDeleteReview(ctx context.Context, reviewId int64) error {
	_, err := db.Db.Pool.Exec(ctx,
		`UPDATE professor.review SET deleted_at = now() WHERE id = $1`, reviewId)
	return err
}

func (db *ProfessorDB) GetTranslatedReview(ctx context.Context, reviewId int64) (*model.ReviewTranslation, error) {
	var translation model.ReviewTranslation

	err := db.Db.Pool.QueryRow(ctx,
		`SELECT review_id, target, translated_text, created_at
		 FROM professor.review_translation WHERE review_id = $1`, reviewId).Scan(
		&translation.ReviewId,
		&translation.Target,
		&translation.TranslatedText,
		&translation.CreatedAt)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &translation, nil
}

func (db *ProfessorDB) InsertReviewTranslation(ctx context.Context, translation *model.ReviewTranslation) error {
	_, err := db.Db.Pool.Exec(ctx,
		`INSERT INTO professor.review_translation (review_id, target, translated_text)
			VALUES ($1, $2, $3)`,
		translation.ReviewId, translation.Target, translation.TranslatedText)
	return err
}

func (db *ProfessorDB) InsertReviewReport(ctx context.Context, report *model.ReviewReport) error {
	_, err := db.Db.Pool.Exec(ctx,
		`INSERT INTO professor.review_report (id, review_id, reason, session_id)
			VALUES ($1, $2, $3, $4)`,
		report.ID, report.ReviewId, report.Reason, report.SessionId)
	return err
}

func (db *ProfessorDB) InsertReviewAttachment(ctx context.Context, attachment *model.ReviewAttachment) error {
	_, err := db.Db.Pool.Exec(ctx,
		`INSERT INTO professor.review_attachment (id, mime_type, size, width, height, visible, blob_name)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		attachment.ID, attachment.MimeType, attachment.Size, attachment.Width, attachment.Height, attachment.Visible, attachment.BlobName)
	return err
}

func (db *ProfessorDB) GetReviewAttachment(ctx context.Context, attachmentId int64) (*model.ReviewAttachment, error) {
	var attachment model.ReviewAttachment

	err := db.Db.Pool.QueryRow(ctx,
		`SELECT id, mime_type, size, width, height, visible, blob_name
		 FROM professor.review_attachment WHERE id = $1`, attachmentId).Scan(
		&attachment.ID,
		&attachment.MimeType,
		&attachment.Size,
		&attachment.Width,
		&attachment.Height,
		&attachment.Visible,
		&attachment.BlobName)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &attachment, nil
}

func (db *ProfessorDB) ExistsReviewRatingFromIdentity(ctx context.Context, reviewId, sessionId int64, userId *int64) (*bool, error) {
	var exists bool

	err := db.Db.Pool.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1
			FROM professor.review_rating
			WHERE review_id = $1
			  AND (session_id = $2 OR ($3::bigint IS NOT NULL AND user_id = $3))
		)`, reviewId, sessionId, userId).Scan(&exists)

	if err != nil {
		return nil, err
	}

	return &exists, nil
}

func (db *ProfessorDB) InsertReviewRating(ctx context.Context, rating *model.ReviewRating) error {
	_, err := db.Db.Pool.Exec(ctx,
		`INSERT INTO professor.review_rating (value, ip_address, review_id, session_id, user_id)
		 VALUES ($1, $2, $3, $4, $5)`,
		rating.Value, rating.IpAddress, rating.ReviewId, rating.SessionId, rating.UserId)
	return err
}

func (db *ProfessorDB) DeleteReviewRating(ctx context.Context, reviewId int64, sessionId int64, userId *int64) error {
	_, err := db.Db.Pool.Exec(ctx,
		`DELETE FROM professor.review_rating
		 WHERE review_id = $1
		   AND (session_id = $2 OR ($3::bigint IS NOT NULL AND user_id = $3))`, reviewId, sessionId, userId)
	return err
}
