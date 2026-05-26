package database

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/internal/professor/model"
	"github.com/osamashannak/uaeu-space/services/pkg/utils"
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

func (db *ProfessorDB) GetProfessorReviews(ctx context.Context, sessionId int64, userId *int64, email string) (*[]v1.Review, *float64, *[]int64, *bool, error) {
	rows, err := db.Db.Pool.Query(ctx, `
		SELECT 
		    r.visible,
		    r.sort_index,
			r.id,
			r.score,
			r.positive,
			r.content,
			r.grade_received,
			r.course_taken,
			r.language,
			r.like_count,
			r.dislike_count,
			r.reply_count,
			r.uaeu_origin,
			r.created_at,
			COALESCE( (r.session_id IS NOT DISTINCT FROM $1) OR ($2::bigint IS NOT NULL AND r.user_id IS NOT DISTINCT FROM $2), FALSE ) AS self,
			CASE 
				WHEN rr.value = true THEN 'like'
				WHEN rr.value = false THEN 'dislike'
				END AS rated,
			ra.id,
			ra.height,
			ra.width,
			ra.blob_name,
			r.session_id,
			r.gif
		FROM professor.review r
		LEFT JOIN LATERAL (
			SELECT value
			FROM professor.review_rating
			WHERE review_id = r.id
			  AND (session_id = $1 OR ($2::bigint IS NOT NULL AND user_id = $2))
			ORDER BY created_at DESC
			LIMIT 1
		) rr ON true
		LEFT JOIN professor.review_attachment ra 
			ON r.attachment = ra.id AND ra.visible
		WHERE professor_email = $3 AND r.deleted_at IS NULL AND r.created_at >= NOW() - INTERVAL '2 years'
		ORDER BY r.sort_index DESC;`, sessionId, userId, email)

	if err != nil {
		return nil, nil, nil, nil, err
	}
	defer rows.Close()

	reviews := make([]v1.Review, 0)
	sessionIDs := make([]int64, 0)
	scoreSum := 0.0
	reviewed := false

	for rows.Next() {
		var (
			rev          v1.Review
			visible      bool
			attID        *int64
			attHeight    *int
			attWidth     *int
			attURL       *string
			revSessionId *int64
		)

		if err := rows.Scan(
			&visible,
			&rev.SortIndex,
			&rev.ID,
			&rev.Score,
			&rev.Positive,
			&rev.Text,
			&rev.GradeReceived,
			&rev.CourseTaken,
			&rev.Language,
			&rev.LikeCount,
			&rev.DislikeCount,
			&rev.ReplyCount,
			&rev.UaeuOrigin,
			&rev.CreatedAt,
			&rev.Self,
			&rev.Rated,
			&attID,
			&attHeight,
			&attWidth,
			&attURL,
			&revSessionId,
			&rev.Gif,
		); err != nil {
			return nil, nil, nil, nil, err
		}

		if rev.Self {
			reviewed = true
		}

		if !visible && !rev.Self {
			continue
		}

		if attID != nil {
			rev.Attachment = &v1.ReviewAttachment{
				ID:     *attID,
				Height: *attHeight,
				Width:  *attWidth,
				URL:    utils.FormatBlobURL("https://uaeuresources.blob.core.windows.net", "attachments", *attURL, ""),
			}
		}

		rev.Author = "User"
		scoreSum += float64(rev.Score)

		reviews = append(reviews, rev)

		if revSessionId != nil {
			sessionIDs = append(sessionIDs, *revSessionId)
		}

	}

	averageScore := 0.0

	if len(reviews) > 0 {
		averageScore = scoreSum / float64(len(reviews))
	}

	return &reviews, &averageScore, &sessionIDs, &reviewed, nil
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

func (db *ProfessorDB) GetProfessorCourses(ctx context.Context, email string) ([]string, error) {
	query := `SELECT course_tag FROM professor.professor_course_history WHERE email = $1`

	rows, err := db.Db.Pool.Query(ctx, query, email)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var courses []string
	for rows.Next() {
		var course string
		if err := rows.Scan(&course); err != nil {
			return nil, err
		}
		courses = append(courses, course)
	}
	return courses, nil
}
