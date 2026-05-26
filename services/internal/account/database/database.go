package database

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/osamashannak/uaeu-space/services/pkg/authsession"
	pkgdb "github.com/osamashannak/uaeu-space/services/pkg/database"
)

type DB struct {
	*pkgdb.DB
}

type AccountUser struct {
	ID           int64
	Username     string
	PrimaryEmail string
	Role         string
	Status       string
}

type PasswordUser struct {
	AccountUser
	PasswordHash string
}

func New(db *pkgdb.DB) *DB {
	return &DB{DB: db}
}

func (db *DB) CreateUserWithPassword(ctx context.Context, userID, identityID int64, username, email, passwordHash string) error {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO account."user" (id, username, primary_email)
		VALUES ($1, $2, $3)`,
		userID, username, email)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO account.identity (id, user_id, provider, provider_subject, email, password_hash, email_verified)
		VALUES ($1, $2, 'password', $3, $3, $4, false)`,
		identityID, userID, email, passwordHash)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (db *DB) CreateUserWithGoogle(ctx context.Context, userID, identityID int64, username, email, subject string, emailVerified bool) error {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO account."user" (id, username, primary_email)
		VALUES ($1, $2, $3)`,
		userID, username, email)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO account.identity (id, user_id, provider, provider_subject, email, email_verified)
		VALUES ($1, $2, 'google', $3, $4, $5)`,
		identityID, userID, subject, email, emailVerified)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (db *DB) AddGoogleIdentity(ctx context.Context, identityID, userID int64, subject, email string, emailVerified bool) error {
	_, err := db.Pool.Exec(ctx, `
		INSERT INTO account.identity (id, user_id, provider, provider_subject, email, email_verified)
		VALUES ($1, $2, 'google', $3, $4, $5)
		ON CONFLICT (provider, provider_subject) DO NOTHING`,
		identityID, userID, subject, email, emailVerified)
	return err
}

