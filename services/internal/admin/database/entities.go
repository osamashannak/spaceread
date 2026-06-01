package database

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

const entityActivityLimit = 30

type ReviewReplyVisibilityDecision struct {
	ReplyID     int64
	Visible     bool
	ActorUserID *int64
	ReasonCode  *string
	Note        *string
}

type ReviewReplyReviewDecision struct {
	ReplyID     int64
	ActorUserID *int64
	ReasonCode  *string
	Note        *string
}

type ReviewReplyNoteDecision struct {
	ReplyID     int64
	ActorUserID *int64
	Note        *string
}

type ReplyDecisionResult struct {
	Review *v1.AdminReview
	Reply  *v1.AdminReviewReply
	Action string
}

func (db *AdminDB) GetReviewReplyDetail(ctx context.Context, id int64) (*v1.AdminReviewReplyResponse, error) {
	reply, err := db.getReviewReply(ctx, id)
	if err != nil {
		return nil, err
	}
	if reply == nil {
		return nil, nil
	}

	review, err := db.GetReview(ctx, reply.ReviewID)
	if err != nil {
		return nil, err
	}
	if review == nil {
		return nil, ErrNotFound
	}

	likes, err := db.listReplyLikes(ctx, "rl.reply_id = $1", id)
	if err != nil {
		return nil, err
	}
	signals, err := db.listSignalsForTargets(ctx, []string{"review_reply"}, [][]string{{strconv.FormatInt(id, 10)}})
	if err != nil {
		return nil, err
	}
	actions, err := db.listActionsForTargets(ctx, []string{"review_reply"}, [][]string{{strconv.FormatInt(id, 10)}}, nil)
	if err != nil {
		return nil, err
	}

	return &v1.AdminReviewReplyResponse{
		Reply:         *reply,
		ParentReview:  *review,
		Likes:         likes,
		Signals:       signals,
		ActionHistory: actions,
	}, nil
}

func (db *AdminDB) SetReviewReplyVisibility(ctx context.Context, decision ReviewReplyVisibilityDecision) (*ReplyDecisionResult, error) {
	tx, err := db.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var (
		reviewID        int64
		previousVisible bool
		previousState   []byte
		nextState       []byte
	)

	err = tx.QueryRow(ctx, `
		WITH current AS (
			SELECT id, review_id, visible, reviewed, reviewed_at, reviewer_user_id, moderation_reason_code, moderation_note
			FROM professor.review_reply
			WHERE id = $1 AND deleted_at IS NULL
			FOR UPDATE
		),
		updated AS (
			UPDATE professor.review_reply r
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
				current.review_id,
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
		SELECT review_id, previous_visible, previous_state, next_state
		FROM updated`,
		decision.ReplyID,
		decision.Visible,
		decision.ActorUserID,
		decision.ReasonCode,
		decision.Note,
	).Scan(&reviewID, &previousVisible, &previousState, &nextState)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	action := reviewVisibilityAction(previousVisible, decision.Visible)
	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   decision.ActorUserID,
		TargetType:    "review_reply",
		TargetID:      strconv.FormatInt(decision.ReplyID, 10),
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

	return db.replyDecisionResult(ctx, reviewID, decision.ReplyID, action)
}

func (db *AdminDB) MarkReviewReplyReviewed(ctx context.Context, decision ReviewReplyReviewDecision) (*ReplyDecisionResult, error) {
	tx, err := db.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var (
		reviewID      int64
		visible       bool
		previousState []byte
		nextState     []byte
	)

	err = tx.QueryRow(ctx, `
		WITH current AS (
			SELECT id, review_id, visible, reviewed, reviewed_at, reviewer_user_id, moderation_reason_code, moderation_note
			FROM professor.review_reply
			WHERE id = $1 AND deleted_at IS NULL
			FOR UPDATE
		),
		updated AS (
			UPDATE professor.review_reply r
			SET
				reviewed = true,
				reviewed_at = now(),
				reviewer_user_id = $2,
				moderation_reason_code = $3,
				moderation_note = $4
			FROM current
			WHERE r.id = current.id
			RETURNING
				current.review_id,
				r.visible,
				jsonb_build_object(
					'reviewed', current.reviewed,
					'reviewed_at', current.reviewed_at,
					'reviewer_user_id', current.reviewer_user_id,
					'moderation_reason_code', current.moderation_reason_code,
					'moderation_note', current.moderation_note
				) AS previous_state,
				jsonb_build_object(
					'reviewed', r.reviewed,
					'reviewed_at', r.reviewed_at,
					'reviewer_user_id', r.reviewer_user_id,
					'moderation_reason_code', r.moderation_reason_code,
					'moderation_note', r.moderation_note
				) AS next_state
		)
		SELECT review_id, visible, previous_state, next_state
		FROM updated`,
		decision.ReplyID,
		decision.ActorUserID,
		decision.ReasonCode,
		decision.Note,
	).Scan(&reviewID, &visible, &previousState, &nextState)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	action := "reject"
	if visible {
		action = "approve"
	}
	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   decision.ActorUserID,
		TargetType:    "review_reply",
		TargetID:      strconv.FormatInt(decision.ReplyID, 10),
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

	return db.replyDecisionResult(ctx, reviewID, decision.ReplyID, action)
}

