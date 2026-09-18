package database

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

const (
	professorRequestMatchLimit   = 5
	professorRequestGroupingCTEs = `
		request_keys AS MATERIALIZED (
			SELECT
				pr.id,
				CASE WHEN pr.professor_email IS NULL THEN NULL ELSE lower(pr.professor_email) END AS email_key,
				lower(regexp_replace(btrim(pr.professor_name), '\s+', ' ', 'g')) AS name_key,
				lower(regexp_replace(btrim(pr.university), '\s+', ' ', 'g')) AS university_key
			FROM professor.professor_request pr
		),
		request_links AS MATERIALIZED (
			SELECT id AS request_id, 'email'::text AS link_type, email_key AS key_one, ''::text AS key_two
			FROM request_keys
			WHERE email_key IS NOT NULL
			UNION ALL
			SELECT id, 'identity'::text, name_key, university_key
			FROM request_keys
		),
		request_reach(root_id, request_id) AS (
			SELECT id, id
			FROM request_keys
			UNION
			SELECT reach.root_id, neighbor.request_id
			FROM request_reach reach
			JOIN request_links current_link ON current_link.request_id = reach.request_id
			JOIN request_links neighbor
			  ON neighbor.link_type = current_link.link_type
			 AND neighbor.key_one = current_link.key_one
			 AND neighbor.key_two = current_link.key_two
		),
		request_groups AS MATERIALIZED (
			SELECT request_id, min(root_id) AS group_id
			FROM request_reach
			GROUP BY request_id
		),
		request_group_sizes AS MATERIALIZED (
			SELECT group_id, count(*) AS request_count
			FROM request_groups
			GROUP BY group_id
		)`
	professorRequestMatchesQuery = `
		SELECT
			pr.id,
			candidate.email,
			candidate.name,
			candidate.university,
			candidate.college,
			candidate.visible,
			candidate.match_type,
			candidate.name_similarity
		FROM professor.professor_request pr
		CROSS JOIN LATERAL (
			SELECT
				p.email,
				p.name,
				p.university,
				p.college,
				p.visible,
				CASE
					WHEN pr.professor_email IS NOT NULL AND lower(p.email) = lower(pr.professor_email) THEN 'exact_email'
					WHEN lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.professor_name), '\s+', ' ', 'g'))
					 AND lower(regexp_replace(btrim(p.university), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.university), '\s+', ' ', 'g')) THEN 'same_university_name'
					ELSE 'similar_name'
				END AS match_type,
				CASE
					WHEN pr.professor_email IS NOT NULL AND lower(p.email) = lower(pr.professor_email) THEN 0
					WHEN lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.professor_name), '\s+', ' ', 'g'))
					 AND lower(regexp_replace(btrim(p.university), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.university), '\s+', ' ', 'g')) THEN 1
					WHEN similarity(lower(p.name), lower(pr.professor_name)) >= 0.85 THEN 2
					WHEN lower(regexp_replace(btrim(p.university), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.university), '\s+', ' ', 'g')) THEN 3
					ELSE 4
				END AS match_priority,
				similarity(lower(p.name), lower(pr.professor_name))::double precision AS name_similarity
			FROM professor.professor p
			WHERE (
				pr.professor_email IS NOT NULL
				AND lower(p.email) = lower(pr.professor_email)
			) OR (
				lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.professor_name), '\s+', ' ', 'g'))
				AND lower(regexp_replace(btrim(p.university), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.university), '\s+', ' ', 'g'))
			) OR similarity(lower(p.name), lower(pr.professor_name)) >= 0.35
			ORDER BY
				match_priority,
				name_similarity DESC,
				p.email
			LIMIT $2
		) candidate
		WHERE pr.id = ANY($1::bigint[])
		ORDER BY pr.id, candidate.match_priority, candidate.name_similarity DESC, candidate.email`
)

