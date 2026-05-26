package database

import "context"

func (db *ProfessorDB) InsertNotification(ctx context.Context, id int64, userID, sessionID, actorUserID *int64, notificationType, title, body, href string, reviewID, replyID int64) error {
	_, err := db.Db.Pool.Exec(ctx, `
		INSERT INTO account.notification (id, user_id, session_id, actor_user_id, type, title, body, href, review_id, reply_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		id, userID, sessionID, actorUserID, notificationType, title, body, href, reviewID, replyID)
	return err
}