func (db *AdminDB) SaveReviewReplyNote(ctx context.Context, decision ReviewReplyNoteDecision) (*ReplyDecisionResult, error) {
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
			SELECT id, review_id, moderation_note
			FROM professor.review_reply
			WHERE id = $1 AND deleted_at IS NULL
			FOR UPDATE
		),
		updated AS (
			UPDATE professor.review_reply r
			SET
				moderation_note = $2,
				reviewer_user_id = $3
			FROM current
			WHERE r.id = current.id
			RETURNING
				current.review_id,
				jsonb_build_object('moderation_note', current.moderation_note) AS previous_state,
				jsonb_build_object('moderation_note', r.moderation_note, 'reviewer_user_id', r.reviewer_user_id) AS next_state
		)
		SELECT review_id, previous_state, next_state
		FROM updated`,
		decision.ReplyID,
		decision.Note,
		decision.ActorUserID,
	).Scan(&reviewID, &previousState, &nextState)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   decision.ActorUserID,
		TargetType:    "review_reply",
		TargetID:      strconv.FormatInt(decision.ReplyID, 10),
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

	return db.replyDecisionResult(ctx, reviewID, decision.ReplyID, "note")
}

func (db *AdminDB) GetSessionDetail(ctx context.Context, id int64) (*v1.AdminSessionDetailResponse, error) {
	session, err := db.getSession(ctx, id)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, nil
	}

	activity, err := db.activityBySession(ctx, id)
	if err != nil {
		return nil, err
	}
	loginSessions, err := db.listLoginSessions(ctx, "ls.session_id = $1", id)
	if err != nil {
		return nil, err
	}

	stats := buildEntityStats(activity, []v1.AdminEntitySession{*session}, loginSessions)
	return &v1.AdminSessionDetailResponse{
		Session:       *session,
		Stats:         stats,
		Activity:      activity,
		LoginSessions: loginSessions,
	}, nil
}

func (db *AdminDB) GetUserDetail(ctx context.Context, id int64) (*v1.AdminUserDetailResponse, error) {
	user, err := db.getUser(ctx, id)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, nil
	}

	identities, err := db.listUserIdentities(ctx, id)
	if err != nil {
		return nil, err
	}
	sessions, err := db.listSessions(ctx, "s.user_id = $1", id)
	if err != nil {
		return nil, err
	}
	loginSessions, err := db.listLoginSessions(ctx, "ls.user_id = $1", id)
	if err != nil {
		return nil, err
	}
	activity, err := db.activityByUser(ctx, id)
	if err != nil {
		return nil, err
	}
	activity.Actions, err = db.listActionsForTargets(ctx, activityTargetTypes(), activityTargetIDs(activity), &id)
	if err != nil {
		return nil, err
	}

	stats := buildEntityStats(activity, sessions, loginSessions)
	return &v1.AdminUserDetailResponse{
		User:          *user,
		Identities:    identities,
		Sessions:      sessions,
		LoginSessions: loginSessions,
		Stats:         stats,
		Activity:      activity,
	}, nil
}

func (db *AdminDB) GetIPDetail(ctx context.Context, address string) (*v1.AdminIPDetailResponse, error) {
	var exists bool
	if err := db.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM account.session WHERE ip_address = $1::inet
			UNION ALL
			SELECT 1 FROM account.login_session WHERE ip_address = $1::inet
			UNION ALL
			SELECT 1 FROM professor.review WHERE ip_address = $1::inet
			UNION ALL
			SELECT 1 FROM professor.review_rating WHERE ip_address = $1::inet
			UNION ALL
			SELECT 1 FROM professor.review_attachment WHERE ip_address = $1::inet
			)`,
		address,
	).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, nil
	}

	sessions, err := db.listSessions(ctx, "s.ip_address = $1::inet", address)
	if err != nil {
		return nil, err
	}
	loginSessions, err := db.listLoginSessions(ctx, "ls.ip_address = $1::inet", address)
	if err != nil {
		return nil, err
	}
	activity, err := db.activityByIP(ctx, address)
	if err != nil {
		return nil, err
	}

	stats := buildEntityStats(activity, sessions, loginSessions)
	return &v1.AdminIPDetailResponse{
		IPAddress:     address,
		Stats:         stats,
		Sessions:      sessions,
		LoginSessions: loginSessions,
		Activity:      activity,
	}, nil
}