var (
	ErrProfessorRequestAlreadyDecided  = errors.New("professor request has already been decided")
	ErrProfessorAlreadyExists          = errors.New("professor already exists")
	ErrResolvedProfessorNotFound       = errors.New("resolved professor not found")
	ErrInvalidProfessorRequestDecision = errors.New("invalid professor request decision")
)

type ListProfessorRequestOptions struct {
	Limit     int
	Offset    int
	Status    string
	Duplicate string
	Search    string
}

type ProfessorRequestListResult struct {
	Requests        []v1.AdminProfessorRequest
	Total           int64
	GroupTotal      int64
	StatusCounts    v1.AdminProfessorRequestStatusCounts
	DuplicateCounts v1.AdminProfessorRequestDuplicateCounts
}

type ProfessorRequestDecision struct {
	RequestID              int64
	Decision               string
	ActorUserID            *int64
	ProfessorName          *string
	ProfessorEmail         *string
	University             *string
	College                *string
	ResolvedProfessorEmail *string
	ReasonCode             *string
	Note                   *string
}

type ProfessorRequestDecisionResult struct {
	Request *v1.AdminProfessorRequest
	Action  string
}

func (db *AdminDB) ListProfessorRequests(ctx context.Context, opts ListProfessorRequestOptions) (*ProfessorRequestListResult, error) {
	query, args := buildProfessorRequestListQuery(opts)
	var (
		ids             []int64
		total           int64
		groupTotal      int64
		statusCounts    v1.AdminProfessorRequestStatusCounts
		duplicateCounts v1.AdminProfessorRequestDuplicateCounts
	)
	if err := db.db.Pool.QueryRow(ctx, query, args...).Scan(
		&ids,
		&total,
		&groupTotal,
		&statusCounts.Pending,
		&statusCounts.Approved,
		&statusCounts.Rejected,
		&statusCounts.Dismissed,
		&statusCounts.All,
		&duplicateCounts.All,
		&duplicateCounts.Likely,
		&duplicateCounts.NotLikely,
	); err != nil {
		return nil, err
	}

	requests, err := db.loadProfessorRequests(ctx, ids, false)
	if err != nil {
		return nil, err
	}

	return &ProfessorRequestListResult{
		Requests:        requests,
		Total:           total,
		GroupTotal:      groupTotal,
		StatusCounts:    statusCounts,
		DuplicateCounts: duplicateCounts,
	}, nil
}

func (db *AdminDB) GetProfessorRequest(ctx context.Context, requestID int64) (*v1.AdminProfessorRequest, error) {
	requests, err := db.loadProfessorRequests(ctx, []int64{requestID}, true)
	if err != nil {
		return nil, err
	}
	if len(requests) == 0 {
		return nil, nil
	}
	return &requests[0], nil
}

