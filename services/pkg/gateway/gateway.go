package gateway

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"github.com/golang-jwt/jwt/v5"
	"github.com/osamashannak/uaeu-space/services/pkg/authsession"
	"github.com/osamashannak/uaeu-space/services/pkg/authutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/osamashannak/uaeu-space/services/pkg/snowflake"
	"github.com/osamashannak/uaeu-space/services/pkg/utils"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Gateway struct {
	sessionStore      SessionStore
	authResolver      authsession.Resolver
	gen               snowflake.Generator
	config            Config
	profileContextKey contextKey
	recoveredDevSIDs  sync.Map
}

type SessionStore interface {
	GetSessionID(ctx context.Context, token string) (*int64, error)
	CreateSession(ctx context.Context, id int64, token, userAgent, ipAddress string) error
	RecoverSession(ctx context.Context, id int64, token, userAgent, ipAddress string) error
	UpdateSessionToken(ctx context.Context, id int64, token string) error
}

func New(sessionStore SessionStore, gen snowflake.Generator, cfg Config, authResolver authsession.Resolver) *Gateway {
	return &Gateway{
		sessionStore:      sessionStore,
		authResolver:      authResolver,
		gen:               gen,
		config:            cfg,
		profileContextKey: "profile",
	}
}

func (g *Gateway) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqLogger := logging.FromContext(r.Context())
		ctx := r.Context()

		var sessionId int64
		cookie, err := r.Cookie(g.config.SessionCookieName)

		if err == nil && cookie != nil {
			tokenStr := cookie.Value

			if strings.Contains(tokenStr, ".") {
				claims, err := g.verifyJWT(tokenStr)
				if err == nil {
					sessionId = claims.SessionId
					if sessionId > 0 && g.config.IsDevelopment() {
						err = g.recoverDevelopmentSession(ctx, sessionId, tokenStr, r.UserAgent(), utils.GetClientIP(r))
						if err != nil {
							reqLogger.Warnf("failed to recover development session %d: %v", sessionId, err)
						}
					}
				}
			} else {
				idPtr, err := g.sessionStore.GetSessionID(ctx, tokenStr)
				if err == nil && idPtr != nil {
					sessionId = *idPtr

					g.upgradeToJWT(w, sessionId)
					reqLogger.Debugf("Upgraded user %d from opaque token to JWT", sessionId)
				}
			}
		}

		if sessionId == 0 && !isBot(r.UserAgent()) {
			idPtr, err := g.createSession(w, utils.GetClientIP(r), r.UserAgent())
			if err != nil {
				reqLogger.Errorf("failed to create anonymous session: %v", err)
			}
			if idPtr != nil {
				sessionId = *idPtr
			}
		}

		profile := &Profile{
			SessionId: sessionId,
		}
		if sessionId != 0 {
			g.setCSRFCookie(w, sessionId, g.config.CookieMaxAgeSeconds())
		}

		reqLogger = reqLogger.With(
			"method", r.Method,
			"path", r.URL.Path,
			"remote_ip", utils.GetClientIP(r),
			"id", profile.SessionId,
		)

		ctx = logging.WithLogger(ctx, reqLogger)
		ctx = context.WithValue(ctx, g.profileContextKey, profile)
		r = r.WithContext(ctx)

		next.ServeHTTP(w, r)
	})
}

func (g *Gateway) OptionalAuthMiddleware(next http.Handler) http.Handler {
	return g.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		profile, ok := g.GetProfile(r.Context())
		if !ok {
			http.Error(w, "session missing", http.StatusUnauthorized)
			return
		}

		authProfile, authenticated, err := g.ResolveAuth(r.Context(), r, profile)
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to resolve auth profile: %v", err)
			http.Error(w, "authentication failed", http.StatusInternalServerError)
			return
		}

		if authenticated {
			ctx := context.WithValue(r.Context(), g.profileContextKey, authProfile)
			r = r.WithContext(ctx)
		}

		next.ServeHTTP(w, r)
	}))
}

func (g *Gateway) RequireAuth(next http.Handler) http.Handler {
	return g.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		profile, ok := g.GetProfile(r.Context())
		if !ok {
			http.Error(w, "session missing", http.StatusUnauthorized)
			return
		}

		authProfile, authenticated, err := g.ResolveAuth(r.Context(), r, profile)
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to resolve auth profile: %v", err)
			http.Error(w, "authentication failed", http.StatusInternalServerError)
			return
		}

		if !authenticated {
			http.Error(w, "authentication required", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), g.profileContextKey, authProfile)
		next.ServeHTTP(w, r.WithContext(ctx))
	}))
}

func (g *Gateway) RequireAdmin(next http.Handler) http.Handler {
	return g.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		profile, ok := g.GetProfile(r.Context())
		if !ok || profile.UserId == nil || profile.Role != "admin" {
			http.Error(w, "admin access required", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	}))
}

