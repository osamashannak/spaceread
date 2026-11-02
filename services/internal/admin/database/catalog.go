package database

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

// ErrInvalidCourse is returned when a professor edit references a course tag that does not exist.
var ErrInvalidCourse = errors.New("unknown course tag")

type ListCatalogProfessorOptions struct {
	Limit      int
	Offset     int
	Search     string
	Visible    *bool
	University string
	Sort       string
}

type CatalogProfessorUpdate struct {
	Email       string
	Name        string
	College     string
	University  string
	Aliases     []string
	Visible     bool
	CourseTags  []string
	ActorUserID *int64
	ReasonCode  *string
	Note        *string
}

type CatalogProfessorMerge struct {
	SourceEmail string
	TargetEmail string
	ActorUserID *int64
	Note        *string
}

type ListCatalogCourseOptions struct {
	Limit  int
	Offset int
	Search string
	Sort   string
}

type CatalogCourseUpdate struct {
	Tag         string
	Name        string
	ActorUserID *int64
	Note        *string
}

const catalogProfessorColumns = `
	p.email,
	p.name,
	p.college,
	p.university,
	p.visible,
	COALESCE(p.aliases, '{}'::text[]),
	p.views,
	COALESCE(rc.review_count, 0),
	COALESCE(rc.visible_review_count, 0),
	(SELECT count(*) FROM professor.professor_course_history h WHERE h.email = p.email),
	p.moderated_at`

const catalogProfessorFrom = `
	FROM professor.professor p
	LEFT JOIN (
		-- Count once per professor; a per-row lateral scan took 30+ seconds.
		SELECT professor_email, count(*) AS review_count, count(*) FILTER (WHERE visible) AS visible_review_count
		FROM professor.review
		WHERE deleted_at IS NULL
		GROUP BY professor_email
	) rc ON rc.professor_email = p.email`

func scanCatalogProfessor(row pgx.Row, professor *v1.AdminCatalogProfessor) error {
	return row.Scan(
		&professor.Email,
		&professor.Name,
		&professor.College,
		&professor.University,
		&professor.Visible,
		&professor.Aliases,
		&professor.Views,
		&professor.ReviewCount,
		&professor.VisibleReviewCount,
		&professor.CourseCount,
		&professor.ModeratedAt,
	)
}