func buildProfessorRequestListQuery(opts ListProfessorRequestOptions) (string, []any) {
	if opts.Limit <= 0 {
		opts.Limit = 50
	}
	if opts.Offset < 0 {
		opts.Offset = 0
	}
	if opts.Status == "" {
		opts.Status = "pending"
	}
	if opts.Duplicate != "likely" && opts.Duplicate != "not_likely" {
		opts.Duplicate = "all"
	}

	args := []any{opts.Limit, opts.Offset}
	statusCondition := "TRUE"
	if opts.Status != "all" {
		args = append(args, opts.Status)
		statusCondition = fmt.Sprintf("pr.status = $%d", len(args))
	}

	searchCondition := "TRUE"
	if search := strings.TrimSpace(opts.Search); search != "" {
		args = append(args, "%"+search+"%")
		searchCondition = professorRequestSearchCondition("pr", len(args))
	}

	duplicateCondition := professorRequestDuplicateFilterCondition("pr", opts.Duplicate)

	query := fmt.Sprintf(`
		WITH RECURSIVE
		%s,
		classified AS MATERIALIZED (
			SELECT
				pr.*,
				request_groups.group_id,
				%s AS likely_duplicate
			FROM professor.professor_request pr
			JOIN request_groups ON request_groups.request_id = pr.id
		),
		search_filtered AS MATERIALIZED (
			SELECT pr.*
			FROM classified pr
			WHERE %s
		),
		status_filtered AS MATERIALIZED (
			SELECT pr.*
			FROM search_filtered pr
			WHERE %s
		),
		filtered AS MATERIALIZED (
			SELECT pr.*
			FROM status_filtered pr
			WHERE %s
		),
		matching_groups AS MATERIALIZED (
			SELECT DISTINCT ON (pr.group_id)
				pr.group_id,
				pr.created_at AS latest_created_at,
				pr.id AS latest_request_id
			FROM filtered pr
			ORDER BY pr.group_id, pr.created_at DESC, pr.id DESC
		),
		page_groups AS MATERIALIZED (
			SELECT
				group_id,
				row_number() OVER (ORDER BY latest_created_at DESC, latest_request_id DESC, group_id) AS page_order
			FROM matching_groups
			ORDER BY latest_created_at DESC, latest_request_id DESC, group_id
			LIMIT $1 OFFSET $2
		),
		status_counts AS (
			SELECT
				count(*) FILTER (WHERE pr.status = 'pending') AS pending,
				count(*) FILTER (WHERE pr.status = 'approved') AS approved,
				count(*) FILTER (WHERE pr.status = 'rejected') AS rejected,
				count(*) FILTER (WHERE pr.status = 'dismissed') AS dismissed,
				count(*) AS all_count
			FROM search_filtered pr
			WHERE %s
		),
		duplicate_counts AS (
			SELECT
				count(*) AS all_count,
				count(*) FILTER (WHERE pr.likely_duplicate) AS likely,
				count(*) FILTER (WHERE NOT pr.likely_duplicate) AS not_likely
			FROM status_filtered pr
		)
		SELECT
			COALESCE(
				(
					SELECT array_agg(
						pr.id
						ORDER BY page_groups.page_order, (pr.status = 'pending') DESC, pr.created_at DESC, pr.id DESC
					)
					FROM filtered pr
					JOIN page_groups ON page_groups.group_id = pr.group_id
				),
				ARRAY[]::bigint[]
			),
			(SELECT count(*) FROM filtered),
			(SELECT count(*) FROM matching_groups),
			status_counts.pending,
			status_counts.approved,
			status_counts.rejected,
			status_counts.dismissed,
			status_counts.all_count,
			duplicate_counts.all_count,
			duplicate_counts.likely,
			duplicate_counts.not_likely
		FROM status_counts
		CROSS JOIN duplicate_counts`,
		professorRequestGroupingCTEs,
		professorRequestLikelyDuplicateCondition("pr"),
		searchCondition,
		statusCondition,
		duplicateCondition,
		duplicateCondition,
	)

	return query, args
}

func professorRequestSearchCondition(alias string, argument int) string {
	return fmt.Sprintf(`(
		%s.id::text ILIKE $%[2]d
		OR (%[1]s.professor_name || ' ' || COALESCE(%[1]s.professor_email, '') || ' ' || %[1]s.university || ' ' || COALESCE(%[1]s.college, '')) ILIKE $%[2]d
	)`, alias, argument)
}

func professorRequestDuplicateFilterCondition(alias, duplicate string) string {
	switch duplicate {
	case "likely":
		return alias + ".likely_duplicate"
	case "not_likely":
		return "NOT " + alias + ".likely_duplicate"
	default:
		return "TRUE"
	}
}

func professorRequestLikelyDuplicateCondition(alias string) string {
	return fmt.Sprintf(`EXISTS (
		SELECT 1
		FROM professor.professor candidate
		WHERE (
			%[1]s.professor_email IS NOT NULL
			AND lower(candidate.email) = lower(%[1]s.professor_email)
		) OR (
			lower(regexp_replace(btrim(candidate.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(%[1]s.professor_name), '\s+', ' ', 'g'))
			AND lower(regexp_replace(btrim(candidate.university), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(%[1]s.university), '\s+', ' ', 'g'))
		) OR similarity(lower(candidate.name), lower(%[1]s.professor_name)) >= 0.85
	)`, alias)
}

