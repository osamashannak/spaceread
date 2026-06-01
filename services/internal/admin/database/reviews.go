package database

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

var ErrNotFound = errors.New("admin target not found")

type ListReviewOptions struct {
	Limit          int
	Offset         int
	IncludeDeleted bool
}

type ReviewVisibilityDecision struct {
	ReviewID       int64
	Visible        bool
	ActorUserID    *int64
	ReasonCode     *string
	Note           *string
	ResolveReports bool
}

type AttachmentVisibilityDecision struct {
	AttachmentID int64
	Visible      bool
	ActorUserID  *int64
	ReasonCode   *string
	Note         *string
}

type ReviewNoteDecision struct {
	ReviewID    int64
	ActorUserID *int64
	Note        *string
}

type DecisionResult struct {
	Review              *v1.AdminReview
	ResolvedReportCount int64
	Action              string
}

func (db *AdminDB) ListReasons(ctx context.Context) ([]v1.AdminReason, error) {
	rows, err := db.db.Pool.Query(ctx, `
		SELECT code, label, policy_area, policy_reference, active, sort_order
		FROM moderation.reason
		ORDER BY sort_order, code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	reasons := make([]v1.AdminReason, 0)
	for rows.Next() {
		var reason v1.AdminReason
		if err := rows.Scan(
			&reason.Code,
			&reason.Label,
			&reason.PolicyArea,
			&reason.PolicyReference,
			&reason.Active,
			&reason.SortOrder,
		); err != nil {
			return nil, err
		}
		reasons = append(reasons, reason)
	}

	return reasons, rows.Err()
}

func (db *AdminDB) ReasonExists(ctx context.Context, code string) (bool, error) {
	var exists bool
	err := db.db.Pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM moderation.reason WHERE code = $1 AND active)`, code).
		Scan(&exists)
	return exists, err
}

func (db *AdminDB) ListReviews(ctx context.Context, opts ListReviewOptions) ([]v1.AdminReview, error) {
	ids, err := db.listReviewIDs(ctx, opts)
	if err != nil {
		return nil, err
	}

	return db.loadReviews(ctx, ids)
}

func (db *AdminDB) GetReview(ctx context.Context, id int64) (*v1.AdminReview, error) {
	reviews, err := db.loadReviews(ctx, []int64{id})
	if err != nil {
		return nil, err
	}
	if len(reviews) == 0 {
		return nil, nil
	}
	return &reviews[0], nil
}

func (db *AdminDB) SetReviewVisibility(ctx context.Context, decision ReviewVisibilityDecision) (*DecisionResult, error) {
	tx, err := db.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var (
		previousVisible bool
		previousState   []byte
		nextState       []byte
	)

	err = tx.QueryRow(ctx, `
		WITH current AS (
			SELECT id, visible, reviewed, reviewed_at, reviewer_user_id, moderation_reason_code, moderation_note
			FROM professor.review
			WHERE id = $1 AND deleted_at IS NULL
			FOR UPDATE
		),
		updated AS (
			UPDATE professor.review r
			SET
				visible = $2,
				reviewed = true,
				reviewed_at = now(),
				reviewer_user_id = $3,
				moderation_reason_code = $4,
				moderation_note = $5
			FROM current
			WHERE r.id = current.id
			RETURNING
				current.visible AS previous_visible,
				jsonb_build_object(
					'visible', current.visible,
					'reviewed', current.reviewed,
					'reviewed_at', current.reviewed_at,
					'reviewer_user_id', current.reviewer_user_id,
					'moderation_reason_code', current.moderation_reason_code,
					'moderation_note', current.moderation_note
				) AS previous_state,
				jsonb_build_object(
					'visible', r.visible,
					'reviewed', r.reviewed,
					'reviewed_at', r.reviewed_at,
					'reviewer_user_id', r.reviewer_user_id,
					'moderation_reason_code', r.moderation_reason_code,
					'moderation_note', r.moderation_note
				) AS next_state
		)
		SELECT previous_visible, previous_state, next_state
		FROM updated`,
		decision.ReviewID,
		decision.Visible,
		decision.ActorUserID,
		decision.ReasonCode,
		decision.Note,
	).Scan(&previousVisible, &previousState, &nextState)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	action := reviewVisibilityAction(previousVisible, decision.Visible)
	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   decision.ActorUserID,
		TargetType:    "professor_review",
		TargetID:      strconv.FormatInt(decision.ReviewID, 10),
		Action:        action,
		ReasonCode:    decision.ReasonCode,
		Note:          decision.Note,
		PreviousState: previousState,
		NextState:     nextState,
	}); err != nil {
		return nil, err
	}

	var resolvedCount int64
	if decision.ResolveReports {
		resolutionAction := "review_kept_visible"
		if !decision.Visible {
			resolutionAction = "review_hidden"
		} else if !previousVisible {
			resolutionAction = "review_restored"
		}

		resolvedCount, err = resolveOpenReviewReports(ctx, tx, decision, resolutionAction)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	review, err := db.GetReview(ctx, decision.ReviewID)
	if err != nil {
		return nil, err
	}
	if review == nil {
		return nil, ErrNotFound
	}

	return &DecisionResult{
		Review:              review,
		ResolvedReportCount: resolvedCount,
		Action:              action,
	}, nil
}

