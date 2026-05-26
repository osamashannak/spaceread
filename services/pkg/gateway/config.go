package gateway

import (
	"fmt"
	"strings"
	"time"
)

type Config struct {
	SessionCookieName string `env:"SESSION_COOKIE_NAME, default=gid"`
	AuthCookieName    string `env:"AUTH_COOKIE_NAME, default=aid"`
	CSRFCookieName    string `env:"CSRF_COOKIE_NAME, default=sr_c"`
	CookieDomain      string `env:"COOKIE_DOMAIN, default=.spaceread.net"`
	CookieSecure      bool   `env:"COOKIE_SECURE, default=true"`
	CookieMaxAgeDays  int    `env:"COOKIE_MAX_AGE_DAYS, default=365"`
	LogMode           string `env:"LOG_MODE"`
	JWTSecret         string `env:"JWT_SECRET"`
	CSRFSecret        string `env:"CSRF_SECRET"`
}

func (c Config) Validate() error {
	if c.SessionCookieName == "" {
		return fmt.Errorf("SESSION_COOKIE_NAME is required")
	}
	if c.JWTSecret == "" {
		return fmt.Errorf("JWT_SECRET is required")
	}
	if c.CSRFSecret == "" {
		return fmt.Errorf("CSRF_SECRET is required")
	}
	if c.CookieSecure && strings.TrimSpace(c.CookieDomain) == "" {
		return fmt.Errorf("COOKIE_DOMAIN is required when COOKIE_SECURE is true")
	}
	if c.CookieMaxAgeDays <= 0 || c.CookieMaxAgeDays > 400 {
		return fmt.Errorf("COOKIE_MAX_AGE_DAYS must be between 1 and 400")
	}
	return nil
}

func (c Config) CookieMaxAgeSeconds() int {
	return c.CookieMaxAgeDays * 24 * 60 * 60
}

func (c Config) CookieMaxAgeDuration() time.Duration {
	return time.Duration(c.CookieMaxAgeDays) * 24 * time.Hour
}

func (c Config) IsDevelopment() bool {
	mode := strings.ToLower(strings.TrimSpace(c.LogMode))
	return mode == "development" || mode == "local"
}