func (db *AdminDB) loadProfessorRequests(ctx context.Context, ids []int64, includeModerationContext bool) ([]v1.AdminProfessorRequest, error) {
	if len(ids) == 0 {
		return []v1.AdminProfessorRequest{}, nil
	}

	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		WITH RECURSIVE
		%s
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
			pr.moderation_note,
			pr.resolved_professor_email,
			request_groups.group_id,
			(request_group_sizes.request_count - 1)::int,
			%s AS likely_duplicate
		FROM professor.professor_request pr
		JOIN request_groups ON request_groups.request_id = pr.id
		JOIN request_group_sizes ON request_group_sizes.group_id = request_groups.group_id
		WHERE pr.id = ANY($1::bigint[])`,
		professorRequestGroupingCTEs,
		professorRequestLikelyDuplicateCondition("pr"),
	), ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requestsByID := make(map[int64]*v1.AdminProfessorRequest, len(ids))
	for rows.Next() {
		var request v1.AdminProfessorRequest
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
			&request.ResolvedProfessorEmail,
			&request.RelatedGroupID,
			&request.RelatedRequestCount,
			&request.LikelyDuplicate,
		); err != nil {
			return nil, err
		}
		request.Matches = []v1.AdminProfessorMatch{}
		request.Signals = []v1.AdminModerationSignal{}
		request.ActionHistory = []v1.AdminModerationAction{}
		requestsByID[request.ID] = &request
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := db.attachProfessorRequestMatches(ctx, ids, requestsByID); err != nil {
		return nil, err
	}
	if includeModerationContext {
		if err := db.attachProfessorRequestSignals(ctx, ids, requestsByID); err != nil {
			return nil, err
		}
		if err := db.attachProfessorRequestActions(ctx, ids, requestsByID); err != nil {
			return nil, err
		}
	}

	requests := make([]v1.AdminProfessorRequest, 0, len(ids))
	for _, id := range ids {
		if request, ok := requestsByID[id]; ok {
			requests = append(requests, *request)
		}
	}
	return requests, nil
}

func (db *AdminDB) attachProfessorRequestMatches(ctx context.Context, ids []int64, requestsByID map[int64]*v1.AdminProfessorRequest) error {
	rows, err := db.db.Pool.Query(ctx, professorRequestMatchesQuery, ids, professorRequestMatchLimit)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			requestID int64
			match     v1.AdminProfessorMatch
		)
		if err := rows.Scan(
			&requestID,
			&match.Email,
			&match.Name,
			&match.University,
			&match.College,
			&match.Visible,
			&match.MatchType,
			&match.NameSimilarity,
		); err != nil {
			return err
		}
		if request, ok := requestsByID[requestID]; ok {
			request.Matches = append(request.Matches, match)
		}
	}

	return rows.Err()
}

func (db *AdminDB) attachProfessorRequestSignals(ctx context.Context, ids []int64, requestsByID map[int64]*v1.AdminProfessorRequest) error {
	targetIDs := professorRequestTargetIDs(ids)
	rows, err := db.db.Pool.Query(ctx, `
		SELECT id, target_type, target_id, source, attribute, score, threshold, severity, payload, created_at
		FROM moderation.signal
		WHERE target_type = 'professor_request'
		  AND target_id = ANY($1::text[])
		ORDER BY created_at DESC`, targetIDs)
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
		requestID, err := strconv.ParseInt(signal.TargetID, 10, 64)
		if err != nil {
			continue
		}
		if request, ok := requestsByID[requestID]; ok {
			request.Signals = append(request.Signals, signal)
		}
	}
	return rows.Err()
}

func (db *AdminDB) attachProfessorRequestActions(ctx context.Context, ids []int64, requestsByID map[int64]*v1.AdminProfessorRequest) error {
	targetIDs := professorRequestTargetIDs(ids)
	rows, err := db.db.Pool.Query(ctx, `
		SELECT id, actor_user_id, target_type, target_id, action, reason_code, note, previous_state, next_state, created_at
		FROM moderation.action_log
		WHERE target_type = 'professor_request'
		  AND target_id = ANY($1::text[])
		ORDER BY created_at DESC`, targetIDs)
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
		requestID, err := strconv.ParseInt(action.TargetID, 10, 64)
		if err != nil {
			continue
		}
		if request, ok := requestsByID[requestID]; ok {
			request.ActionHistory = append(request.ActionHistory, action)
		}
	}
	return rows.Err()
}

func professorRequestTargetIDs(ids []int64) []string {
	targetIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		targetIDs = append(targetIDs, strconv.FormatInt(id, 10))
	}
	return targetIDs
}

func (db *AdminDB) DecideProfessorRequest(ctx context.Context, decision ProfessorRequestDecision) (*ProfessorRequestDecisionResult, error) {
	tx, err := db.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	current, err := getProfessorRequestForUpdate(ctx, tx, decision.RequestID)
	if err != nil {
		return nil, err
	}
	if current.Status != "pending" {
		return nil, ErrProfessorRequestAlreadyDecided
	}

	name := current.ProfessorName
	if decision.ProfessorName != nil {
		name = *decision.ProfessorName
	}
	email := current.ProfessorEmail
	if decision.ProfessorEmail != nil {
		email = copyStringPointer(decision.ProfessorEmail)
	}
	university := current.University
	if decision.University != nil {
		university = *decision.University
	}
	college := current.College
	if decision.College != nil {
		college = copyStringPointer(decision.College)
	}

	status, action, resolvedEmail, err := resolveProfessorRequestDecision(
		ctx,
		tx,
		decision,
		name,
		email,
		university,
		college,
	)
	if err != nil {
		return nil, err
	}

	previousState, err := json.Marshal(professorRequestAuditState(*current))
	if err != nil {
		return nil, err
	}

	updated, err := updateProfessorRequestDecision(
		ctx,
		tx,
		decision,
		name,
		email,
		university,
		college,
		status,
		resolvedEmail,
	)
	if err != nil {
		return nil, err
	}

	nextState, err := json.Marshal(professorRequestAuditState(*updated))
	if err != nil {
		return nil, err
	}
	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   decision.ActorUserID,
		TargetType:    "professor_request",
		TargetID:      strconv.FormatInt(decision.RequestID, 10),
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

	request, err := db.GetProfessorRequest(ctx, decision.RequestID)
	if err != nil {
		return nil, err
	}
	if request == nil {
		return nil, ErrNotFound
	}
	return &ProfessorRequestDecisionResult{Request: request, Action: action}, nil
}

type professorRequestTx interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

func getProfessorRequestForUpdate(ctx context.Context, tx professorRequestTx, requestID int64) (*v1.AdminProfessorRequestSummary, error) {
	var request v1.AdminProfessorRequestSummary
	err := tx.QueryRow(ctx, `
		SELECT
			id,
			professor_name,
			professor_email,
			university,
			college,
			status,
			session_id,
			user_id,
			created_at,
			reviewed_at,
			reviewer_user_id,
			moderation_reason_code,
			moderation_note,
			resolved_professor_email
		FROM professor.professor_request
		WHERE id = $1
		FOR UPDATE`, requestID).Scan(
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
		&request.ResolvedProfessorEmail,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &request, nil
}

func resolveProfessorRequestDecision(
	ctx context.Context,
	tx professorRequestTx,
	decision ProfessorRequestDecision,
	name string,
	email *string,
	university string,
	college *string,
) (string, string, *string, error) {
	switch decision.Decision {
	case "approve":
		if strings.TrimSpace(name) == "" || email == nil || strings.TrimSpace(*email) == "" || strings.TrimSpace(university) == "" || college == nil || strings.TrimSpace(*college) == "" {
			return "", "", nil, ErrInvalidProfessorRequestDecision
		}
		var existingEmail string
		err := tx.QueryRow(ctx, `
			SELECT email
			FROM professor.professor
			WHERE lower(email) = lower($1)
			ORDER BY email
			LIMIT 1`, *email).Scan(&existingEmail)
		if err == nil {
			return "", "", nil, ErrProfessorAlreadyExists
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return "", "", nil, err
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO professor.professor (
				email,
				name,
				college,
				university,
				moderated_at,
				moderator_user_id,
				moderation_reason_code,
				moderation_note
			)
			VALUES ($1, $2, $3, $4, now(), $5, $6, $7)`,
			*email,
			name,
			*college,
			university,
			decision.ActorUserID,
			decision.ReasonCode,
			decision.Note,
		)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				return "", "", nil, ErrProfessorAlreadyExists
			}
			return "", "", nil, err
		}
		return "approved", "approve", copyStringPointer(email), nil

	case "reject":
		return "rejected", "reject", nil, nil

	case "dismiss":
		return "dismissed", "dismiss", nil, nil

	case "mark_duplicate":
		if decision.ResolvedProfessorEmail == nil || strings.TrimSpace(*decision.ResolvedProfessorEmail) == "" {
			return "", "", nil, ErrInvalidProfessorRequestDecision
		}
		var canonicalEmail string
		err := tx.QueryRow(ctx, `
			SELECT email
			FROM professor.professor
			WHERE lower(email) = lower($1)
			ORDER BY email
			LIMIT 1`, *decision.ResolvedProfessorEmail).Scan(&canonicalEmail)
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", nil, ErrResolvedProfessorNotFound
		}
		if err != nil {
			return "", "", nil, err
		}
		return "dismissed", "mark_duplicate", &canonicalEmail, nil
	default:
		return "", "", nil, ErrInvalidProfessorRequestDecision
	}
}