func (db *AdminDB) SetAttachmentVisibility(ctx context.Context, decision AttachmentVisibilityDecision) (*DecisionResult, error) {
	tx, err := db.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var (
		reviewID      int64
		previousState []byte
		nextState     []byte
	)

	err = tx.QueryRow(ctx, `
		WITH current AS (
			SELECT id, visible, reviewed, reviewed_at, reviewer_user_id, moderation_reason_code, moderation_note
			FROM professor.review_attachment
			WHERE id = $1
			FOR UPDATE
		),
		updated AS (
			UPDATE professor.review_attachment a
			SET
				visible = $2,
				reviewed = true,
				reviewed_at = now(),
				reviewer_user_id = $3,
				moderation_reason_code = $4,
				moderation_note = $5
			FROM current
			WHERE a.id = current.id
			RETURNING
				jsonb_build_object(
					'visible', current.visible,
					'reviewed', current.reviewed,
					'reviewed_at', current.reviewed_at,
					'reviewer_user_id', current.reviewer_user_id,
					'moderation_reason_code', current.moderation_reason_code,
					'moderation_note', current.moderation_note
				) AS previous_state,
				jsonb_build_object(
					'visible', a.visible,
					'reviewed', a.reviewed,
					'reviewed_at', a.reviewed_at,
					'reviewer_user_id', a.reviewer_user_id,
					'moderation_reason_code', a.moderation_reason_code,
					'moderation_note', a.moderation_note
				) AS next_state
		)
		SELECT r.id, updated.previous_state, updated.next_state
		FROM updated
		JOIN professor.review r ON r.attachment = $1
		LIMIT 1`,
		decision.AttachmentID,
		decision.Visible,
		decision.ActorUserID,
		decision.ReasonCode,
		decision.Note,
	).Scan(&reviewID, &previousState, &nextState)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	action := "hide"
	if decision.Visible {
		action = "restore"
	}

	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   decision.ActorUserID,
		TargetType:    "review_attachment",
		TargetID:      strconv.FormatInt(decision.AttachmentID, 10),
		Action:        action,
		ReasonCode:    decision.ReasonCode,
		Note:          decision.Note,
		PreviousState: previousState,
		NextState:     nextState,
	}); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	review, err := db.GetReview(ctx, reviewID)
	if err != nil {
		return nil, err
	}
	if review == nil {
		return nil, ErrNotFound
	}

	return &DecisionResult{
		Review: review,
		Action: action,
	}, nil
}

