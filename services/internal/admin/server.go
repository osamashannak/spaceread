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
	mux.Handle("GET /reasons", s.gateway.RequireAdmin(s.ListReasons()))
	mux.Handle("GET /reviews", s.gateway.RequireAdmin(s.ListReviews()))
	mux.Handle("GET /reviews/{reviewID}", s.gateway.RequireAdmin(s.GetReview()))
	mux.Handle("POST /reviews/{reviewID}/visibility", s.gateway.RequireAdmin(s.gateway.RequireCSRF(s.SetReviewVisibility())))
	mux.Handle("POST /reviews/{reviewID}/note", s.gateway.RequireAdmin(s.gateway.RequireCSRF(s.SaveReviewNote())))
	mux.Handle("POST /review-attachments/{attachmentID}/visibility", s.gateway.RequireAdmin(s.gateway.RequireCSRF(s.SetAttachmentVisibility())))

	return middleware.CORS(mux)
}
