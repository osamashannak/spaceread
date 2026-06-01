package admin

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	admindb "github.com/osamashannak/uaeu-space/services/internal/admin/database"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

const (
	defaultReviewLimit = 50
	maxReviewLimit     = 100
)

func (s *Server) ListReasons() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reasons, err := s.db.ListReasons(r.Context())
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to list moderation reasons: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to list moderation reasons")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminReasonsResponse{Reasons: reasons})
	})
}

func (s *Server) ListReviews() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limit := parseBoundedInt(r.URL.Query().Get("limit"), defaultReviewLimit, 1, maxReviewLimit)
		offset := parseBoundedInt(r.URL.Query().Get("offset"), 0, 0, 1_000_000)
		includeDeleted := strings.EqualFold(r.URL.Query().Get("include_deleted"), "true")

		reviews, err := s.db.ListReviews(r.Context(), admindb.ListReviewOptions{
			Limit:          limit,
			Offset:         offset,
			IncludeDeleted: includeDeleted,
		})
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to list reviews: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to list reviews")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminReviewListResponse{
			Reviews: reviews,
			Limit:   limit,
			Offset:  offset,
		})
	})
}

func (s *Server) GetReview() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reviewID, ok := parsePathID(w, r, "reviewID")
		if !ok {
			return
		}

		review, err := s.db.GetReview(r.Context(), reviewID)
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to get review %d: %v", reviewID, err)
			writeError(w, http.StatusInternalServerError, "failed to get review")
			return
		}
		if review == nil {
			writeError(w, http.StatusNotFound, "review not found")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminReviewResponse{Review: *review})
	})
}

func (s *Server) SetReviewVisibility() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		reviewID, ok := parsePathID(w, r, "reviewID")
		if !ok {
			return
		}

		var request v1.AdminReviewVisibilityRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		reasonCode := cleanOptionalText(request.ReasonCode)
		if !s.validReason(w, r, reasonCode) {
			return
		}

		resolveReports := true
		if request.ResolveReports != nil {
			resolveReports = *request.ResolveReports
		}

		result, err := s.db.SetReviewVisibility(ctx, admindb.ReviewVisibilityDecision{
			ReviewID:       reviewID,
			Visible:        *request.Visible,
			ActorUserID:    s.actorUserID(ctx),
			ReasonCode:     reasonCode,
			Note:           cleanOptionalText(request.Note),
			ResolveReports: resolveReports,
		})
		if err != nil {
			s.writeDecisionError(w, r, err, "failed to update review visibility")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminDecisionResponse{
			Success:             true,
			Review:              *result.Review,
			ResolvedReportCount: result.ResolvedReportCount,
			Action:              result.Action,
		})
	})
}

func (s *Server) SetAttachmentVisibility() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		attachmentID, ok := parsePathID(w, r, "attachmentID")
		if !ok {
			return
		}

		var request v1.AdminAttachmentVisibilityRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		reasonCode := cleanOptionalText(request.ReasonCode)
		if !s.validReason(w, r, reasonCode) {
			return
		}

		result, err := s.db.SetAttachmentVisibility(ctx, admindb.AttachmentVisibilityDecision{
			AttachmentID: attachmentID,
			Visible:      *request.Visible,
			ActorUserID:  s.actorUserID(ctx),
			ReasonCode:   reasonCode,
			Note:         cleanOptionalText(request.Note),
		})
		if err != nil {
			s.writeDecisionError(w, r, err, "failed to update attachment visibility")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminDecisionResponse{
			Success: true,
			Review:  *result.Review,
			Action:  result.Action,
		})
	})
}

func (s *Server) SaveReviewNote() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		reviewID, ok := parsePathID(w, r, "reviewID")
		if !ok {
			return
		}

		var request v1.AdminReviewNoteRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		result, err := s.db.SaveReviewNote(ctx, admindb.ReviewNoteDecision{
			ReviewID:    reviewID,
			ActorUserID: s.actorUserID(ctx),
			Note:        request.Note,
		})
		if err != nil {
			s.writeDecisionError(w, r, err, "failed to save review note")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminDecisionResponse{
			Success: true,
			Review:  *result.Review,
			Action:  result.Action,
		})
	})
}

func (s *Server) validReason(w http.ResponseWriter, r *http.Request, reasonCode *string) bool {
	if reasonCode == nil {
		return true
	}

	exists, err := s.db.ReasonExists(r.Context(), *reasonCode)
	if err != nil {
		logging.FromContext(r.Context()).Errorf("failed to validate moderation reason %q: %v", *reasonCode, err)
		writeError(w, http.StatusInternalServerError, "failed to validate moderation reason")
		return false
	}
	if !exists {
		writeError(w, http.StatusBadRequest, "invalid moderation reason")
		return false
	}
	return true
}

func (s *Server) writeDecisionError(w http.ResponseWriter, r *http.Request, err error, message string) {
	if errors.Is(err, admindb.ErrNotFound) {
		writeError(w, http.StatusNotFound, "review target not found")
		return
	}

	logging.FromContext(r.Context()).Errorf("%s: %v", message, err)
	writeError(w, http.StatusInternalServerError, message)
}

func (s *Server) actorUserID(ctx context.Context) *int64 {
	profile, ok := s.gateway.GetProfile(ctx)
	if ok {
		return profile.UserId
	}
	return nil
}

func parsePathID(w http.ResponseWriter, r *http.Request, key string) (int64, bool) {
	value := r.PathValue(key)
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return id, true
}

func parseBoundedInt(value string, fallback, min, max int) int {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	if parsed < min {
		return min
	}
	if parsed > max {
		return max
	}
	return parsed
}

func cleanOptionalText(value *string) *string {
	if value == nil {
		return nil
	}
	cleaned := strings.TrimSpace(*value)
	if cleaned == "" {
		return nil
	}
	return &cleaned
}

func writeError(w http.ResponseWriter, status int, message string) {
	jsonutil.MarshalResponse(w, status, v1.ErrorResponse{
		Error:   status,
		Message: message,
	})
}