func (db *AdminDB) SaveReviewNote(ctx context.Context, decision ReviewNoteDecision) (*DecisionResult, error) {
	tx, err := db.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var (
		previousState []byte
		nextState     []byte
	)

	err = tx.QueryRow(ctx, `
		WITH current AS (
			SELECT id, moderation_note
			FROM professor.review
			WHERE id = $1 AND deleted_at IS NULL
			FOR UPDATE
		),
		updated AS (
			UPDATE professor.review r
			SET
				moderation_note = $2,
				reviewer_user_id = $3
			FROM current
			WHERE r.id = current.id
			RETURNING
				jsonb_build_object('moderation_note', current.moderation_note) AS previous_state,
				jsonb_build_object('moderation_note', r.moderation_note, 'reviewer_user_id', r.reviewer_user_id) AS next_state
		)
		SELECT previous_state, next_state
		FROM updated`,
		decision.ReviewID,
		decision.Note,
		decision.ActorUserID,
	).Scan(&previousState, &nextState)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   decision.ActorUserID,
		TargetType:    "professor_review",
		TargetID:      strconv.FormatInt(decision.ReviewID, 10),
		Action:        "note",
		Note:          decision.Note,
		PreviousState: previousState,
		NextState:     nextState,
	}); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	review, err := db.GetReview(ctx, decision.ReviewID)
	if err != nil {
		return nil, err
	}
	if review == nil {
		return nil, ErrNotFound
	}

	return &DecisionResult{
		Review: review,
		Action: "note",
	}, nil
}

func (db *AdminDB) listReviewIDs(ctx context.Context, opts ListReviewOptions) ([]int64, error) {
	rows, err := db.db.Pool.Query(ctx, `
		WITH signal_source AS (
			SELECT target_id
			FROM moderation.signal
			WHERE target_type = 'professor_review'
			UNION ALL
			SELECT review_id::text
			FROM professor.review_flag
		),
		signal_counts AS (
			SELECT target_id, count(*) AS signal_count
			FROM signal_source
			GROUP BY target_id
		),
		report_counts AS (
			SELECT
				review_id,
				count(*) FILTER (WHERE resolved = false) AS open_report_count
			FROM professor.review_report
			GROUP BY review_id
		)
		SELECT r.id
		FROM professor.review r
		LEFT JOIN report_counts rc ON rc.review_id = r.id
		LEFT JOIN signal_counts sc ON sc.target_id = r.id::text
		WHERE ($3::boolean OR r.deleted_at IS NULL)
		  AND NOT (r.visible = false AND r.reviewed = true)
		  AND (r.reviewed = false OR COALESCE(rc.open_report_count, 0) > 0)
		ORDER BY
			COALESCE(rc.open_report_count, 0) DESC,
			COALESCE(sc.signal_count, 0) DESC,
			r.created_at DESC
		LIMIT $1 OFFSET $2`,
		opts.Limit,
		opts.Offset,
		opts.IncludeDeleted,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}

	return ids, rows.Err()
}

