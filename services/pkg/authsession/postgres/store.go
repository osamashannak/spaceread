package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/osamashannak/uaeu-space/services/pkg/authsession"
	pkgdb "github.com/osamashannak/uaeu-space/services/pkg/database"
)

var (
	_ authsession.SessionStore = (*Store)(nil)
	_ authsession.Resolver     = (*Store)(nil)
)

type Store struct {
	db *pkgdb.DB
}

func New(db *pkgdb.DB) *Store {
	return &Store{db: db}
}

func (s *Store) GetSessionID(ctx context.Context, token string) (*int64, error) {
	var id int64

	err := s.db.Pool.QueryRow(ctx,
		`SELECT id FROM account.session WHERE token = $1`, token).Scan(&id)
	if err != nil {
		return nil, err
	}

	return &id, nil
}

func (s *Store) CreateSession(ctx context.Context, id int64, token, userAgent, ipAddress string) error {
	_, err := s.db.Pool.Exec(ctx,
		`INSERT INTO account.session (token, user_agent, ip_address, id)
		 VALUES ($1, $2, COALESCE(NULLIF($3, ''), '0.0.0.0')::inet, $4)`,
		token, userAgent, ipAddress, id)

	return err
}

func (s *Store) RecoverSession(ctx context.Context, id int64, token, userAgent, ipAddress string) error {
	_, err := s.db.Pool.Exec(ctx,
		`INSERT INTO account.session (token, user_agent, ip_address, id)
		 VALUES ($1, $2, COALESCE(NULLIF($3, ''), '0.0.0.0')::inet, $4)
		 ON CONFLICT (id) DO NOTHING`,
		token, userAgent, ipAddress, id)

	return err
}

func (s *Store) UpdateSessionToken(ctx context.Context, id int64, token string) error {
	_, err := s.db.Pool.Exec(ctx,
		`UPDATE account.session SET token = $1 WHERE id = $2`,
		token, id)

	return err
}

func (s *Store) GetAuthenticatedUserByTokenHash(ctx context.Context, tokenHash string, sessionID int64) (*authsession.User, error) {
	var user authsession.User

	err := s.db.Pool.QueryRow(ctx, `
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
