package authsession

import (
	"context"
	"time"
)

type User struct {
	LoginSessionID int64
	UserID         int64
	Username       string
	Email          string
	Role           string
	ExpiresAt      time.Time
}

type SessionStore interface {
	GetSessionID(ctx context.Context, token string) (*int64, error)
	CreateSession(ctx context.Context, id int64, token, userAgent, ipAddress string) error
	RecoverSession(ctx context.Context, id int64, token, userAgent, ipAddress string) error
	UpdateSessionToken(ctx context.Context, id int64, token string) error
}

type Resolver interface {
	GetAuthenticatedUserByTokenHash(ctx context.Context, tokenHash string, sessionID int64) (*User, error)
}