func (db *AdminDB) loadReviews(ctx context.Context, ids []int64) ([]v1.AdminReview, error) {
	if len(ids) == 0 {
		return []v1.AdminReview{}, nil
	}

	rows, err := db.db.Pool.Query(ctx, `
		SELECT
			r.sort_index,
			r.id,
			r.professor_email,
			COALESCE(p.name, r.professor_email) AS professor_name,
			p.college,
			p.university,
			r.score,
			r.positive,
			r.content,
			r.created_at,
			r.language,
			r.like_count,
			r.dislike_count,
			r.reply_count,
			r.grade_received,
			r.course_taken,
			r.gif,
			r.visible,
			r.reviewed,
			r.reviewed_at,
			r.reviewer_user_id,
			r.deleted_at,
			r.uaeu_origin,
			r.student_verified,
			r.session_id,
			r.user_id,
			r.ip_address::text,
			r.moderation_reason_code,
			r.moderation_note,
			a.id,
			a.mime_type,
			a.size,
			a.width,
			a.height,
			COALESCE(a.visible, false),
			a.reviewed,
			a.reviewed_at,
			a.reviewer_user_id,
			a.moderation_reason_code,
			a.moderation_note,
			a.created_at,
			a.blob_name,
			a.ip_address::text
		FROM professor.review r
		LEFT JOIN professor.professor p ON p.email = r.professor_email
		LEFT JOIN professor.review_attachment a ON a.id = r.attachment
		WHERE r.id = ANY($1::bigint[])`,
		ids,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	reviewsByID := make(map[int64]*v1.AdminReview, len(ids))
	for rows.Next() {
		var (
			review v1.AdminReview

			attachmentID                   *int64
			attachmentMimeType             *string
			attachmentSize                 *int
			attachmentWidth                *int
			attachmentHeight               *int
			attachmentVisible              *bool
			attachmentReviewed             *bool
			attachmentReviewedAt           *time.Time
			attachmentReviewerUserID       *int64
			attachmentModerationReasonCode *string
			attachmentModerationNote       *string
			attachmentCreatedAt            *time.Time
			attachmentBlobName             *string
			attachmentIPAddress            *string
		)

		if err := rows.Scan(
			&review.SortIndex,
			&review.ID,
			&review.ProfessorEmail,
			&review.ProfessorName,
			&review.ProfessorCollege,
			&review.ProfessorUniversity,
			&review.Score,
			&review.Positive,
			&review.Text,
			&review.CreatedAt,
			&review.Language,
			&review.LikeCount,
			&review.DislikeCount,
			&review.ReplyCount,
			&review.GradeReceived,
			&review.CourseTaken,
			&review.Gif,
			&review.Visible,
			&review.Reviewed,
			&review.ReviewedAt,
			&review.ReviewerUserID,
			&review.DeletedAt,
			&review.UaeuOrigin,
			&review.StudentVerified,
			&review.SessionID,
			&review.UserID,
			&review.IPAddress,
			&review.ModerationReasonCode,
			&review.ModerationNote,
			&attachmentID,
			&attachmentMimeType,
			&attachmentSize,
			&attachmentWidth,
			&attachmentHeight,
			&attachmentVisible,
			&attachmentReviewed,
			&attachmentReviewedAt,
			&attachmentReviewerUserID,
			&attachmentModerationReasonCode,
			&attachmentModerationNote,
			&attachmentCreatedAt,
			&attachmentBlobName,
			&attachmentIPAddress,
		); err != nil {
			return nil, err
		}

		review.Reports = []v1.AdminReviewReport{}
		review.Replies = []v1.AdminReviewReply{}
		review.Ratings = []v1.AdminReviewRating{}
		review.Signals = []v1.AdminModerationSignal{}
		review.ActionHistory = []v1.AdminModerationAction{}

		if attachmentID != nil && attachmentMimeType != nil && attachmentSize != nil && attachmentWidth != nil && attachmentHeight != nil && attachmentVisible != nil && attachmentReviewed != nil && attachmentCreatedAt != nil && attachmentBlobName != nil {
			review.Attachment = &v1.AdminReviewAttachment{
				ID:                   *attachmentID,
				MimeType:             *attachmentMimeType,
				Size:                 *attachmentSize,
				Width:                *attachmentWidth,
				Height:               *attachmentHeight,
				Visible:              *attachmentVisible,
				Reviewed:             *attachmentReviewed,
				ReviewedAt:           attachmentReviewedAt,
				ReviewerUserID:       attachmentReviewerUserID,
				ModerationReasonCode: attachmentModerationReasonCode,
				ModerationNote:       attachmentModerationNote,
				CreatedAt:            *attachmentCreatedAt,
				URL:                  db.formatAttachmentURL(*attachmentBlobName),
				BlobName:             *attachmentBlobName,
				IPAddress:            attachmentIPAddress,
			}
		}

		reviewsByID[review.ID] = &review
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := db.attachReports(ctx, ids, reviewsByID); err != nil {
		return nil, err
	}
	if err := db.attachReplies(ctx, ids, reviewsByID); err != nil {
		return nil, err
	}
	if err := db.attachRatings(ctx, ids, reviewsByID); err != nil {
		return nil, err
	}
	if err := db.attachSignals(ctx, ids, reviewsByID); err != nil {
		return nil, err
	}
	if err := db.attachActionHistory(ctx, ids, reviewsByID); err != nil {
		return nil, err
	}

	reviews := make([]v1.AdminReview, 0, len(ids))
	for _, id := range ids {
		if review, ok := reviewsByID[id]; ok {
			reviews = append(reviews, *review)
		}
	}

	return reviews, nil
}

func (db *AdminDB) attachReports(ctx context.Context, ids []int64, reviewsByID map[int64]*v1.AdminReview) error {
	rows, err := db.db.Pool.Query(ctx, `
		SELECT
			id,
			review_id,
			reason,
			session_id,
			user_id,
			created_at,
			resolved,
			resolved_at,
			resolver_user_id,
			resolution_action,
			resolution_reason_code,
			resolution_note
		FROM professor.review_report
		WHERE review_id = ANY($1::bigint[])
		ORDER BY resolved ASC, created_at DESC`,
		ids,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var report v1.AdminReviewReport
		if err := rows.Scan(
			&report.ID,
			&report.ReviewID,
			&report.Reason,
			&report.SessionID,
			&report.UserID,
			&report.CreatedAt,
			&report.Resolved,
			&report.ResolvedAt,
			&report.ResolverUserID,
			&report.ResolutionAction,
			&report.ResolutionReasonCode,
			&report.ResolutionNote,
		); err != nil {
			return err
		}
		if review, ok := reviewsByID[report.ReviewID]; ok {
			review.Reports = append(review.Reports, report)
		}
	}

	return rows.Err()
}

func (db *AdminDB) attachReplies(ctx context.Context, ids []int64, reviewsByID map[int64]*v1.AdminReview) error {
	rows, err := db.db.Pool.Query(ctx, `
		SELECT
			r.id,
			r.review_id,
			r.content,
			r.gif,
			r.visible,
			r.reviewed,
			r.reviewed_at,
			r.reviewer_user_id,
			r.moderation_reason_code,
			r.moderation_note,
			r.deleted_at,
			r.created_at,
			rn.name AS author,
			mentioned.name AS mention,
			r.op,
			r.like_count,
			r.session_id,
			r.user_id
		FROM professor.review_reply r
		LEFT JOIN professor.reply_name rn
			ON rn.review_id = r.review_id AND rn.session_id = r.session_id
		LEFT JOIN professor.review_reply mention_reply
			ON mention_reply.id = r.mention_id
		LEFT JOIN professor.reply_name mentioned
			ON mentioned.review_id = r.review_id AND mentioned.session_id = mention_reply.session_id
		WHERE r.review_id = ANY($1::bigint[])
		ORDER BY r.created_at ASC`,
		ids,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var reply v1.AdminReviewReply
		if err := rows.Scan(
			&reply.ID,
			&reply.ReviewID,
			&reply.Text,
			&reply.Gif,
			&reply.Visible,
			&reply.Reviewed,
			&reply.ReviewedAt,
			&reply.ReviewerUserID,
			&reply.ModerationReasonCode,
			&reply.ModerationNote,
			&reply.DeletedAt,
			&reply.CreatedAt,
			&reply.Author,
			&reply.Mention,
			&reply.Op,
			&reply.LikeCount,
			&reply.SessionID,
			&reply.UserID,
		); err != nil {
			return err
		}
		if review, ok := reviewsByID[reply.ReviewID]; ok {
			review.Replies = append(review.Replies, reply)
		}
	}

	return rows.Err()
}

func (db *AdminDB) attachRatings(ctx context.Context, ids []int64, reviewsByID map[int64]*v1.AdminReview) error {
	rows, err := db.db.Pool.Query(ctx, `
		SELECT
			review_id,
			CASE WHEN value = true THEN 'like' ELSE 'dislike' END AS value,
			session_id,
			user_id,
			ip_address::text,
			created_at
		FROM professor.review_rating
		WHERE review_id = ANY($1::bigint[])
		ORDER BY created_at DESC`,
		ids,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var rating v1.AdminReviewRating
		if err := rows.Scan(
			&rating.ReviewID,
			&rating.Value,
			&rating.SessionID,
			&rating.UserID,
			&rating.IPAddress,
			&rating.CreatedAt,
		); err != nil {
			return err
		}
		if review, ok := reviewsByID[rating.ReviewID]; ok {
			review.Ratings = append(review.Ratings, rating)
		}
	}

	return rows.Err()
}

func (db *AdminDB) attachSignals(ctx context.Context, ids []int64, reviewsByID map[int64]*v1.AdminReview) error {
	targetIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		targetIDs = append(targetIDs, strconv.FormatInt(id, 10))
	}

	rows, err := db.db.Pool.Query(ctx, `
		SELECT
			id,
			target_type,
			target_id,
			source,
			attribute,
			score,
			threshold,
			severity,
			payload,
			created_at
		FROM moderation.signal
		WHERE target_type = 'professor_review'
		  AND target_id = ANY($1::text[])
		ORDER BY created_at DESC`,
		targetIDs,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			signal  v1.AdminModerationSignal
			payload []byte
		)
		if err := rows.Scan(
			&signal.ID,
			&signal.TargetType,
			&signal.TargetID,
			&signal.Source,
			&signal.Attribute,
			&signal.Score,
			&signal.Threshold,
			&signal.Severity,
			&payload,
			&signal.CreatedAt,
		); err != nil {
			return err
		}
		signal.Payload = rawJSONPtr(payload)
		attachSignal(reviewsByID, signal)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	legacyRows, err := db.db.Pool.Query(ctx, `
		SELECT
			review_id::text AS target_id,
			attribute,
			score,
			engine,
			created_at
		FROM professor.review_flag
		WHERE review_id = ANY($1::bigint[])
		ORDER BY created_at DESC`,
		ids,
	)
	if err != nil {
		return err
	}
	defer legacyRows.Close()

	for legacyRows.Next() {
		var signal v1.AdminModerationSignal
		if err := legacyRows.Scan(
			&signal.TargetID,
			&signal.Attribute,
			&signal.Score,
			&signal.Source,
			&signal.CreatedAt,
		); err != nil {
			return err
		}
		signal.TargetType = "professor_review"
		attachSignal(reviewsByID, signal)
	}

	return legacyRows.Err()
}

func (db *AdminDB) attachActionHistory(ctx context.Context, ids []int64, reviewsByID map[int64]*v1.AdminReview) error {
	targetIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		targetIDs = append(targetIDs, strconv.FormatInt(id, 10))
	}

	rows, err := db.db.Pool.Query(ctx, `
		SELECT
			id,
			actor_user_id,
			target_type,
			target_id,
			action,
			reason_code,
			note,
			previous_state,
			next_state,
			created_at
		FROM moderation.action_log
		WHERE target_type = 'professor_review'
		  AND target_id = ANY($1::text[])
		ORDER BY created_at DESC`,
		targetIDs,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			action        v1.AdminModerationAction
			previousState []byte
			nextState     []byte
		)
		if err := rows.Scan(
			&action.ID,
			&action.ActorUserID,
			&action.TargetType,
			&action.TargetID,
			&action.Action,
			&action.ReasonCode,
			&action.Note,
			&previousState,
			&nextState,
			&action.CreatedAt,
		); err != nil {
			return err
		}
		action.PreviousState = rawJSONPtr(previousState)
		action.NextState = rawJSONPtr(nextState)

		reviewID, err := strconv.ParseInt(action.TargetID, 10, 64)
		if err != nil {
			return fmt.Errorf("parse action target id %q: %w", action.TargetID, err)
		}
		if review, ok := reviewsByID[reviewID]; ok {
			review.ActionHistory = append(review.ActionHistory, action)
		}
	}

	return rows.Err()
}