func (g *Gateway) RequireCSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isSafeMethod(r.Method) {
			next.ServeHTTP(w, r)
			return
		}

		profile, ok := g.GetProfile(r.Context())
		if !ok || profile.SessionId == 0 {
			http.Error(w, "session missing", http.StatusUnauthorized)
			return
		}

		expected := g.csrfToken(profile.SessionId)
		cookie, err := r.Cookie(g.config.CSRFCookieName)
		if err != nil || cookie == nil || cookie.Value == "" {
			http.Error(w, "csrf token required", http.StatusForbidden)
			return
		}

		headerToken := r.Header.Get("X-Csrf-Token")
		if !secureCompare(cookie.Value, expected) || !secureCompare(headerToken, expected) {
			http.Error(w, "csrf validation failed", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (g *Gateway) ResolveAuth(ctx context.Context, r *http.Request, profile *Profile) (*Profile, bool, error) {
	cookie, err := r.Cookie(g.config.AuthCookieName)
	if err != nil || cookie == nil || cookie.Value == "" {
		return profile, false, nil
	}

	if g.authResolver == nil {
		return profile, false, nil
	}

	tokenHash, err := authutil.HashToken(cookie.Value)
	if err != nil {
		return nil, false, err
	}

	user, err := g.authResolver.GetAuthenticatedUserByTokenHash(ctx, tokenHash, profile.SessionId)
	if err != nil {
		return nil, false, err
	}

	if user == nil {
		return profile, false, nil
	}

	userID := user.UserID
	username := user.Username
	email := user.Email

	return &Profile{
		SessionId: profile.SessionId,
		UserId:    &userID,
		Username:  &username,
		Email:     &email,
		Role:      user.Role,
	}, true, nil
}

func (g *Gateway) GetProfile(ctx context.Context) (*Profile, bool) {
	p, ok := ctx.Value(g.profileContextKey).(*Profile)
	return p, ok
}

func (g *Gateway) recoverDevelopmentSession(ctx context.Context, sessionId int64, token, userAgent, ipAddress string) error {
	if _, ok := g.recoveredDevSIDs.Load(sessionId); ok {
		return nil
	}

	if err := g.sessionStore.RecoverSession(ctx, sessionId, token, userAgent, ipAddress); err != nil {
		return err
	}

	g.recoveredDevSIDs.Store(sessionId, struct{}{})
	return nil
}

func isBot(ua string) bool {
	ua = strings.ToLower(ua)
	return strings.Contains(ua, "googlebot") ||
		strings.Contains(ua, "bingbot") ||
		strings.Contains(ua, "yandex") ||
		strings.Contains(ua, "baiduspider") ||
		strings.Contains(ua, "twitterbot") ||
		strings.Contains(ua, "facebookexternalhit") ||
		strings.Contains(ua, "rogerbot") ||
		strings.Contains(ua, "linkedinbot") ||
		strings.Contains(ua, "embedly") ||
		strings.Contains(ua, "quora link preview") ||
		strings.Contains(ua, "showyoubot") ||
		strings.Contains(ua, "outbrain") ||
		strings.Contains(ua, "pinterest/0.") ||
		strings.Contains(ua, "slackbot") ||
		strings.Contains(ua, "vkshare") ||
		strings.Contains(ua, "w3c_validator")
}

func (g *Gateway) generateJWT(sessionId int64) (string, error) {
	claims := SessionClaims{
		SessionId: sessionId,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(g.config.CookieMaxAgeDuration())),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(g.config.JWTSecret))
}

func (g *Gateway) verifyJWT(tokenString string) (*SessionClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &SessionClaims{}, func(t *jwt.Token) (interface{}, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected jwt signing method")
		}
		return []byte(g.config.JWTSecret), nil
	})
	if err != nil || token == nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*SessionClaims); ok && token.Valid {
		return claims, nil
	}
	return nil, err
}

func (g *Gateway) createSession(w http.ResponseWriter, ip, userAgent string) (*int64, error) {
	sessionId := int64(g.gen.Next())

	tokenString, err := g.generateJWT(sessionId)
	if err != nil {
		return nil, err
	}

	err = g.sessionStore.CreateSession(context.Background(), sessionId, tokenString, userAgent, ip)
	if err != nil {
		return nil, err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     g.config.SessionCookieName,
		Value:    tokenString,
		Domain:   g.config.CookieDomain,
		MaxAge:   g.config.CookieMaxAgeSeconds(),
		Secure:   g.config.CookieSecure,
		HttpOnly: true,
		Path:     "/",
	})
	g.setCSRFCookie(w, sessionId, g.config.CookieMaxAgeSeconds())

	return &sessionId, nil
}

func (g *Gateway) upgradeToJWT(w http.ResponseWriter, sid int64) {
	tokenString, _ := g.generateJWT(sid)

	http.SetCookie(w, &http.Cookie{
		Name:     g.config.SessionCookieName,
		Value:    tokenString,
		Domain:   g.config.CookieDomain,
		MaxAge:   g.config.CookieMaxAgeSeconds(),
		Secure:   g.config.CookieSecure,
		HttpOnly: true,
		Path:     "/",
	})
	g.setCSRFCookie(w, sid, g.config.CookieMaxAgeSeconds())

	err := g.sessionStore.UpdateSessionToken(context.Background(), sid, tokenString)

	if err != nil {
		logging.DefaultLogger().Errorf("failed to update session token for session %d: %v", sid, err)
		return
	}
}

func (g *Gateway) csrfToken(sessionId int64) string {
	mac := hmac.New(sha256.New, []byte(g.config.CSRFSecret))
	mac.Write([]byte("csrf:"))
	mac.Write([]byte(strconv.FormatInt(sessionId, 10)))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (g *Gateway) setCSRFCookie(w http.ResponseWriter, sessionId int64, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     g.config.CSRFCookieName,
		Value:    g.csrfToken(sessionId),
		Domain:   g.config.CookieDomain,
		MaxAge:   maxAge,
		Secure:   g.config.CookieSecure,
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})
}

func isSafeMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions || method == http.MethodTrace
}

func secureCompare(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	return hmac.Equal([]byte(a), []byte(b))
}