func updateProfessorRequestDecision(
	ctx context.Context,
	tx professorRequestTx,
	decision ProfessorRequestDecision,
	name string,
	email *string,
	university string,
	college *string,
	status string,
	resolvedEmail *string,
) (*v1.AdminProfessorRequestSummary, error) {
	var request v1.AdminProfessorRequestSummary
	err := tx.QueryRow(ctx, `
		UPDATE professor.professor_request
		SET
			professor_name = $2,
			professor_email = $3,
			university = $4,
			college = $5,
			status = $6,
			reviewed_at = now(),
			reviewer_user_id = $7,
			moderation_reason_code = $8,
			moderation_note = $9,
			resolved_professor_email = $10
		WHERE id = $1
		RETURNING
			id,
			professor_name,
			professor_email,
			university,
			college,
			status,
			session_id,
			user_id,
			created_at,
			reviewed_at,
			reviewer_user_id,
			moderation_reason_code,
			moderation_note,
			resolved_professor_email`,
		decision.RequestID,
		name,
		email,
		university,
		college,
		status,
		decision.ActorUserID,
		decision.ReasonCode,
		decision.Note,
		resolvedEmail,
	).Scan(
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
		&request.ResolvedProfessorEmail,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &request, nil
}

func professorRequestAuditState(request v1.AdminProfessorRequestSummary) map[string]any {
	return map[string]any{
		"professor_name":           request.ProfessorName,
		"professor_email":          request.ProfessorEmail,
		"university":               request.University,
		"college":                  request.College,
		"status":                   request.Status,
		"reviewed_at":              request.ReviewedAt,
		"reviewer_user_id":         request.ReviewerUserID,
		"moderation_reason_code":   request.ModerationReasonCode,
		"moderation_note":          request.ModerationNote,
		"resolved_professor_email": request.ResolvedProfessorEmail,
	}
}

func copyStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}
