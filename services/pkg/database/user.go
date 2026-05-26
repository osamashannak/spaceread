package database

import (
	"context"
)

func (db *DB) GetSessionID(ctx context.Context, token string) (*int64, error) {
	var id int64

	err := db.Pool.QueryRow(ctx,
		`SELECT id FROM account.session WHERE token = $1`, token).Scan(&id)

	if err != nil {
		return nil, err
	}

	return &id, nil
}

func (db *DB) CreateSession(ctx context.Context, id int64, token, userAgent, ipAddress string) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO account.session (token, user_agent, ip_address, id)
		 VALUES ($1, $2, COALESCE(NULLIF($3, ''), '0.0.0.0')::inet, $4)`,
		token, userAgent, ipAddress, id)

	return err
}

func (db *DB) RecoverSession(ctx context.Context, id int64, token, userAgent, ipAddress string) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO account.session (token, user_agent, ip_address, id)
		 VALUES ($1, $2, COALESCE(NULLIF($3, ''), '0.0.0.0')::inet, $4)
		 ON CONFLICT (id) DO NOTHING`,
		token, userAgent, ipAddress, id)

	return err
}

func (db *DB) UpdateSessionToken(ctx context.Context, id int64, token string) error {
	_, err := db.Pool.Exec(ctx,
		`UPDATE account.session SET token = $1 WHERE id = $2`,
		token, id)

	return err
}