func (db *DB) GetPasswordUserForLogin(ctx context.Context, id string) (*PasswordUser, error) {
	var user PasswordUser

	err := db.Pool.QueryRow(ctx, `
		SELECT u.id, u.username, u.primary_email, u.role, u.status, i.password_hash
		FROM account."user" u
		JOIN account.identity i ON i.user_id = u.id
		WHERE i.provider = 'password'
		  AND u.status = 'active'
		  AND (lower(u.username) = lower($1) OR lower(u.primary_email) = lower($1) OR lower(i.email) = lower($1))
		LIMIT 1`, id).Scan(
		&user.ID,
		&user.Username,
		&user.PrimaryEmail,
		&user.Role,
		&user.Status,
		&user.PasswordHash,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &user, nil
}

func (db *DB) GetUserByGoogleSubject(ctx context.Context, subject string) (*AccountUser, error) {
	var user AccountUser

	err := db.Pool.QueryRow(ctx, `
		SELECT u.id, u.username, u.primary_email, u.role, u.status
		FROM account."user" u
		JOIN account.identity i ON i.user_id = u.id
		WHERE i.provider = 'google'
		  AND i.provider_subject = $1
		  AND u.status = 'active'`, subject).Scan(
		&user.ID,
		&user.Username,
		&user.PrimaryEmail,
		&user.Role,
		&user.Status,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &user, nil
}

func (db *DB) GetUserByEmail(ctx context.Context, email string) (*AccountUser, error) {
	var user AccountUser

	err := db.Pool.QueryRow(ctx, `
		SELECT id, username, primary_email, role, status
		FROM account."user"
		WHERE lower(primary_email) = lower($1)
		  AND status = 'active'`, email).Scan(
		&user.ID,
		&user.Username,
		&user.PrimaryEmail,
		&user.Role,
		&user.Status,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &user, nil
}

func (db *DB) UsernameExists(ctx context.Context, username string) (bool, error) {
	var exists bool
	err := db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM account."user" WHERE lower(username) = lower($1))`, username).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

func (db *DB) EmailExists(ctx context.Context, email string) (bool, error) {
	var exists bool
	err := db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM account."user" WHERE lower(primary_email) = lower($1))`, email).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

func (db *DB) SignupConflict(ctx context.Context, username, email string) (string, error) {
	emailExists, err := db.EmailExists(ctx, email)
	if err != nil {
		return "", err
	}
	if emailExists {
		return "email_taken", nil
	}

	usernameExists, err := db.UsernameExists(ctx, username)
	if err != nil {
		return "", err
	}
	if usernameExists {
		return "username_taken", nil
	}

	return "", nil
}

func (db *DB) CreateLoginSession(ctx context.Context, id, userID, sessionID int64, tokenHash, userAgent, ipAddress string, expiresAt time.Time) error {
	_, err := db.Pool.Exec(ctx, `
		INSERT INTO account.login_session (id, user_id, session_id, token_hash, expires_at, user_agent, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		id, userID, sessionID, tokenHash, expiresAt, userAgent, ipAddress)
	return err
}

func (db *DB) GetAuthenticatedUserByTokenHash(ctx context.Context, tokenHash string, sessionID int64) (*authsession.User, error) {
	var user authsession.User

	err := db.Pool.QueryRow(ctx, `
		SELECT ls.id, u.id, u.username, u.primary_email, u.role, ls.expires_at
		FROM account.login_session ls
		JOIN account."user" u ON u.id = ls.user_id
		WHERE ls.token_hash = $1
		  AND ls.session_id = $2
		  AND ls.revoked_at IS NULL
		  AND ls.expires_at > now()
		  AND u.status = 'active'`, tokenHash, sessionID).Scan(
		&user.LoginSessionID,
		&user.UserID,
		&user.Username,
		&user.Email,
		&user.Role,
		&user.ExpiresAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &user, nil
}

func (db *DB) RevokeLoginSession(ctx context.Context, tokenHash string) error {
	_, err := db.Pool.Exec(ctx, `
		UPDATE account.login_session
		SET revoked_at = now()
		WHERE token_hash = $1
		  AND revoked_at IS NULL`, tokenHash)
	return err
}

func (db *DB) RevokeAllLoginSessions(ctx context.Context, userID int64) error {
	_, err := db.Pool.Exec(ctx, `
		UPDATE account.login_session
		SET revoked_at = now()
		WHERE user_id = $1
		  AND revoked_at IS NULL`, userID)
	return err
}

func (db *DB) MarkUserLoggedIn(ctx context.Context, userID int64) error {
	_, err := db.Pool.Exec(ctx, `
		UPDATE account."user"
		SET last_login_at = now()
		WHERE id = $1`, userID)
	return err
}

func (db *DB) AttachUserToSessionAndContent(ctx context.Context, sessionID, userID int64) error {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	statements := []string{
		`UPDATE account.session SET user_id = $2 WHERE id = $1`,
		`UPDATE professor.review SET user_id = $2 WHERE session_id = $1 AND user_id IS NULL`,
		`UPDATE professor.review_reply SET user_id = $2 WHERE session_id = $1 AND user_id IS NULL`,
		`UPDATE professor.review_rating rr
		 SET user_id = $2
		 WHERE rr.session_id = $1
		   AND rr.user_id IS NULL
		   AND NOT EXISTS (
		       SELECT 1
		       FROM professor.review_rating existing
		       WHERE existing.review_id = rr.review_id
		         AND existing.user_id = $2
		   )`,
		`UPDATE professor.reply_like rl
		 SET user_id = $2
		 WHERE rl.session_id = $1
		   AND rl.user_id IS NULL
		   AND NOT EXISTS (
		       SELECT 1
		       FROM professor.reply_like existing
		       WHERE existing.reply_id = rl.reply_id
		         AND existing.user_id = $2
		   )`,
		`UPDATE professor.reply_name SET user_id = $2 WHERE session_id = $1 AND user_id IS NULL`,
		`UPDATE public.feedback SET user_id = $2 WHERE session_id = $1 AND user_id IS NULL`,
		`UPDATE course.file SET user_id = $2 WHERE session_id = $1 AND user_id IS NULL`,
		`UPDATE account.notification SET user_id = $2 WHERE session_id = $1 AND user_id IS NULL`,
	}

	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement, sessionID, userID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}
