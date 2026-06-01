package admin

import (
	"net/http"

	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
)

func (s *Server) Session() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		profile, ok := s.gateway.GetProfile(r.Context())
		if !ok || profile.UserId == nil {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminSessionResponse{
			User: v1.AdminSessionUser{
				ID:       *profile.UserId,
				Username: profile.Username,
				Email:    profile.Email,
				Role:     profile.Role,
			},
		})
	})
}
