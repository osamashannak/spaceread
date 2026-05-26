package database

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

const defaultNotificationLimit = 50
const maxNotificationLimit = 100

func (db *DB) ListNotifications(ctx context.Context, sessionID int64, userID *int64, limit int) ([]v1.NotificationResponse, int, error) {
	if limit <= 0 {
		limit = defaultNotificationLimit
	}
	if limit > maxNotificationLimit {
		limit = maxNotificationLimit
	}

	unreadCount, err := db.GetUnreadNotificationCount(ctx, sessionID, userID)
	if err != nil {
		return nil, 0, err
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT id, type, title, body, href, read_at, created_at
		FROM account.notification
		WHERE session_id = $1
		   OR ($2::bigint IS NOT NULL AND user_id = $2)
		ORDER BY created_at DESC
		LIMIT $3`, sessionID, userID, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	notifications := make([]v1.NotificationResponse, 0)
	for rows.Next() {
		var notification v1.NotificationResponse
		var readAt pgtype.Timestamptz

		if err := rows.Scan(
			&notification.ID,
			&notification.Type,
			&notification.Title,
			&notification.Body,
			&notification.Href,
			&readAt,
			&notification.CreatedAt,
		); err != nil {
			return nil, 0, err
		}

		if readAt.Valid {
			t := readAt.Time
			notification.ReadAt = &t
		}

		notifications = append(notifications, notification)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	return notifications, unreadCount, nil
}

func (db *DB) GetUnreadNotificationCount(ctx context.Context, sessionID int64, userID *int64) (int, error) {
	var count int
	err := db.Pool.QueryRow(ctx, `
		SELECT count(*)
		FROM account.notification
		WHERE (session_id = $1 OR ($2::bigint IS NOT NULL AND user_id = $2))
		  AND read_at IS NULL`, sessionID, userID).Scan(&count)
	return count, err
}

func (db *DB) MarkNotificationRead(ctx context.Context, sessionID int64, userID *int64, notificationID *int64) error {
	if notificationID == nil {
		_, err := db.Pool.Exec(ctx, `
			UPDATE account.notification
			SET read_at = COALESCE(read_at, now())
			WHERE (session_id = $1 OR ($2::bigint IS NOT NULL AND user_id = $2))
			  AND read_at IS NULL`, sessionID, userID)
		return err
	}

	_, err := db.Pool.Exec(ctx, `
		UPDATE account.notification
		SET read_at = COALESCE(read_at, now())
		WHERE (session_id = $1 OR ($2::bigint IS NOT NULL AND user_id = $2))
		  AND id = $3`, sessionID, userID, *notificationID)
	return err
}
