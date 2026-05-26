package account

import (
	"net/http"

	accountdb "github.com/osamashannak/uaeu-space/services/internal/account/database"
	"github.com/osamashannak/uaeu-space/services/internal/middleware"
	"github.com/osamashannak/uaeu-space/services/pkg/gateway"
	"github.com/osamashannak/uaeu-space/services/pkg/snowflake"
)

type Server struct {
	db        *accountdb.DB
	generator *snowflake.Generator
	gateway   *gateway.Gateway
	config    Config
}

func NewServer(db *accountdb.DB, generator *snowflake.Generator, gatewayClient *gateway.Gateway, cfg Config) (*Server, error) {
	return &Server{
		db:        db,
		generator: generator,
		gateway:   gatewayClient,
		config:    cfg,
	}, nil
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.Handle("POST /gate/signup", s.gateway.Middleware(s.SignUp()))
	mux.Handle("POST /gate/login", s.gateway.Middleware(s.Login()))
	mux.Handle("POST /gate/googleLogin", s.gateway.Middleware(s.GoogleLogin()))
	mux.Handle("POST /gate/googleSignup", s.gateway.Middleware(s.GoogleSignup()))
	mux.Handle("POST /gate/logout", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.Logout())))
	mux.Handle("POST /gate/logoutAll", s.gateway.RequireAuth(s.gateway.RequireCSRF(s.LogoutAll())))
	mux.Handle("GET /gate/account/settings", s.gateway.OptionalAuthMiddleware(s.AccountSettings()))
	mux.Handle("GET /gate/notifications", s.gateway.OptionalAuthMiddleware(s.ListNotifications()))
	mux.Handle("GET /gate/notifications/summary", s.gateway.OptionalAuthMiddleware(s.NotificationSummary()))
	mux.Handle("POST /gate/notifications/read", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.MarkNotificationRead())))

	return middleware.CORS(mux)
}

func (s *Server) authCookieName() string {
	if s.config.Gateway.AuthCookieName != "" {
		return s.config.Gateway.AuthCookieName
	}
	return "spaceread_auth"
}
