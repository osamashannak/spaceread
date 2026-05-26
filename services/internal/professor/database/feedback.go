package database

import (
	"context"
	"database/sql"
	"errors"
	"github.com/osamashannak/uaeu-space/services/internal/professor/model"
)

func (db *ProfessorDB) InsertNewFeedback(ctx context.Context, feedbackId, sessionId int64, userId *int64, currentQuestion string) error {
	_, err := db.Db.Pool.Exec(ctx, `INSERT INTO public.feedback (id, session_id, user_id, current_question) VALUES ($1, $2, $3, $4)`,
		feedbackId,
		sessionId,
		userId,
		currentQuestion,
	)

	if err != nil {
		return err
	}

	return nil
}

func (db *ProfessorDB) GetFeedbackBySessionID(ctx context.Context, sessionId int64) (*model.Feedback, error) {
	var feedback model.Feedback

	err := db.Db.Pool.QueryRow(ctx, `SELECT id, session_id, completed FROM public.feedback WHERE session_id = $1`, sessionId).Scan(
		&feedback.ID,
		&feedback.SessionId,
		&feedback.Completed,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &feedback, nil
}

func (db *ProfessorDB) InsertFeedbackEntry(ctx context.Context, feedbackId int64, question, answer string) error {
	_, err := db.Db.Pool.Exec(ctx, `INSERT INTO public.feedback_entry (feedback_id, question, answer) VALUES ($1, $2, $3)`,
		feedbackId,
		question,
		answer,
	)

	if err != nil {
		return err
	}

	return nil
}

func (db *ProfessorDB) UpdateFeedbackCurrentQuestion(ctx context.Context, feedbackId int64, currentQuestion string) error {
	_, err := db.Db.Pool.Exec(ctx, `UPDATE public.feedback SET current_question = $1 WHERE id = $2`, currentQuestion, feedbackId)
	return err
}

func (db *ProfessorDB) CompleteFeedback(ctx context.Context, feedbackId int64) error {
	_, err := db.Db.Pool.Exec(ctx, `UPDATE public.feedback SET completed = true WHERE id = $1`, feedbackId)
	return err
}

func (db *ProfessorDB) GetFeedback(ctx context.Context, feedbackId int64) (*model.Feedback, error) {
	var feedback model.Feedback

	err := db.Db.Pool.QueryRow(ctx, `SELECT id, session_id, completed, current_question FROM public.feedback WHERE id = $1`, feedbackId).Scan(
		&feedback.ID,
		&feedback.SessionId,
		&feedback.Completed,
		&feedback.CurrentQuestion,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &feedback, nil
}
