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

type Resolver interface {
	GetAuthenticatedUserByTokenHash(ctx context.Context, tokenHash string, sessionID int64) (*User, error)
}
