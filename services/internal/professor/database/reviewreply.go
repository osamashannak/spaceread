package database

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/internal/professor/model"
)

func (db *ProfessorDB) GetReply(ctx context.Context, id int64) (*model.ReviewReply, error) {
	var reply model.ReviewReply

	err := db.Db.Pool.QueryRow(ctx,
		`SELECT id, review_id, session_id, user_id
		 FROM professor.review_reply WHERE id = $1 AND deleted_at IS NULL`, id).Scan(
		&reply.ID,
		&reply.ReviewId,
		&reply.SessionId,
		&reply.UserId)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &reply, nil
}

func (db *ProfessorDB) GetReplySessionName(ctx context.Context, reviewId, sessionId int64) (string, error) {
	var name string

	err := db.Db.Pool.QueryRow(ctx,
		`SELECT name FROM professor.reply_name WHERE review_id = $1 AND session_id = $2`, reviewId, sessionId).Scan(&name)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", err
	}

	return name, nil
}

func (db *ProfessorDB) InsertReply(ctx context.Context, reply *model.ReviewReply) error {
	_, err := db.Db.Pool.Exec(ctx,
		`INSERT INTO professor.review_reply (
			id, content, gif, review_id, session_id, user_id, mention_id, op, visible
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		reply.ID, reply.Content, reply.Gif, reply.ReviewId, reply.SessionId, reply.UserId, reply.MentionId, reply.Op, reply.Visible)
	return err
}

func (db *ProfessorDB) SoftDeleteReply(ctx context.Context, id int64) error {
	_, err := db.Db.Pool.Exec(ctx,
		`UPDATE professor.review_reply SET deleted_at = now() WHERE id = $1`, id)
	return err
}

func (db *ProfessorDB) LikeReply(ctx context.Context, replyId, sessionId int64, userId *int64) error {
	_, err := db.Db.Pool.Exec(ctx,
		`INSERT INTO professor.reply_like (reply_id, session_id, user_id) VALUES ($1, $2, $3)`,
		replyId, sessionId, userId)
	return err
}

func (db *ProfessorDB) UnlikeReply(ctx context.Context, replyId, sessionId int64, userId *int64) error {
	_, err := db.Db.Pool.Exec(ctx,
		`DELETE FROM professor.reply_like
		 WHERE reply_id = $1
		   AND (session_id = $2 OR ($3::bigint IS NOT NULL AND user_id = $3))`,
		replyId, sessionId, userId)
	return err
}

func (db *ProfessorDB) InsertReplyName(ctx context.Context, reviewId, sessionId int64, userId *int64, name string) error {
	_, err := db.Db.Pool.Exec(ctx,
		`INSERT INTO professor.reply_name (review_id, session_id, user_id, name) VALUES ($1, $2, $3, $4)`,
		reviewId, sessionId, userId, name)
	return err
}

func (db *ProfessorDB) GetRepliesIgnoreCurrent(ctx context.Context, reviewId, sessionId int64, userId *int64, current []int64) ([]v1.Reply, error) {
	rows, err := db.Db.Pool.Query(ctx,
		`SELECT r.id,
				   r.content,
				   r.created_at,
				   r.gif,
				   rn.name                                                       AS author,
				   mentioned.name                                                AS mention,
				   r.op,
				   COALESCE((r.session_id IS NOT DISTINCT FROM $3) OR ($4::bigint IS NOT NULL AND r.user_id IS NOT DISTINCT FROM $4), FALSE) AS self,
				   r.like_count,
				   CASE
					   WHEN rr.created_at IS NOT NULL THEN TRUE
					   ELSE FALSE
					   END                                                       AS liked
			FROM professor.review_reply r
					 LEFT JOIN LATERAL (
						  SELECT created_at
						  FROM professor.reply_like
						  WHERE reply_id = r.id
						    AND (session_id = $3 OR ($4::bigint IS NOT NULL AND user_id = $4))
						  ORDER BY created_at DESC
						  LIMIT 1
					 ) rr ON true
					 LEFT JOIN professor.reply_name rn
							   ON r.session_id = rn.session_id AND rn.review_id = $1
					 LEFT JOIN professor.review_reply r2
							   ON r2.id = r.mention_id
					 LEFT JOIN professor.reply_name mentioned
							   ON mentioned.session_id = r2.session_id AND mentioned.review_id = $1
			WHERE r.review_id = $1
			  AND r.id NOT IN (SELECT unnest($2::bigint[]))
			  AND r.deleted_at IS NULL
			  AND r.visible
		ORDER BY created_at
		LIMIT 5`, reviewId, current, sessionId, userId)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	var replies []v1.Reply

	for rows.Next() {
		var reply v1.Reply

		err := rows.Scan(
			&reply.ID,
			&reply.Comment,
			&reply.CreatedAt,
			&reply.Gif,
			&reply.Author,
			&reply.Mention,
			&reply.Op,
			&reply.Self,
			&reply.LikeCount,
			&reply.Liked,
		)

		if err != nil {
			return nil, err
		}

		replies = append(replies, reply)
	}

	return replies, nil
}