func (db *AdminDB) replyDecisionResult(ctx context.Context, reviewID, replyID int64, action string) (*ReplyDecisionResult, error) {
	review, err := db.GetReview(ctx, reviewID)
	if err != nil {
		return nil, err
	}
	if review == nil {
		return nil, ErrNotFound
	}
	reply, err := db.getReviewReply(ctx, replyID)
	if err != nil {
		return nil, err
	}
	if reply == nil {
		return nil, ErrNotFound
	}
	return &ReplyDecisionResult{Review: review, Reply: reply, Action: action}, nil
}

func (db *AdminDB) getReviewReply(ctx context.Context, id int64) (*v1.AdminReviewReply, error) {
	var reply v1.AdminReviewReply
	err := db.db.Pool.QueryRow(ctx, `
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
			r.user_id,
			s.ip_address::text
		FROM professor.review_reply r
		LEFT JOIN professor.reply_name rn
			ON rn.review_id = r.review_id AND rn.session_id = r.session_id
		LEFT JOIN professor.review_reply mention_reply
			ON mention_reply.id = r.mention_id
		LEFT JOIN professor.reply_name mentioned
			ON mentioned.review_id = r.review_id AND mentioned.session_id = mention_reply.session_id
		LEFT JOIN account.session s ON s.id = r.session_id
		WHERE r.id = $1`,
		id,
	).Scan(
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
		&reply.IPAddress,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &reply, nil
}

func (db *AdminDB) getSession(ctx context.Context, id int64) (*v1.AdminEntitySession, error) {
	var session v1.AdminEntitySession
	err := db.db.Pool.QueryRow(ctx, `
		SELECT id, user_id, user_agent, ip_address::text, created_at
		FROM account.session
		WHERE id = $1`,
		id,
	).Scan(&session.ID, &session.UserID, &session.UserAgent, &session.IPAddress, &session.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &session, nil
}

func (db *AdminDB) getUser(ctx context.Context, id int64) (*v1.AdminUserAccount, error) {
	var user v1.AdminUserAccount
	err := db.db.Pool.QueryRow(ctx, `
		SELECT id, username, primary_email, role, status, created_at, last_login_at
		FROM account."user"
		WHERE id = $1`,
		id,
	).Scan(&user.ID, &user.Username, &user.Email, &user.Role, &user.Status, &user.CreatedAt, &user.LastLoginAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func (db *AdminDB) listUserIdentities(ctx context.Context, userID int64) ([]v1.AdminUserIdentity, error) {
	rows, err := db.db.Pool.Query(ctx, `
		SELECT id, provider, email, email_verified, created_at
		FROM account.identity
		WHERE user_id = $1
		ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	identities := []v1.AdminUserIdentity{}
	for rows.Next() {
		var identity v1.AdminUserIdentity
		if err := rows.Scan(&identity.ID, &identity.Provider, &identity.Email, &identity.EmailVerified, &identity.CreatedAt); err != nil {
			return nil, err
		}
		identities = append(identities, identity)
	}
	return identities, rows.Err()
}

func (db *AdminDB) listSessions(ctx context.Context, where string, args ...any) ([]v1.AdminEntitySession, error) {
	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		SELECT s.id, s.user_id, s.user_agent, s.ip_address::text, s.created_at
		FROM account.session s
		WHERE %s
		ORDER BY s.created_at DESC NULLS LAST
		LIMIT %d`, where, entityActivityLimit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := []v1.AdminEntitySession{}
	for rows.Next() {
		var session v1.AdminEntitySession
		if err := rows.Scan(&session.ID, &session.UserID, &session.UserAgent, &session.IPAddress, &session.CreatedAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

func (db *AdminDB) listLoginSessions(ctx context.Context, where string, args ...any) ([]v1.AdminLoginSession, error) {
	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		SELECT id, user_id, session_id, created_at, last_seen_at, expires_at, revoked_at, user_agent, ip_address::text
		FROM account.login_session ls
		WHERE %s
		ORDER BY COALESCE(last_seen_at, created_at) DESC
		LIMIT %d`, where, entityActivityLimit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := []v1.AdminLoginSession{}
	for rows.Next() {
		var session v1.AdminLoginSession
		if err := rows.Scan(
			&session.ID,
			&session.UserID,
			&session.SessionID,
			&session.CreatedAt,
			&session.LastSeenAt,
			&session.ExpiresAt,
			&session.RevokedAt,
			&session.UserAgent,
			&session.IPAddress,
		); err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

func (db *AdminDB) activityBySession(ctx context.Context, sessionID int64) (v1.AdminEntityActivity, error) {
	activity, err := db.activityByWhere(ctx, activityWhere{
		review:           "r.session_id = $1",
		reply:            "rr.session_id = $1",
		report:           "rp.session_id = $1",
		rating:           "rt.session_id = $1",
		replyLike:        "rl.session_id = $1",
		professorRequest: "pr.session_id = $1",
		courseFile:       "cf.session_id = $1",
		attachment:       "rv.session_id = $1",
		args:             []any{sessionID},
	})
	return activity, err
}

func (db *AdminDB) activityByUser(ctx context.Context, userID int64) (v1.AdminEntityActivity, error) {
	activity, err := db.activityByWhere(ctx, activityWhere{
		review:           "r.user_id = $1",
		reply:            "rr.user_id = $1",
		report:           "rp.user_id = $1",
		rating:           "rt.user_id = $1",
		replyLike:        "rl.user_id = $1",
		professorRequest: "pr.user_id = $1",
		courseFile:       "cf.user_id = $1",
		attachment:       "rv.user_id = $1",
		args:             []any{userID},
	})
	return activity, err
}

func (db *AdminDB) activityByIP(ctx context.Context, address string) (v1.AdminEntityActivity, error) {
	activity, err := db.activityByWhere(ctx, activityWhere{
		review:           "(r.ip_address = $1::inet OR r.session_id IN (SELECT id FROM account.session WHERE ip_address = $1::inet))",
		reply:            "rr.session_id IN (SELECT id FROM account.session WHERE ip_address = $1::inet)",
		report:           "rp.session_id IN (SELECT id FROM account.session WHERE ip_address = $1::inet)",
		rating:           "(rt.ip_address = $1::inet OR rt.session_id IN (SELECT id FROM account.session WHERE ip_address = $1::inet))",
		replyLike:        "rl.session_id IN (SELECT id FROM account.session WHERE ip_address = $1::inet)",
		professorRequest: "pr.session_id IN (SELECT id FROM account.session WHERE ip_address = $1::inet)",
		courseFile:       "cf.session_id IN (SELECT id FROM account.session WHERE ip_address = $1::inet)",
		attachment:       "(a.ip_address = $1::inet OR rv.ip_address = $1::inet OR rv.session_id IN (SELECT id FROM account.session WHERE ip_address = $1::inet))",
		args:             []any{address},
	})
	return activity, err
}

type activityWhere struct {
	review           string
	reply            string
	report           string
	rating           string
	replyLike        string
	professorRequest string
	courseFile       string
	attachment       string
	args             []any
}

func (db *AdminDB) activityByWhere(ctx context.Context, where activityWhere) (v1.AdminEntityActivity, error) {
	var activity v1.AdminEntityActivity
	var err error

	activity.Reviews, err = db.listReviewSummaries(ctx, where.review, where.args...)
	if err != nil {
		return activity, err
	}
	activity.Replies, err = db.listReplySummaries(ctx, where.reply, where.args...)
	if err != nil {
		return activity, err
	}
	activity.Reports, err = db.listReportSummaries(ctx, where.report, where.args...)
	if err != nil {
		return activity, err
	}
	activity.Ratings, err = db.listRatingSummaries(ctx, where.rating, where.args...)
	if err != nil {
		return activity, err
	}
	activity.ReplyLikes, err = db.listReplyLikes(ctx, where.replyLike, where.args...)
	if err != nil {
		return activity, err
	}
	activity.ProfessorRequests, err = db.listProfessorRequestSummaries(ctx, where.professorRequest, where.args...)
	if err != nil {
		return activity, err
	}
	activity.CourseFiles, err = db.listCourseFileSummaries(ctx, where.courseFile, where.args...)
	if err != nil {
		return activity, err
	}
	activity.Attachments, err = db.listAttachmentSummaries(ctx, where.attachment, where.args...)
	if err != nil {
		return activity, err
	}
	activity.Signals, err = db.listSignalsForTargets(ctx, activityTargetTypes(), activityTargetIDs(activity))
	if err != nil {
		return activity, err
	}
	activity.Actions, err = db.listActionsForTargets(ctx, activityTargetTypes(), activityTargetIDs(activity), nil)
	if err != nil {
		return activity, err
	}

	return activity, nil
}

func (db *AdminDB) listReviewSummaries(ctx context.Context, where string, args ...any) ([]v1.AdminReviewSummary, error) {
	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		WITH signal_source AS (
			SELECT target_id FROM moderation.signal WHERE target_type = 'professor_review'
			UNION ALL
			SELECT review_id::text FROM professor.review_flag
		),
		signal_counts AS (
			SELECT target_id, count(*) AS signal_count
			FROM signal_source
			GROUP BY target_id
		),
		report_counts AS (
			SELECT review_id, count(*) FILTER (WHERE resolved = false) AS open_report_count
			FROM professor.review_report
			GROUP BY review_id
		)
		SELECT
			r.id,
			r.professor_email,
			COALESCE(p.name, r.professor_email) AS professor_name,
			r.score,
			r.positive,
			r.content,
			r.created_at,
			r.visible,
			r.reviewed,
			r.deleted_at,
			r.like_count,
			r.dislike_count,
			r.reply_count,
			r.session_id,
			r.user_id,
			r.ip_address::text,
			COALESCE(rc.open_report_count, 0)::int,
			COALESCE(sc.signal_count, 0)::int,
			CASE WHEN r.attachment IS NOT NULL THEN 'attachment' WHEN r.gif IS NOT NULL THEN 'gif' END AS media_kind
		FROM professor.review r
		LEFT JOIN professor.professor p ON p.email = r.professor_email
		LEFT JOIN report_counts rc ON rc.review_id = r.id
		LEFT JOIN signal_counts sc ON sc.target_id = r.id::text
		WHERE %s
		ORDER BY r.created_at DESC
		LIMIT %d`, where, entityActivityLimit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	reviews := []v1.AdminReviewSummary{}
	for rows.Next() {
		var review v1.AdminReviewSummary
		if err := rows.Scan(
			&review.ID,
			&review.ProfessorEmail,
			&review.ProfessorName,
			&review.Score,
			&review.Positive,
			&review.Text,
			&review.CreatedAt,
			&review.Visible,
			&review.Reviewed,
			&review.DeletedAt,
			&review.LikeCount,
			&review.DislikeCount,
			&review.ReplyCount,
			&review.SessionID,
			&review.UserID,
			&review.IPAddress,
			&review.OpenReportCount,
			&review.SignalCount,
			&review.MediaKind,
		); err != nil {
			return nil, err
		}
		reviews = append(reviews, review)
	}
	return reviews, rows.Err()
}

func (db *AdminDB) listReplySummaries(ctx context.Context, where string, args ...any) ([]v1.AdminReviewReplySummary, error) {
	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		SELECT
			rr.id,
			rr.review_id,
			r.professor_email,
			COALESCE(p.name, r.professor_email) AS professor_name,
			rr.content,
			rr.created_at,
			rr.visible,
			rr.reviewed,
			rr.deleted_at,
			rn.name,
			mentioned.name,
			rr.op,
			rr.like_count,
			rr.session_id,
			rr.user_id,
			s.ip_address::text
		FROM professor.review_reply rr
		JOIN professor.review r ON r.id = rr.review_id
		LEFT JOIN professor.professor p ON p.email = r.professor_email
		LEFT JOIN professor.reply_name rn
			ON rn.review_id = rr.review_id AND rn.session_id = rr.session_id
		LEFT JOIN professor.review_reply mention_reply
			ON mention_reply.id = rr.mention_id
		LEFT JOIN professor.reply_name mentioned
			ON mentioned.review_id = rr.review_id AND mentioned.session_id = mention_reply.session_id
		LEFT JOIN account.session s ON s.id = rr.session_id
		WHERE %s
		ORDER BY rr.created_at DESC
		LIMIT %d`, where, entityActivityLimit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	replies := []v1.AdminReviewReplySummary{}
	for rows.Next() {
		var reply v1.AdminReviewReplySummary
		if err := rows.Scan(
			&reply.ID,
			&reply.ReviewID,
			&reply.ProfessorEmail,
			&reply.ProfessorName,
			&reply.Text,
			&reply.CreatedAt,
			&reply.Visible,
			&reply.Reviewed,
			&reply.DeletedAt,
			&reply.Author,
			&reply.Mention,
			&reply.Op,
			&reply.LikeCount,
			&reply.SessionID,
			&reply.UserID,
			&reply.IPAddress,
		); err != nil {
			return nil, err
		}
		replies = append(replies, reply)
	}
	return replies, rows.Err()
}

func (db *AdminDB) listReportSummaries(ctx context.Context, where string, args ...any) ([]v1.AdminReviewReportSummary, error) {
	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		SELECT
			rp.id,
			rp.review_id,
			rp.reason,
			rp.session_id,
			rp.user_id,
			rp.created_at,
			rp.resolved,
			rp.resolved_at,
			r.content,
			COALESCE(p.name, r.professor_email) AS professor_name
		FROM professor.review_report rp
		JOIN professor.review r ON r.id = rp.review_id
		LEFT JOIN professor.professor p ON p.email = r.professor_email
		WHERE %s
		ORDER BY rp.resolved ASC, rp.created_at DESC
		LIMIT %d`, where, entityActivityLimit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	reports := []v1.AdminReviewReportSummary{}
	for rows.Next() {
		var report v1.AdminReviewReportSummary
		if err := rows.Scan(
			&report.ID,
			&report.ReviewID,
			&report.Reason,
			&report.SessionID,
			&report.UserID,
			&report.CreatedAt,
			&report.Resolved,
			&report.ResolvedAt,
			&report.ReviewText,
			&report.ProfessorName,
		); err != nil {
			return nil, err
		}
		reports = append(reports, report)
	}
	return reports, rows.Err()
}

func (db *AdminDB) listRatingSummaries(ctx context.Context, where string, args ...any) ([]v1.AdminReviewRatingSummary, error) {
	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		SELECT
			rt.review_id,
			COALESCE(p.name, r.professor_email) AS professor_name,
			CASE WHEN rt.value = true THEN 'like' ELSE 'dislike' END AS value,
			rt.session_id,
			rt.user_id,
			rt.ip_address::text,
			rt.created_at
		FROM professor.review_rating rt
		JOIN professor.review r ON r.id = rt.review_id
		LEFT JOIN professor.professor p ON p.email = r.professor_email
		WHERE %s
		ORDER BY rt.created_at DESC
		LIMIT %d`, where, entityActivityLimit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ratings := []v1.AdminReviewRatingSummary{}
	for rows.Next() {
		var rating v1.AdminReviewRatingSummary
		if err := rows.Scan(&rating.ReviewID, &rating.ProfessorName, &rating.Value, &rating.SessionID, &rating.UserID, &rating.IPAddress, &rating.CreatedAt); err != nil {
			return nil, err
		}
		ratings = append(ratings, rating)
	}
	return ratings, rows.Err()
}

func (db *AdminDB) listReplyLikes(ctx context.Context, where string, args ...any) ([]v1.AdminReplyLike, error) {
	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		SELECT rl.reply_id, rl.session_id, rl.user_id, s.ip_address::text, rl.created_at
		FROM professor.reply_like rl
		LEFT JOIN account.session s ON s.id = rl.session_id
		WHERE %s
		ORDER BY rl.created_at DESC
		LIMIT %d`, where, entityActivityLimit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	likes := []v1.AdminReplyLike{}
	for rows.Next() {
		var like v1.AdminReplyLike
		if err := rows.Scan(&like.ReplyID, &like.SessionID, &like.UserID, &like.IPAddress, &like.CreatedAt); err != nil {
			return nil, err
		}
		likes = append(likes, like)
	}
	return likes, rows.Err()
}

func (db *AdminDB) listProfessorRequestSummaries(ctx context.Context, where string, args ...any) ([]v1.AdminProfessorRequestSummary, error) {
	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		SELECT
			pr.id,
			pr.professor_name,
			pr.professor_email,
			pr.university,
			pr.college,
			pr.status,
			pr.session_id,
			pr.user_id,
			pr.created_at,
			pr.reviewed_at,
			pr.reviewer_user_id,
			pr.moderation_reason_code,
			pr.moderation_note
		FROM professor.professor_request pr
		WHERE %s
		ORDER BY pr.created_at DESC
		LIMIT %d`, where, entityActivityLimit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requests := []v1.AdminProfessorRequestSummary{}
	for rows.Next() {
		var request v1.AdminProfessorRequestSummary
		if err := rows.Scan(
			&request.ID,
			&request.ProfessorName,
			&request.ProfessorEmail,
			&request.University,
			&request.College,
			&request.Status,
			&request.SessionID,
			&request.UserID,
			&request.CreatedAt,
			&request.ReviewedAt,
			&request.ReviewerUserID,
			&request.ModerationReasonCode,
			&request.ModerationNote,
		); err != nil {
			return nil, err
		}
		requests = append(requests, request)
	}
	return requests, rows.Err()
}

func (db *AdminDB) listCourseFileSummaries(ctx context.Context, where string, args ...any) ([]v1.AdminCourseFileSummary, error) {
	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		SELECT
			cf.id,
			cf.name,
			cf.type,
			cf.size,
			cf.visible,
			cf.reviewed,
			cf.course_tag,
			cf.download_count,
			cf.created_at,
			cf.user_id,
			cf.session_id,
			cf.reviewed_at,
			cf.reviewer_user_id,
			cf.moderation_reason_code,
			cf.moderation_note
		FROM course.file cf
		WHERE %s
		ORDER BY cf.created_at DESC
		LIMIT %d`, where, entityActivityLimit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	files := []v1.AdminCourseFileSummary{}
	for rows.Next() {
		var file v1.AdminCourseFileSummary
		if err := rows.Scan(
			&file.ID,
			&file.Name,
			&file.Type,
			&file.Size,
			&file.Visible,
			&file.Reviewed,
			&file.CourseTag,
			&file.DownloadCount,
			&file.CreatedAt,
			&file.UserID,
			&file.SessionID,
			&file.ReviewedAt,
			&file.ReviewerUserID,
			&file.ModerationReasonCode,
			&file.ModerationNote,
		); err != nil {
			return nil, err
		}
		files = append(files, file)
	}
	return files, rows.Err()
}

func (db *AdminDB) listAttachmentSummaries(ctx context.Context, where string, args ...any) ([]v1.AdminReviewAttachmentSummary, error) {
	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		SELECT
			a.id,
			rv.id AS review_id,
			a.mime_type,
			a.size,
			a.width,
			a.height,
			COALESCE(a.visible, false),
			a.reviewed,
			a.blob_name,
			a.ip_address::text,
			a.created_at
		FROM professor.review_attachment a
		LEFT JOIN professor.review rv ON rv.attachment = a.id
		WHERE %s
		ORDER BY a.created_at DESC
		LIMIT %d`, where, entityActivityLimit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	attachments := []v1.AdminReviewAttachmentSummary{}
	for rows.Next() {
		var attachment v1.AdminReviewAttachmentSummary
		if err := rows.Scan(
			&attachment.ID,
			&attachment.ReviewID,
			&attachment.MimeType,
			&attachment.Size,
			&attachment.Width,
			&attachment.Height,
			&attachment.Visible,
			&attachment.Reviewed,
			&attachment.BlobName,
			&attachment.IPAddress,
			&attachment.CreatedAt,
		); err != nil {
			return nil, err
		}
		attachment.URL = db.formatAttachmentURL(attachment.BlobName)
		attachments = append(attachments, attachment)
	}
	return attachments, rows.Err()
}

func (db *AdminDB) listSignalsForTargets(ctx context.Context, targetTypes []string, targetIDs [][]string) ([]v1.AdminModerationSignal, error) {
	if len(targetTypes) != len(targetIDs) {
		return nil, fmt.Errorf("signal target type/id mismatch")
	}

	where, args := targetWhereClause(targetTypes, targetIDs)
	if where == "" {
		return []v1.AdminModerationSignal{}, nil
	}

	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		SELECT id, target_type, target_id, source, attribute, score, threshold, severity, payload, created_at
		FROM moderation.signal
		WHERE %s
		ORDER BY created_at DESC
		LIMIT %d`, where, entityActivityLimit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	signals := []v1.AdminModerationSignal{}
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
			return nil, err
		}
		signal.Payload = rawJSONPtr(payload)
		signals = append(signals, signal)
	}
	return signals, rows.Err()
}

func (db *AdminDB) listActionsForTargets(ctx context.Context, targetTypes []string, targetIDs [][]string, actorUserID *int64) ([]v1.AdminModerationAction, error) {
	if len(targetTypes) != len(targetIDs) {
		return nil, fmt.Errorf("action target type/id mismatch")
	}

	where, args := targetWhereClause(targetTypes, targetIDs)
	if actorUserID != nil {
		args = append(args, *actorUserID)
		actorClause := fmt.Sprintf("actor_user_id = $%d", len(args))
		if where == "" {
			where = actorClause
		} else {
			where = fmt.Sprintf("(%s) OR %s", where, actorClause)
		}
	}
	if where == "" {
		return []v1.AdminModerationAction{}, nil
	}

	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		SELECT id, actor_user_id, target_type, target_id, action, reason_code, note, previous_state, next_state, created_at
		FROM moderation.action_log
		WHERE %s
		ORDER BY created_at DESC
		LIMIT %d`, where, entityActivityLimit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	actions := []v1.AdminModerationAction{}
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
			return nil, err
		}
		action.PreviousState = rawJSONPtr(previousState)
		action.NextState = rawJSONPtr(nextState)
		actions = append(actions, action)
	}
	return actions, rows.Err()
}

func targetWhereClause(targetTypes []string, targetIDs [][]string) (string, []any) {
	clauses := []string{}
	args := []any{}
	for index, targetType := range targetTypes {
		if len(targetIDs[index]) == 0 {
			continue
		}
		args = append(args, targetType, targetIDs[index])
		clauses = append(clauses, fmt.Sprintf("(target_type = $%d AND target_id = ANY($%d::text[]))", len(args)-1, len(args)))
	}
	if len(clauses) == 0 {
		return "", nil
	}

	where := clauses[0]
	for i := 1; i < len(clauses); i++ {
		where += " OR " + clauses[i]
	}
	return where, args
}

func activityTargetTypes() []string {
	return []string{
		"professor_review",
		"review_reply",
		"review_report",
		"course_file",
		"professor_request",
		"review_attachment",
	}
}

func activityTargetIDs(activity v1.AdminEntityActivity) [][]string {
	reviews := make([]string, 0, len(activity.Reviews))
	for _, review := range activity.Reviews {
		reviews = append(reviews, strconv.FormatInt(review.ID, 10))
	}
	replies := make([]string, 0, len(activity.Replies))
	for _, reply := range activity.Replies {
		replies = append(replies, strconv.FormatInt(reply.ID, 10))
	}
	reports := make([]string, 0, len(activity.Reports))
	for _, report := range activity.Reports {
		reports = append(reports, strconv.FormatInt(report.ID, 10))
	}
	courseFiles := make([]string, 0, len(activity.CourseFiles))
	for _, file := range activity.CourseFiles {
		courseFiles = append(courseFiles, strconv.FormatInt(file.ID, 10))
	}
	requests := make([]string, 0, len(activity.ProfessorRequests))
	for _, request := range activity.ProfessorRequests {
		requests = append(requests, strconv.FormatInt(request.ID, 10))
	}
	attachments := make([]string, 0, len(activity.Attachments))
	for _, attachment := range activity.Attachments {
		attachments = append(attachments, strconv.FormatInt(attachment.ID, 10))
	}
	return [][]string{reviews, replies, reports, courseFiles, requests, attachments}
}

func buildEntityStats(activity v1.AdminEntityActivity, sessions []v1.AdminEntitySession, loginSessions []v1.AdminLoginSession) v1.AdminEntityStats {
	stats := v1.AdminEntityStats{}
	sessionIDs := map[int64]struct{}{}
	userIDs := map[int64]struct{}{}

	recordSession := func(id int64) {
		if id > 0 {
			sessionIDs[id] = struct{}{}
		}
	}
	recordUser := func(id *int64) {
		if id != nil && *id > 0 {
			userIDs[*id] = struct{}{}
		}
	}
	recordTime := func(value *time.Time) {
		if value == nil {
			return
		}
		if stats.FirstSeen == nil || value.Before(*stats.FirstSeen) {
			copied := *value
			stats.FirstSeen = &copied
		}
		if stats.LastSeen == nil || value.After(*stats.LastSeen) {
			copied := *value
			stats.LastSeen = &copied
		}
	}

	for _, session := range sessions {
		recordSession(session.ID)
		recordUser(session.UserID)
		recordTime(session.CreatedAt)
	}
	for _, session := range loginSessions {
		recordSession(session.SessionID)
		recordUser(&session.UserID)
		recordTime(&session.CreatedAt)
		recordTime(session.LastSeenAt)
	}
	for _, review := range activity.Reviews {
		stats.RecentActivityCount++
		recordUser(review.UserID)
		if review.SessionID != nil {
			recordSession(*review.SessionID)
		}
		recordTime(&review.CreatedAt)
		if !review.Visible && review.DeletedAt == nil {
			stats.HiddenContentCount++
		}
		stats.OpenReportCount += review.OpenReportCount
	}
	for _, reply := range activity.Replies {
		stats.RecentActivityCount++
		recordSession(reply.SessionID)
		recordUser(reply.UserID)
		recordTime(&reply.CreatedAt)
		if !reply.Visible && reply.DeletedAt == nil {
			stats.HiddenContentCount++
		}
	}
	for _, report := range activity.Reports {
		stats.RecentActivityCount++
		recordSession(report.SessionID)
		recordUser(report.UserID)
		recordTime(&report.CreatedAt)
		if !report.Resolved {
			stats.OpenReportCount++
		}
	}
	for _, rating := range activity.Ratings {
		stats.RecentActivityCount++
		recordSession(rating.SessionID)
		recordUser(rating.UserID)
		recordTime(&rating.CreatedAt)
	}
	for _, like := range activity.ReplyLikes {
		stats.RecentActivityCount++
		recordSession(like.SessionID)
		recordUser(like.UserID)
		recordTime(&like.CreatedAt)
	}
	for _, request := range activity.ProfessorRequests {
		stats.RecentActivityCount++
		recordSession(request.SessionID)
		recordUser(request.UserID)
		recordTime(&request.CreatedAt)
	}
	for _, file := range activity.CourseFiles {
		stats.RecentActivityCount++
		if file.SessionID != nil {
			recordSession(*file.SessionID)
		}
		recordUser(file.UserID)
		recordTime(&file.CreatedAt)
		if !file.Visible {
			stats.HiddenContentCount++
		}
	}
	for _, attachment := range activity.Attachments {
		stats.RecentActivityCount++
		recordTime(&attachment.CreatedAt)
		if !attachment.Visible {
			stats.HiddenContentCount++
		}
	}

	stats.SignalCount = len(activity.Signals)
	stats.DistinctSessionCount = len(sessionIDs)
	stats.DistinctUserCount = len(userIDs)
	return stats
}
