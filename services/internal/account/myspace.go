package account

import (
	"net/http"

	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

func (s *Server) MySpace() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		logger := logging.FromContext(ctx)

		profile, ok := s.gateway.GetProfile(ctx)
		if !ok || profile.UserId == nil {
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "authentication required",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		userID := *profile.UserId
		summary, err := s.db.GetMySpaceSummary(ctx, userID)
		if err != nil {
			logger.Errorf("failed to get my space summary: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		unreadCount, err := s.db.GetUnreadNotificationCount(ctx, profile.SessionId, profile.UserId)
		if err != nil {
			logger.Errorf("failed to get my space unread notification count: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}
		summary.UnreadNotifications = unreadCount

		reviews, err := s.db.ListMySpaceReviews(ctx, userID)
		if err != nil {
			logger.Errorf("failed to list my space reviews: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		replies, err := s.db.ListMySpaceReplies(ctx, userID)
		if err != nil {
			logger.Errorf("failed to list my space replies: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		uploads, err := s.db.ListMySpaceUploads(ctx, userID)
		if err != nil {
			logger.Errorf("failed to list my space uploads: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		username := ""
		if profile.Username != nil {
			username = *profile.Username
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.MySpaceResponse{
			User: v1.MySpaceUserResponse{
				ID:       userID,
				Username: username,
				Role:     profile.Role,
			},
			Summary: summary,
			Reviews: reviews,
			Replies: replies,
			Uploads: uploads,
		})
	})
}
