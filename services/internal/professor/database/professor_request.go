package database

import (
	"context"

	"github.com/osamashannak/uaeu-space/services/internal/professor/model"
)

func (db *ProfessorDB) InsertProfessorRequest(ctx context.Context, request model.ProfessorRequest) error {
	_, err := db.Db.Pool.Exec(ctx, `
		INSERT INTO professor.professor_request (
			id,
			professor_name,
			professor_email,
			university,
			college,
			session_id,
			user_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		request.ID,
		request.ProfessorName,
		request.ProfessorEmail,
		request.University,
		request.College,
		request.SessionId,
		request.UserId,
	)

	return err
}
