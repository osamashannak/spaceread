package database

import (
	"context"
	"encoding/json"
	"strconv"

	"github.com/jackc/pgx/v5"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

// ProfessorRequestGroupDecisionResult describes a group decision after all
// pending members have been committed. Request is the selected representative.
type ProfessorRequestGroupDecisionResult struct {
	Request       *v1.AdminProfessorRequest
	Action        string
	AffectedCount int
}

type professorRequestGroupMutation struct {
	Current       v1.AdminProfessorRequestSummary
	Decision      ProfessorRequestDecision
	Name          string
	Email         *string
	University    string
	College       *string
	Status        string
	Action        string
	ResolvedEmail *string
}

// DecideProfessorRequestGroup applies a decision atomically to the selected
// request's full transitive group. Requests which were already decided are
// retained as historical records and are not modified or re-audited.
//
// Approval is intentionally asymmetric: the selected request creates exactly
// one professor and is approved, while every other pending group member is
// marked as a duplicate of that canonical professor. The remaining decisions
// are applied uniformly to every pending member.
func (db *AdminDB) DecideProfessorRequestGroup(ctx context.Context, decision ProfessorRequestDecision) (*ProfessorRequestGroupDecisionResult, error) {
	tx, err := db.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	members, err := getProfessorRequestGroupForUpdate(ctx, tx, decision.RequestID)
	if err != nil {
		return nil, err
	}

	var representative *v1.AdminProfessorRequestSummary
	for i := range members {
		if members[i].ID == decision.RequestID {
			representative = &members[i]
			break
		}
	}
	if representative == nil {
		return nil, ErrNotFound
	}
	if representative.Status != "pending" {
		return nil, ErrProfessorRequestAlreadyDecided
	}

	name, email, university, college := professorRequestDecisionFields(*representative, decision)
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

	mutations := buildProfessorRequestGroupMutations(
		members,
		decision,
		name,
		email,
		university,
		college,
		status,
		action,
		resolvedEmail,
	)
	if err := applyProfessorRequestGroupMutations(ctx, tx, mutations); err != nil {
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
	return &ProfessorRequestGroupDecisionResult{
		Request:       request,
		Action:        action,
		AffectedCount: len(mutations),
	}, nil
}

func applyProfessorRequestGroupMutations(
	ctx context.Context,
	tx professorRequestTx,
	mutations []professorRequestGroupMutation,
) error {
	for _, mutation := range mutations {
		if err := updateAndAuditProfessorRequest(
			ctx,
			tx,
			mutation.Current,
			mutation.Decision,
			mutation.Name,
			mutation.Email,
			mutation.University,
			mutation.College,
			mutation.Status,
			mutation.Action,
			mutation.ResolvedEmail,
		); err != nil {
			return err
		}
	}
	return nil
}

func buildProfessorRequestGroupMutations(
	members []v1.AdminProfessorRequestSummary,
	decision ProfessorRequestDecision,
	representativeName string,
	representativeEmail *string,
	representativeUniversity string,
	representativeCollege *string,
	status string,
	action string,
	resolvedEmail *string,
) []professorRequestGroupMutation {
	mutations := make([]professorRequestGroupMutation, 0, len(members))
	for _, member := range members {
		if member.Status != "pending" {
			continue
		}

		memberDecision := decision
		memberDecision.RequestID = member.ID
		mutation := professorRequestGroupMutation{
			Current:       member,
			Decision:      memberDecision,
			Name:          member.ProfessorName,
			Email:         copyStringPointer(member.ProfessorEmail),
			University:    member.University,
			College:       copyStringPointer(member.College),
			Status:        status,
			Action:        action,
			ResolvedEmail: copyStringPointer(resolvedEmail),
		}

		if member.ID == decision.RequestID {
			mutation.Name = representativeName
			mutation.Email = copyStringPointer(representativeEmail)
			mutation.University = representativeUniversity
			mutation.College = copyStringPointer(representativeCollege)
		} else if decision.Decision == "approve" {
			mutation.Status = "dismissed"
			mutation.Action = "mark_duplicate"
		}
		mutations = append(mutations, mutation)
	}
	return mutations
}

func professorRequestDecisionFields(
	request v1.AdminProfessorRequestSummary,
	decision ProfessorRequestDecision,
) (string, *string, string, *string) {
	name := request.ProfessorName
	if decision.ProfessorName != nil {
		name = *decision.ProfessorName
	}
	email := copyStringPointer(request.ProfessorEmail)
	if decision.ProfessorEmail != nil {
		email = copyStringPointer(decision.ProfessorEmail)
	}
	university := request.University
	if decision.University != nil {
		university = *decision.University
	}
	college := copyStringPointer(request.College)
	if decision.College != nil {
		college = copyStringPointer(decision.College)
	}
	return name, email, university, college
}

func updateAndAuditProfessorRequest(
	ctx context.Context,
	tx professorRequestTx,
	current v1.AdminProfessorRequestSummary,
	decision ProfessorRequestDecision,
	name string,
	email *string,
	university string,
	college *string,
	status string,
	action string,
	resolvedEmail *string,
) error {
	previousState, err := json.Marshal(professorRequestAuditState(current))
	if err != nil {
		return err
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
		return err
	}

	nextState, err := json.Marshal(professorRequestAuditState(*updated))
	if err != nil {
		return err
	}
	return insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   decision.ActorUserID,
		TargetType:    "professor_request",
		TargetID:      strconv.FormatInt(decision.RequestID, 10),
		Action:        action,
		ReasonCode:    decision.ReasonCode,
		Note:          decision.Note,
		PreviousState: previousState,
		NextState:     nextState,
	})
}

func getProfessorRequestGroupForUpdate(ctx context.Context, tx pgx.Tx, requestID int64) ([]v1.AdminProfessorRequestSummary, error) {
	rows, err := tx.Query(ctx, `
		WITH RECURSIVE component AS (
			SELECT
				pr.id,
				CASE WHEN pr.professor_email IS NULL THEN NULL ELSE lower(pr.professor_email) END AS email_key,
				lower(regexp_replace(btrim(pr.professor_name), '\s+', ' ', 'g')) AS name_key,
				lower(regexp_replace(btrim(pr.university), '\s+', ' ', 'g')) AS university_key
			FROM professor.professor_request pr
			WHERE pr.id = $1

			UNION

			SELECT
				neighbor.id,
				CASE WHEN neighbor.professor_email IS NULL THEN NULL ELSE lower(neighbor.professor_email) END,
				lower(regexp_replace(btrim(neighbor.professor_name), '\s+', ' ', 'g')),
				lower(regexp_replace(btrim(neighbor.university), '\s+', ' ', 'g'))
			FROM component current
			JOIN professor.professor_request neighbor ON (
				current.email_key IS NOT NULL
				AND neighbor.professor_email IS NOT NULL
				AND lower(neighbor.professor_email) = current.email_key
			) OR (
				lower(regexp_replace(btrim(neighbor.professor_name), '\s+', ' ', 'g')) = current.name_key
				AND lower(regexp_replace(btrim(neighbor.university), '\s+', ' ', 'g')) = current.university_key
			)
		)
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
			pr.resolved_professor_email
		FROM professor.professor_request pr
		JOIN component ON component.id = pr.id
		ORDER BY pr.id
		FOR UPDATE OF pr`, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make([]v1.AdminProfessorRequestSummary, 0)
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
			&request.ResolvedProfessorEmail,
		); err != nil {
			return nil, err
		}
		members = append(members, request)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(members) == 0 {
		return nil, ErrNotFound
	}
	return members, nil
}
