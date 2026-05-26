package account

import (
	"net/http"
	"strconv"

	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

func (s *Server) ListNotifications() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		profile, ok := s.gateway.GetProfile(ctx)
		if !ok || profile.SessionId == 0 {
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "session missing",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		limit := 50
		if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
			parsed, err := strconv.Atoi(rawLimit)
			if err != nil {
				jsonutil.MarshalResponse(w, http.StatusBadRequest, v1.ErrorResponse{
					Message: "invalid limit parameter",
					Error:   http.StatusBadRequest,
				})
				return
			}
			limit = parsed
		}

		notifications, unreadCount, err := s.db.ListNotifications(ctx, profile.SessionId, profile.UserId, limit)
		if err != nil {
			logging.FromContext(ctx).Errorf("failed to list notifications: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.NotificationsResponse{
			Notifications: notifications,
			UnreadCount:   unreadCount,
		})
	})
}

func (s *Server) NotificationSummary() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		profile, ok := s.gateway.GetProfile(ctx)
		if !ok || profile.SessionId == 0 {
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "session missing",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		unreadCount, err := s.db.GetUnreadNotificationCount(ctx, profile.SessionId, profile.UserId)
		if err != nil {
			logging.FromContext(ctx).Errorf("failed to get notification summary: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.NotificationSummaryResponse{
			UnreadCount: unreadCount,
		})
	})
}

func (s *Server) MarkNotificationRead() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		profile, ok := s.gateway.GetProfile(ctx)
		if !ok || profile.SessionId == 0 {
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "session missing",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		var notificationID *int64
		if rawID := r.URL.Query().Get("notificationId"); rawID != "" {
			parsed, err := strconv.ParseInt(rawID, 10, 64)
			if err != nil {
				jsonutil.MarshalResponse(w, http.StatusBadRequest, v1.ErrorResponse{
					Message: "invalid notificationId parameter",
					Error:   http.StatusBadRequest,
				})
				return
			}
			notificationID = &parsed
		}

		if err := s.db.MarkNotificationRead(ctx, profile.SessionId, profile.UserId, notificationID); err != nil {
			logging.FromContext(ctx).Errorf("failed to mark notification read: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.SuccessResponse{
			Success: true,
			Message: "notification marked read",
		})
	})
}
