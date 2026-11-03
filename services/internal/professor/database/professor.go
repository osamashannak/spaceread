package database

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/internal/professor/model"
)

func (db *ProfessorDB) GetProfessors(ctx context.Context, university string) ([]v1.ProfessorInList, error) {
	var professors = make([]v1.ProfessorInList, 0)

	rows, err := db.Db.Pool.Query(ctx, `SELECT email, name FROM professor.professor WHERE visible AND university = $1 ORDER BY views DESC`, university)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			email string
			name  string
		)

		err := rows.Scan(&email, &name)
		if err != nil {
			return nil, err
		}

		professors = append(professors, v1.ProfessorInList{
			Email: email,
			Name:  name,
		})
	}

	return professors, nil
}

func (db *ProfessorDB) GetProfessor(ctx context.Context, email string) (*model.Professor, error) {
	var prof model.Professor

	err := db.Db.Pool.QueryRow(ctx,
		`SELECT email, name, university, college 
		 FROM professor.professor 
		 WHERE visible AND email = LOWER($1)`, email).
		Scan(&prof.Email, &prof.Name, &prof.University, &prof.College)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if err := db.incrementProfessorViews(ctx, email); err != nil {
		return nil, err
	}

	return &prof, nil
}

func (db *ProfessorDB) GetSimilarProfessors(ctx context.Context, sessions []int64, professorEmail, university string) ([]v1.SimilarProfessor, error) {
	rows, err := db.Db.Pool.Query(ctx, `
				WITH profs AS (
				SELECT 
					p.email,
					p.name,
					p.college
				FROM professor.professor p
				JOIN professor.review r ON r.professor_email = p.email
				WHERE r.session_id = ANY($1::bigint[]) 
				AND p.email != $2
				AND p.university = $3
				AND p.visible = true
				AND r.visible = true
				AND r.deleted_at IS NULL
				AND r.created_at >= NOW() - INTERVAL '2 years'
				GROUP BY p.email, p.name, p.college
				ORDER BY COUNT(DISTINCT r.session_id) DESC
				LIMIT 3
			)
			SELECT 
				p.email AS professor_email,
				p.name AS professor_name,
				p.college AS professor_college,
				COUNT(r.id) AS reviews_count,
				COALESCE(AVG(r.score), 0) AS score,
				rTop.content AS review_preview
			FROM profs p
			-- FIX: Added visibility and deleted checks here
			JOIN professor.review r ON r.professor_email = p.email
				AND r.created_at >= NOW() - INTERVAL '2 years'
				AND r.visible = true  
				AND r.deleted_at IS NULL 
			LEFT JOIN LATERAL (
				SELECT r1.content
				FROM professor.review r1
				LEFT JOIN professor.review_rating rr ON rr.review_id = r1.id
				WHERE r1.professor_email = p.email
				AND r1.visible = true
				AND r1.deleted_at IS NULL
				AND r1.created_at >= NOW() - INTERVAL '2 years'
				GROUP BY r1.id, r1.content
				ORDER BY SUM(CASE WHEN rr.value THEN 1 ELSE 0 END) 
						- SUM(CASE WHEN rr.value = false THEN 1 ELSE 0 END) DESC,
							LENGTH(r1.content) DESC
				LIMIT 1
			) rTop ON true
			GROUP BY p.email, p.name, p.college, rTop.content;`, sessions, professorEmail, university)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	similarProfessors := make([]v1.SimilarProfessor, 0)

	for rows.Next() {
		var sp v1.SimilarProfessor

		if err := rows.Scan(
			&sp.ProfessorEmail,
			&sp.ProfessorName,
			&sp.ProfessorCollege,
			&sp.ReviewsCount,
			&sp.Score,
			&sp.ReviewPreview,
		); err != nil {
			return nil, err
		}

		similarProfessors = append(similarProfessors, sp)
	}

	return similarProfessors, nil
}

func (db *ProfessorDB) incrementProfessorViews(ctx context.Context, email string) error {
	_, err := db.Db.Pool.Exec(ctx, `UPDATE professor.professor SET views = views + 1 WHERE email = $1`, email)
	return err
}

func (db *ProfessorDB) GetProfessorCourses(ctx context.Context, email string) ([]v1.CourseInList, error) {
	query := `SELECT h.course_tag, COALESCE(c.name, '')
		FROM professor.professor_course_history h
		LEFT JOIN course.course c ON c.tag = h.course_tag
		WHERE h.email = $1
		ORDER BY h.course_tag`

	rows, err := db.Db.Pool.Query(ctx, query, email)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	courses := make([]v1.CourseInList, 0)
	for rows.Next() {
		var course v1.CourseInList
		if err := rows.Scan(&course.Tag, &course.Name); err != nil {
			return nil, err
		}
		courses = append(courses, course)
	}
	return courses, rows.Err()
}