type actionLogInput struct {
	ActorUserID   *int64
	TargetType    string
	TargetID      string
	Action        string
	ReasonCode    *string
	Note          *string
	PreviousState []byte
	NextState     []byte
}

type txRunner interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

func insertActionLog(ctx context.Context, tx txRunner, input actionLogInput) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO moderation.action_log (
			actor_user_id,
			target_type,
			target_id,
			action,
			reason_code,
			note,
			previous_state,
			next_state
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
		input.ActorUserID,
		input.TargetType,
		input.TargetID,
		input.Action,
		input.ReasonCode,
		input.Note,
		jsonbParam(input.PreviousState),
		jsonbParam(input.NextState),
	)
	return err
}

func resolveOpenReviewReports(ctx context.Context, tx txRunner, decision ReviewVisibilityDecision, resolutionAction string) (int64, error) {
	tag, err := tx.Exec(ctx, `
		WITH targets AS (
			SELECT
				id,
				jsonb_build_object(
					'resolved', resolved,
					'resolved_at', resolved_at,
					'resolver_user_id', resolver_user_id,
					'resolution_action', resolution_action,
					'resolution_reason_code', resolution_reason_code,
					'resolution_note', resolution_note
				) AS previous_state
			FROM professor.review_report
			WHERE review_id = $1 AND resolved = false
			FOR UPDATE
		),
		updated AS (
			UPDATE professor.review_report rr
			SET
				resolved = true,
				resolved_at = now(),
				resolver_user_id = $2,
				resolution_action = $3,
				resolution_reason_code = $4,
				resolution_note = $5
			FROM targets
			WHERE rr.id = targets.id
			RETURNING
				rr.id,
				targets.previous_state,
				jsonb_build_object(
					'resolved', rr.resolved,
					'resolved_at', rr.resolved_at,
					'resolver_user_id', rr.resolver_user_id,
					'resolution_action', rr.resolution_action,
					'resolution_reason_code', rr.resolution_reason_code,
					'resolution_note', rr.resolution_note
				) AS next_state
		)
		INSERT INTO moderation.action_log (
			actor_user_id,
			target_type,
			target_id,
			action,
			reason_code,
			note,
			previous_state,
			next_state
		)
		SELECT
			$2,
			'review_report',
			id::text,
			'resolve',
			$4,
			$5,
			previous_state,
			next_state
		FROM updated`,
		decision.ReviewID,
		decision.ActorUserID,
		resolutionAction,
		decision.ReasonCode,
		decision.Note,
	)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func reviewVisibilityAction(previousVisible, nextVisible bool) string {
	if nextVisible {
		if previousVisible {
			return "approve"
		}
		return "restore"
	}
	return "hide"
}

func rawJSONPtr(data []byte) *json.RawMessage {
	if len(data) == 0 {
		return nil
	}
	msg := json.RawMessage(data)
	return &msg
}

func jsonbParam(data []byte) any {
	if len(data) == 0 {
		return nil
	}
	return string(data)
}

func attachSignal(reviewsByID map[int64]*v1.AdminReview, signal v1.AdminModerationSignal) {
	reviewID, err := strconv.ParseInt(signal.TargetID, 10, 64)
	if err != nil {
		return
	}
	if review, ok := reviewsByID[reviewID]; ok {
		review.Signals = append(review.Signals, signal)
	}
}
