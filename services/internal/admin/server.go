package admin

import (
	"net/http"

	"github.com/osamashannak/uaeu-space/services/internal/admin/database"
	"github.com/osamashannak/uaeu-space/services/internal/middleware"
	"github.com/osamashannak/uaeu-space/services/pkg/gateway"
)

type Server struct {
	db      *database.AdminDB
	gateway *gateway.Gateway
}

func NewServer(db *database.AdminDB, gatewayClient *gateway.Gateway) (*Server, error) {
	return &Server{
		db:      db,
		gateway: gatewayClient,
	}, nil
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.Handle("GET /healthz", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	mux.Handle("GET /session", s.gateway.RequireAdmin(s.Session()))
	mux.Handle("GET /reasons", s.gateway.RequireAdmin(s.ListReasons()))
	mux.Handle("POST /reasons/{reasonCode}", s.gateway.RequireAdmin(s.gateway.RequireCSRF(s.UpdateReason())))
	mux.Handle("GET /reviews", s.gateway.RequireAdmin(s.ListReviews()))
	mux.Handle("GET /reviews/suspicious", s.gateway.RequireAdmin(s.ListSuspiciousReviewPairs()))
	mux.Handle("GET /reviews/{reviewID}", s.gateway.RequireAdmin(s.GetReview()))
	mux.Handle("GET /review-replies/{replyID}", s.gateway.RequireAdmin(s.GetReviewReply()))
	mux.Handle("GET /sessions/{sessionID}", s.gateway.RequireAdmin(s.GetSessionDetail()))
	mux.Handle("GET /users/{userID}", s.gateway.RequireAdmin(s.GetUserDetail()))
	mux.Handle("GET /ip-addresses/lookup", s.gateway.RequireAdmin(s.GetIPDetail()))
	mux.Handle("POST /reviews/{reviewID}/visibility", s.gateway.RequireAdmin(s.gateway.RequireCSRF(s.SetReviewVisibility())))
	mux.Handle("POST /reviews/{reviewID}/note", s.gateway.RequireAdmin(s.gateway.RequireCSRF(s.SaveReviewNote())))
	mux.Handle("POST /review-replies/{replyID}/visibility", s.gateway.RequireAdmin(s.gateway.RequireCSRF(s.SetReviewReplyVisibility())))
	mux.Handle("POST /review-replies/{replyID}/review", s.gateway.RequireAdmin(s.gateway.RequireCSRF(s.MarkReviewReplyReviewed())))
	mux.Handle("POST /review-replies/{replyID}/note", s.gateway.RequireAdmin(s.gateway.RequireCSRF(s.SaveReviewReplyNote())))
	mux.Handle("POST /review-attachments/{attachmentID}/visibility", s.gateway.RequireAdmin(s.gateway.RequireCSRF(s.SetAttachmentVisibility())))

	return middleware.CORS(mux)
}
