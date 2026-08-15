package database

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

type ListCourseFileOptions struct {
	Limit                int
	Offset               int
	Sort                 string
	NeedsAttention       bool
	Visible              *bool
	Reviewed             *bool
	Signals              string
	HasSession           string
	HasUser              string
	Search               string
	FileID               *int64
	Name                 string
	CourseTag            string
	CourseName           string
	FileType             string
	ModerationReasonCode string
	ReviewerUserID       *int64
	SessionID            *int64
	UserID               *int64
	SizeMin              *int
	SizeMax              *int
	DownloadMin          *int
	DownloadMax          *int
	CreatedFrom          *time.Time
	CreatedTo            *time.Time
	ReviewedFrom         *time.Time
	ReviewedTo           *time.Time
}

type CourseFileVisibilityDecision struct {
	FileID      int64
	Visible     bool
	ActorUserID *int64
	ReasonCode  *string
	Note        *string
}

type CourseFileNoteDecision struct {
	FileID      int64
	ActorUserID *int64
	Note        *string
}

type CourseFileDecisionResult struct {
	File   *v1.AdminCourseFileSummary
	Action string
}

func (db *AdminDB) ListCourseFiles(ctx context.Context, opts ListCourseFileOptions) ([]v1.AdminCourseFileSummary, error) {
	ids, err := db.listCourseFileIDs(ctx, opts)
	if err != nil {
		return nil, err
	}

	return db.loadCourseFiles(ctx, ids)
}

func (db *AdminDB) GetCourseFile(ctx context.Context, id int64) (*v1.AdminCourseFileSummary, error) {
	files, err := db.loadCourseFiles(ctx, []int64{id})
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, nil
	}
	return &files[0], nil
}

func (db *AdminDB) SetCourseFileVisibility(ctx context.Context, decision CourseFileVisibilityDecision) (*CourseFileDecisionResult, error) {
	tx, err := db.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var (
		previousVisible  bool
		previousReviewed bool
		previousState    []byte
		nextState        []byte
	)

	err = tx.QueryRow(ctx, `
		WITH current AS (
			SELECT id, visible, reviewed, reviewed_at, reviewer_user_id, moderation_reason_code, moderation_note
			FROM course.file
			WHERE id = $1
			FOR UPDATE
		),
		updated AS (
			UPDATE course.file cf
			SET
				visible = $2,
				reviewed = true,
				reviewed_at = now(),
				reviewer_user_id = $3,
				moderation_reason_code = $4,
				moderation_note = $5
			FROM current
			WHERE cf.id = current.id
			RETURNING
				current.visible AS previous_visible,
				current.reviewed AS previous_reviewed,
				jsonb_build_object(
					'visible', current.visible,
					'reviewed', current.reviewed,
					'reviewed_at', current.reviewed_at,
					'reviewer_user_id', current.reviewer_user_id,
					'moderation_reason_code', current.moderation_reason_code,
					'moderation_note', current.moderation_note
				) AS previous_state,
				jsonb_build_object(
					'visible', cf.visible,
					'reviewed', cf.reviewed,
					'reviewed_at', cf.reviewed_at,
					'reviewer_user_id', cf.reviewer_user_id,
					'moderation_reason_code', cf.moderation_reason_code,
					'moderation_note', cf.moderation_note
				) AS next_state
		)
		SELECT previous_visible, previous_reviewed, previous_state, next_state
		FROM updated`,
		decision.FileID,
		decision.Visible,
		decision.ActorUserID,
		decision.ReasonCode,
		decision.Note,
	).Scan(&previousVisible, &previousReviewed, &previousState, &nextState)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	action := courseFileVisibilityAction(previousVisible, previousReviewed, decision.Visible)
	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   decision.ActorUserID,
		TargetType:    "course_file",
		TargetID:      strconv.FormatInt(decision.FileID, 10),
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

	return db.courseFileDecisionResult(ctx, decision.FileID, action)
}