func (db *AdminDB) ListCatalogProfessors(ctx context.Context, opts ListCatalogProfessorOptions) (*v1.AdminCatalogProfessorListResponse, error) {
	conditions := []string{"TRUE"}
	args := []any{opts.Limit, opts.Offset}
	if opts.Search != "" {
		args = append(args, "%"+opts.Search+"%")
		conditions = append(conditions, fmt.Sprintf(`(
			p.name ILIKE $%[1]d OR p.email ILIKE $%[1]d OR p.college ILIKE $%[1]d
			OR p.university ILIKE $%[1]d OR array_to_string(COALESCE(p.aliases, '{}'), ' ') ILIKE $%[1]d
		)`, len(args)))
	}
	if opts.Visible != nil {
		args = append(args, *opts.Visible)
		conditions = append(conditions, fmt.Sprintf("p.visible = $%d", len(args)))
	}
	if opts.University != "" {
		args = append(args, opts.University)
		conditions = append(conditions, fmt.Sprintf("p.university = $%d", len(args)))
	}

	orderBy := "COALESCE(rc.review_count, 0) DESC, p.name"
	switch opts.Sort {
	case "views":
		orderBy = "p.views DESC, p.name"
	case "name":
		orderBy = "lower(p.name), p.email"
	case "fewest_reviews":
		orderBy = "COALESCE(rc.review_count, 0) ASC, p.name"
	}

	rows, err := db.db.Pool.Query(ctx, `SELECT `+catalogProfessorColumns+`, count(*) OVER()`+catalogProfessorFrom+`
		WHERE `+strings.Join(conditions, " AND ")+`
		ORDER BY `+orderBy+`
		LIMIT $1 OFFSET $2`, args...)
	if err != nil {
		return nil, fmt.Errorf("list catalog professors: %w", err)
	}
	defer rows.Close()

	response := &v1.AdminCatalogProfessorListResponse{Professors: []v1.AdminCatalogProfessor{}, Limit: opts.Limit, Offset: opts.Offset}
	for rows.Next() {
		var professor v1.AdminCatalogProfessor
		if err := rows.Scan(
			&professor.Email, &professor.Name, &professor.College, &professor.University, &professor.Visible,
			&professor.Aliases, &professor.Views, &professor.ReviewCount, &professor.VisibleReviewCount,
			&professor.CourseCount, &professor.ModeratedAt, &response.Total,
		); err != nil {
			return nil, fmt.Errorf("scan catalog professor: %w", err)
		}
		response.Professors = append(response.Professors, professor)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	universities, err := db.db.Pool.Query(ctx, `SELECT DISTINCT university FROM professor.professor ORDER BY university`)
	if err != nil {
		return nil, fmt.Errorf("list universities: %w", err)
	}
	defer universities.Close()
	response.Universities = []string{}
	for universities.Next() {
		var university string
		if err := universities.Scan(&university); err != nil {
			return nil, err
		}
		response.Universities = append(response.Universities, university)
	}
	return response, universities.Err()
}

func (db *AdminDB) GetCatalogProfessor(ctx context.Context, email string) (*v1.AdminCatalogProfessorDetail, error) {
	detail := &v1.AdminCatalogProfessorDetail{}
	err := scanCatalogProfessor(db.db.Pool.QueryRow(ctx, `SELECT `+catalogProfessorColumns+catalogProfessorFrom+` WHERE p.email = $1`, email), &detail.AdminCatalogProfessor)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get catalog professor: %w", err)
	}

	rows, err := db.db.Pool.Query(ctx, `
		SELECT h.course_tag, COALESCE(c.name, '')
		FROM professor.professor_course_history h
		LEFT JOIN course.course c ON c.tag = h.course_tag
		WHERE h.email = $1
		ORDER BY h.course_tag`, email)
	if err != nil {
		return nil, fmt.Errorf("list professor courses: %w", err)
	}
	defer rows.Close()
	detail.Courses = []v1.AdminCatalogCourseRef{}
	for rows.Next() {
		var course v1.AdminCatalogCourseRef
		if err := rows.Scan(&course.Tag, &course.Name); err != nil {
			return nil, err
		}
		detail.Courses = append(detail.Courses, course)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := db.db.Pool.QueryRow(ctx, `
		SELECT COALESCE(sum(count), 0)::bigint
		FROM analytics.daily_count
		WHERE kind = 'professor_view' AND target = $1
		  AND day > (now() AT TIME ZONE '`+statsTimezone+`')::date - 30`, email).Scan(&detail.ViewsLast30); err != nil {
		return nil, fmt.Errorf("professor recent views: %w", err)
	}

	detail.ActionHistory, err = db.listActionsForTargets(ctx, []string{"professor"}, [][]string{{email}}, nil)
	if err != nil {
		return nil, err
	}
	return detail, nil
}

func (db *AdminDB) UpdateCatalogProfessor(ctx context.Context, update CatalogProfessorUpdate) (*v1.AdminCatalogProfessorDetail, error) {
	if update.CourseTags == nil {
		update.CourseTags = []string{}
	}
	before, err := db.GetCatalogProfessor(ctx, update.Email)
	if err != nil {
		return nil, err
	}

	tx, err := db.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var unknown []string
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(array_agg(wanted.tag), '{}')
		FROM unnest($1::text[]) AS wanted(tag)
		WHERE NOT EXISTS (SELECT 1 FROM course.course c WHERE c.tag = wanted.tag)`, update.CourseTags).Scan(&unknown); err != nil {
		return nil, fmt.Errorf("check course tags: %w", err)
	}
	if len(unknown) > 0 {
		return nil, fmt.Errorf("%w: %s", ErrInvalidCourse, strings.Join(unknown, ", "))
	}

	visibilityChanged := before.Visible != update.Visible
	if _, err := tx.Exec(ctx, `
		UPDATE professor.professor
		SET name = $2,
		    college = $3,
		    university = $4,
		    aliases = NULLIF($5::text[], '{}'),
		    visible = $6,
		    moderated_at = CASE WHEN $7 THEN now() ELSE moderated_at END,
		    moderator_user_id = CASE WHEN $7 THEN $8 ELSE moderator_user_id END,
		    moderation_reason_code = CASE WHEN $7 THEN $9 ELSE moderation_reason_code END,
		    moderation_note = CASE WHEN $7 THEN $10 ELSE moderation_note END
		WHERE email = $1`,
		update.Email, update.Name, update.College, update.University, update.Aliases, update.Visible,
		visibilityChanged, update.ActorUserID, update.ReasonCode, update.Note,
	); err != nil {
		return nil, fmt.Errorf("update professor: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM professor.professor_course_history
		WHERE email = $1 AND course_tag <> ALL($2::text[])`, update.Email, update.CourseTags); err != nil {
		return nil, fmt.Errorf("remove professor courses: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO professor.professor_course_history (email, course_tag)
		SELECT $1, tag FROM unnest($2::text[]) AS tag
		ON CONFLICT DO NOTHING`, update.Email, update.CourseTags); err != nil {
		return nil, fmt.Errorf("add professor courses: %w", err)
	}

	action := "edit"
	if visibilityChanged && update.Visible {
		action = "restore"
	} else if visibilityChanged {
		action = "hide"
	}
	courseTags := make([]string, 0, len(before.Courses))
	for _, course := range before.Courses {
		courseTags = append(courseTags, course.Tag)
	}
	previous, _ := json.Marshal(professorState(before.Name, before.College, before.University, before.Aliases, before.Visible, courseTags))
	next, _ := json.Marshal(professorState(update.Name, update.College, update.University, update.Aliases, update.Visible, update.CourseTags))
	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   update.ActorUserID,
		TargetType:    "professor",
		TargetID:      update.Email,
		Action:        action,
		ReasonCode:    update.ReasonCode,
		Note:          update.Note,
		PreviousState: previous,
		NextState:     next,
	}); err != nil {
		return nil, fmt.Errorf("log professor edit: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return db.GetCatalogProfessor(ctx, update.Email)
}

// MergeCatalogProfessors moves everything from the source professor onto the
// target and deletes the source. The source row and moved review IDs are kept
// in the action log so the merge can be traced.
func (db *AdminDB) MergeCatalogProfessors(ctx context.Context, merge CatalogProfessorMerge) (*v1.AdminCatalogProfessorDetail, []int64, error) {
	if merge.SourceEmail == merge.TargetEmail {
		return nil, nil, ErrConflict
	}
	source, err := db.GetCatalogProfessor(ctx, merge.SourceEmail)
	if err != nil {
		return nil, nil, err
	}
	if _, err := db.GetCatalogProfessor(ctx, merge.TargetEmail); err != nil {
		return nil, nil, err
	}

	tx, err := db.db.Pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	var movedReviewIDs []int64
	if err := tx.QueryRow(ctx, `
		WITH moved AS (
			UPDATE professor.review SET professor_email = $2 WHERE professor_email = $1 RETURNING id
		)
		SELECT COALESCE(array_agg(id), '{}') FROM moved`, merge.SourceEmail, merge.TargetEmail).Scan(&movedReviewIDs); err != nil {
		return nil, nil, fmt.Errorf("move reviews: %w", err)
	}

	// Moving the source's view total onto the target is not new traffic.
	if _, err := tx.Exec(ctx, `SELECT set_config('analytics.skip_daily_count', 'on', true)`); err != nil {
		return nil, nil, fmt.Errorf("pause daily view counting: %w", err)
	}

	statements := []string{
		`INSERT INTO professor.professor_course_history (email, course_tag)
			SELECT $2, course_tag FROM professor.professor_course_history WHERE email = $1
			ON CONFLICT DO NOTHING`,
		`DELETE FROM professor.professor_course_history WHERE email = $1`,
		`UPDATE professor.professor_request SET resolved_professor_email = $2 WHERE resolved_professor_email = $1`,
		`INSERT INTO analytics.daily_count (day, kind, target, count)
			SELECT day, kind, $2, count FROM analytics.daily_count WHERE kind = 'professor_view' AND target = $1
			ON CONFLICT (day, kind, target) DO UPDATE SET count = analytics.daily_count.count + EXCLUDED.count`,
		`DELETE FROM analytics.daily_count WHERE kind = 'professor_view' AND target = $1`,
		// Keep the old name and aliases searchable on the target.
		`UPDATE professor.professor t
			SET aliases = (
				SELECT NULLIF(array_agg(DISTINCT alias ORDER BY alias), '{}')
				FROM unnest(COALESCE(t.aliases, '{}') || COALESCE(s.aliases, '{}') || ARRAY[s.name]) AS alias
				WHERE alias IS NOT NULL AND btrim(alias) <> '' AND lower(alias) <> lower(t.name)
			),
			views = t.views + s.views
			FROM professor.professor s
			WHERE t.email = $2 AND s.email = $1`,
		`DELETE FROM professor.professor WHERE email = $1`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement, merge.SourceEmail, merge.TargetEmail); err != nil {
			return nil, nil, fmt.Errorf("merge professors: %w", err)
		}
	}

	courseTags := make([]string, 0, len(source.Courses))
	for _, course := range source.Courses {
		courseTags = append(courseTags, course.Tag)
	}
	previousState := professorState(source.Name, source.College, source.University, source.Aliases, source.Visible, courseTags)
	previousState["email"] = source.Email
	previousState["views"] = source.Views
	previous, _ := json.Marshal(previousState)
	next, _ := json.Marshal(map[string]any{"merged_into": merge.TargetEmail, "moved_review_ids": movedReviewIDs})
	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   merge.ActorUserID,
		TargetType:    "professor",
		TargetID:      merge.SourceEmail,
		Action:        "merge",
		Note:          merge.Note,
		PreviousState: previous,
		NextState:     next,
	}); err != nil {
		return nil, nil, fmt.Errorf("log merge on source: %w", err)
	}
	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID: merge.ActorUserID,
		TargetType:  "professor",
		TargetID:    merge.TargetEmail,
		Action:      "merge",
		Note:        merge.Note,
		NextState:   mustJSON(map[string]any{"merged_from": merge.SourceEmail, "moved_review_ids": movedReviewIDs}),
	}); err != nil {
		return nil, nil, fmt.Errorf("log merge on target: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	target, err := db.GetCatalogProfessor(ctx, merge.TargetEmail)
	return target, movedReviewIDs, err
}

func (db *AdminDB) ListCatalogCourses(ctx context.Context, opts ListCatalogCourseOptions) (*v1.AdminCatalogCourseListResponse, error) {
	args := []any{opts.Limit, opts.Offset}
	where := "TRUE"
	if opts.Search != "" {
		args = append(args, "%"+opts.Search+"%")
		where = "(c.tag ILIKE $3 OR c.name ILIKE $3)"
	}
	orderBy := "c.views DESC, c.tag"
	switch opts.Sort {
	case "files":
		orderBy = "COALESCE(f.file_count, 0) DESC, c.tag"
	case "tag":
		orderBy = "c.tag"
	}

	rows, err := db.db.Pool.Query(ctx, `
		SELECT
			c.tag, c.name, c.views,
			COALESCE(f.file_count, 0), COALESCE(f.visible_file_count, 0),
			(SELECT count(*) FROM professor.professor_course_history h WHERE h.course_tag = c.tag),
			count(*) OVER()
		FROM course.course c
		LEFT JOIN (
			SELECT course_tag, count(*) AS file_count, count(*) FILTER (WHERE visible) AS visible_file_count
			FROM course.file
			GROUP BY course_tag
		) f ON f.course_tag = c.tag
		WHERE `+where+`
		ORDER BY `+orderBy+`
		LIMIT $1 OFFSET $2`, args...)
	if err != nil {
		return nil, fmt.Errorf("list catalog courses: %w", err)
	}
	defer rows.Close()

	response := &v1.AdminCatalogCourseListResponse{Courses: []v1.AdminCatalogCourse{}, Limit: opts.Limit, Offset: opts.Offset}
	for rows.Next() {
		var course v1.AdminCatalogCourse
		if err := rows.Scan(&course.Tag, &course.Name, &course.Views, &course.FileCount, &course.VisibleFileCount, &course.ProfessorCount, &response.Total); err != nil {
			return nil, err
		}
		response.Courses = append(response.Courses, course)
	}
	return response, rows.Err()
}

func (db *AdminDB) UpdateCatalogCourse(ctx context.Context, update CatalogCourseUpdate) (*v1.AdminCatalogCourse, error) {
	tx, err := db.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var previousName string
	err = tx.QueryRow(ctx, `SELECT name FROM course.course WHERE tag = $1 FOR UPDATE`, update.Tag).Scan(&previousName)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `UPDATE course.course SET name = $2 WHERE tag = $1`, update.Tag, update.Name); err != nil {
		return nil, fmt.Errorf("update course: %w", err)
	}
	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   update.ActorUserID,
		TargetType:    "course",
		TargetID:      update.Tag,
		Action:        "edit",
		Note:          update.Note,
		PreviousState: mustJSON(map[string]any{"name": previousName}),
		NextState:     mustJSON(map[string]any{"name": update.Name}),
	}); err != nil {
		return nil, fmt.Errorf("log course edit: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	result, err := db.ListCatalogCourses(ctx, ListCatalogCourseOptions{Limit: 100, Search: update.Tag, Sort: "tag"})
	if err != nil {
		return nil, err
	}
	for _, course := range result.Courses {
		if course.Tag == update.Tag {
			return &course, nil
		}
	}
	return nil, ErrNotFound
}

func professorState(name, college, university string, aliases []string, visible bool, courseTags []string) map[string]any {
	return map[string]any{
		"name":        name,
		"college":     college,
		"university":  university,
		"aliases":     aliases,
		"visible":     visible,
		"course_tags": courseTags,
	}
}

func mustJSON(value any) []byte {
	data, _ := json.Marshal(value)
	return data
}

func (db *AdminDB) GetQueueCounts(ctx context.Context) (*v1.AdminQueueCounts, error) {
	counts := &v1.AdminQueueCounts{}
	err := db.db.Pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM professor.review r
				WHERE r.deleted_at IS NULL
				  AND NOT (r.visible = false AND r.reviewed = true)
				  AND (r.reviewed = false OR EXISTS (
					SELECT 1 FROM professor.review_report rr WHERE rr.review_id = r.id AND rr.resolved = false
				  ))),
			(SELECT count(*) FROM course.file WHERE reviewed = false),
			(SELECT count(*) FROM professor.professor_request WHERE status = 'pending')`,
	).Scan(&counts.Reviews, &counts.CourseFiles, &counts.ProfessorRequests)
	if err != nil {
		return nil, fmt.Errorf("queue counts: %w", err)
	}
	return counts, nil
}