func (db *AdminDB) SaveCourseFileNote(ctx context.Context, decision CourseFileNoteDecision) (*CourseFileDecisionResult, error) {
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
			FROM course.file
			WHERE id = $1
			FOR UPDATE
		),
		updated AS (
			UPDATE course.file cf
			SET
				moderation_note = $2,
				reviewer_user_id = $3
			FROM current
			WHERE cf.id = current.id
			RETURNING
				jsonb_build_object('moderation_note', current.moderation_note) AS previous_state,
				jsonb_build_object('moderation_note', cf.moderation_note, 'reviewer_user_id', cf.reviewer_user_id) AS next_state
		)
		SELECT previous_state, next_state
		FROM updated`,
		decision.FileID,
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
		TargetType:    "course_file",
		TargetID:      strconv.FormatInt(decision.FileID, 10),
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

	return db.courseFileDecisionResult(ctx, decision.FileID, "note")
}

func (db *AdminDB) courseFileDecisionResult(ctx context.Context, fileID int64, action string) (*CourseFileDecisionResult, error) {
	file, err := db.GetCourseFile(ctx, fileID)
	if err != nil {
		return nil, err
	}
	if file == nil {
		return nil, ErrNotFound
	}
	return &CourseFileDecisionResult{File: file, Action: action}, nil
}

func (db *AdminDB) listCourseFileIDs(ctx context.Context, opts ListCourseFileOptions) ([]int64, error) {
	if opts.Limit <= 0 {
		opts.Limit = 50
	}
	if opts.Offset < 0 {
		opts.Offset = 0
	}

	args := []any{opts.Limit, opts.Offset}
	nextArg := func(value any) string {
		args = append(args, value)
		return fmt.Sprintf("$%d", len(args))
	}

	conditions := []string{}
	add := func(condition string) {
		conditions = append(conditions, condition)
	}
	addText := func(expression, value string) {
		if value != "" {
			add(fmt.Sprintf("%s ILIKE %s", expression, nextArg("%"+value+"%")))
		}
	}
	addExactText := func(expression, value string) {
		if value != "" {
			add(fmt.Sprintf("LOWER(%s) = LOWER(%s)", expression, nextArg(value)))
		}
	}
	addIntMin := func(expression string, value *int) {
		if value != nil {
			add(fmt.Sprintf("%s >= %s", expression, nextArg(*value)))
		}
	}
	addIntMax := func(expression string, value *int) {
		if value != nil {
			add(fmt.Sprintf("%s <= %s", expression, nextArg(*value)))
		}
	}
	addTimeMin := func(expression string, value *time.Time) {
		if value != nil {
			add(fmt.Sprintf("%s >= %s", expression, nextArg(*value)))
		}
	}
	addTimeMax := func(expression string, value *time.Time) {
		if value != nil {
			add(fmt.Sprintf("%s <= %s", expression, nextArg(*value)))
		}
	}

	if opts.NeedsAttention {
		add("(cf.reviewed = false OR COALESCE(sc.signal_count, 0) > 0)")
	}
	if opts.Visible != nil {
		add(fmt.Sprintf("cf.visible = %s", nextArg(*opts.Visible)))
	}
	if opts.Reviewed != nil {
		add(fmt.Sprintf("cf.reviewed = %s", nextArg(*opts.Reviewed)))
	}
	switch opts.Signals {
	case "has":
		add("COALESCE(sc.signal_count, 0) > 0")
	case "none":
		add("COALESCE(sc.signal_count, 0) = 0")
	}
	switch opts.HasSession {
	case "has":
		add("cf.session_id IS NOT NULL")
	case "none":
		add("cf.session_id IS NULL")
	}
	switch opts.HasUser {
	case "has":
		add("cf.user_id IS NOT NULL")
	case "none":
		add("cf.user_id IS NULL")
	}

	if opts.Search != "" {
		param := nextArg("%" + opts.Search + "%")
		add(fmt.Sprintf(`(
			cf.id::text ILIKE %[1]s
			OR cf.name ILIKE %[1]s
			OR cf.type ILIKE %[1]s
			OR cf.course_tag ILIKE %[1]s
			OR COALESCE(c.name, '') ILIKE %[1]s
			OR COALESCE(cf.blob_name, '') ILIKE %[1]s
			OR COALESCE(cf.moderation_reason_code, '') ILIKE %[1]s
			OR COALESCE(cf.moderation_note, '') ILIKE %[1]s
			OR COALESCE(cf.user_id::text, '') ILIKE %[1]s
			OR COALESCE(cf.session_id::text, '') ILIKE %[1]s
		)`, param))
	}

	if opts.FileID != nil {
		add(fmt.Sprintf("cf.id = %s", nextArg(*opts.FileID)))
	}
	addText("cf.name", opts.Name)
	addText("cf.course_tag", opts.CourseTag)
	addText("COALESCE(c.name, '')", opts.CourseName)
	addText("cf.type", opts.FileType)
	addExactText("COALESCE(cf.moderation_reason_code, '')", opts.ModerationReasonCode)
	if opts.ReviewerUserID != nil {
		add(fmt.Sprintf("cf.reviewer_user_id = %s", nextArg(*opts.ReviewerUserID)))
	}
	if opts.SessionID != nil {
		add(fmt.Sprintf("cf.session_id = %s", nextArg(*opts.SessionID)))
	}
	if opts.UserID != nil {
		add(fmt.Sprintf("cf.user_id = %s", nextArg(*opts.UserID)))
	}
	addIntMin("cf.size", opts.SizeMin)
	addIntMax("cf.size", opts.SizeMax)
	addIntMin("cf.download_count", opts.DownloadMin)
	addIntMax("cf.download_count", opts.DownloadMax)
	addTimeMin("cf.created_at", opts.CreatedFrom)
	addTimeMax("cf.created_at", opts.CreatedTo)
	addTimeMin("cf.reviewed_at", opts.ReviewedFrom)
	addTimeMax("cf.reviewed_at", opts.ReviewedTo)

	where := "TRUE"
	if len(conditions) > 0 {
		where = strings.Join(conditions, "\n\t\t\tAND ")
	}

	query := fmt.Sprintf(`
		WITH signal_counts AS (
			SELECT target_id, count(*) AS signal_count
			FROM moderation.signal
			WHERE target_type = 'course_file'
			GROUP BY target_id
		)
		SELECT cf.id
		FROM course.file cf
		LEFT JOIN course.course c ON c.tag = cf.course_tag
		LEFT JOIN signal_counts sc ON sc.target_id = cf.id::text
		WHERE %s
		ORDER BY %s
		LIMIT $1 OFFSET $2`, where, courseFileListOrderBy(opts.Sort))

	rows, err := db.db.Pool.Query(ctx, query, args...)
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

func courseFileListOrderBy(sort string) string {
	switch sort {
	case "oldest":
		return "cf.created_at ASC, cf.id ASC"
	case "largest":
		return "cf.size DESC, cf.created_at DESC, cf.id DESC"
	case "most_downloads":
		return "cf.download_count DESC, cf.created_at DESC, cf.id DESC"
	case "most_signals":
		return "COALESCE(sc.signal_count, 0) DESC, cf.created_at DESC, cf.id DESC"
	default:
		return "cf.created_at DESC, cf.id DESC"
	}
}

func (db *AdminDB) loadCourseFiles(ctx context.Context, ids []int64) ([]v1.AdminCourseFileSummary, error) {
	if len(ids) == 0 {
		return []v1.AdminCourseFileSummary{}, nil
	}

	rows, err := db.db.Pool.Query(ctx, `
		WITH signal_counts AS (
			SELECT target_id, count(*) AS signal_count
			FROM moderation.signal
			WHERE target_type = 'course_file'
			GROUP BY target_id
		)
		SELECT
			cf.id,
			cf.name,
			cf.type,
			cf.size,
			cf.visible,
			cf.reviewed,
			cf.course_tag,
			COALESCE(c.name, cf.course_tag) AS course_name,
			cf.download_count,
			cf.created_at,
			cf.user_id,
			cf.session_id,
			cf.reviewed_at,
			cf.reviewer_user_id,
			cf.moderation_reason_code,
			cf.moderation_note,
			cf.blob_name,
			COALESCE(sc.signal_count, 0)::int
		FROM course.file cf
		LEFT JOIN course.course c ON c.tag = cf.course_tag
		LEFT JOIN signal_counts sc ON sc.target_id = cf.id::text
		WHERE cf.id = ANY($1::bigint[])`,
		ids,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	filesByID := make(map[int64]*v1.AdminCourseFileSummary, len(ids))
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
			&file.CourseName,
			&file.DownloadCount,
			&file.CreatedAt,
			&file.UserID,
			&file.SessionID,
			&file.ReviewedAt,
			&file.ReviewerUserID,
			&file.ModerationReasonCode,
			&file.ModerationNote,
			&file.BlobName,
			&file.SignalCount,
		); err != nil {
			return nil, err
		}
		file.URL = db.formatCourseFileURL(file.BlobName)
		file.Signals = []v1.AdminModerationSignal{}
		file.ActionHistory = []v1.AdminModerationAction{}
		filesByID[file.ID] = &file
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := db.attachCourseFileSignals(ctx, ids, filesByID); err != nil {
		return nil, err
	}
	if err := db.attachCourseFileActions(ctx, ids, filesByID); err != nil {
		return nil, err
	}

	files := make([]v1.AdminCourseFileSummary, 0, len(ids))
	for _, id := range ids {
		if file, ok := filesByID[id]; ok {
			files = append(files, *file)
		}
	}
	return files, nil
}

func (db *AdminDB) attachCourseFileSignals(ctx context.Context, ids []int64, filesByID map[int64]*v1.AdminCourseFileSummary) error {
	targetIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		targetIDs = append(targetIDs, strconv.FormatInt(id, 10))
	}

	rows, err := db.db.Pool.Query(ctx, `
		SELECT id, target_type, target_id, source, attribute, score, threshold, severity, payload, created_at
		FROM moderation.signal
		WHERE target_type = 'course_file'
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
		fileID, err := strconv.ParseInt(signal.TargetID, 10, 64)
		if err != nil {
			continue
		}
		if file, ok := filesByID[fileID]; ok {
			file.Signals = append(file.Signals, signal)
		}
	}
	return rows.Err()
}

func (db *AdminDB) attachCourseFileActions(ctx context.Context, ids []int64, filesByID map[int64]*v1.AdminCourseFileSummary) error {
	targetIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		targetIDs = append(targetIDs, strconv.FormatInt(id, 10))
	}

	rows, err := db.db.Pool.Query(ctx, `
		SELECT id, actor_user_id, target_type, target_id, action, reason_code, note, previous_state, next_state, created_at
		FROM moderation.action_log
		WHERE target_type = 'course_file'
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
		fileID, err := strconv.ParseInt(action.TargetID, 10, 64)
		if err != nil {
			continue
		}
		if file, ok := filesByID[fileID]; ok {
			file.ActionHistory = append(file.ActionHistory, action)
		}
	}
	return rows.Err()
}

func courseFileVisibilityAction(previousVisible, previousReviewed, nextVisible bool) string {
	if nextVisible {
		if previousVisible || !previousReviewed {
			return "approve"
		}
		return "restore"
	}
	if previousVisible {
		return "hide"
	}
	return "reject"
}
