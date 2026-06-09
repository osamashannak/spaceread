package admin

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	admindb "github.com/osamashannak/uaeu-space/services/internal/admin/database"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

const (
	defaultReviewLimit               = 50
	maxReviewLimit                   = 100
	defaultSuspiciousReviewPairLimit = 50
	maxSuspiciousReviewPairLimit     = 100
	defaultSimilarityThreshold       = 0.5
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

func (s *Server) UpdateReason() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		currentCode := strings.TrimSpace(r.PathValue("reasonCode"))
		if !validReasonCode(currentCode) {
			writeError(w, http.StatusBadRequest, "invalid moderation reason code")
			return
		}

		var request v1.AdminReasonUpdateRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		nextCode := strings.TrimSpace(*request.Code)
		label := strings.TrimSpace(*request.Label)
		policyArea := strings.TrimSpace(*request.PolicyArea)
		policyReference := cleanOptionalText(request.PolicyReference)

		switch {
		case !validReasonCode(nextCode):
			writeError(w, http.StatusBadRequest, "invalid moderation reason code")
			return
		case label == "":
			writeError(w, http.StatusBadRequest, "label is required")
			return
		case policyArea == "":
			writeError(w, http.StatusBadRequest, "policy_area is required")
			return
		case *request.SortOrder < 0:
			writeError(w, http.StatusBadRequest, "sort_order must be zero or greater")
			return
		}

		reason, err := s.db.UpdateReason(r.Context(), admindb.ReasonUpdate{
			CurrentCode:     currentCode,
			Code:            nextCode,
			Label:           label,
			PolicyArea:      policyArea,
			PolicyReference: policyReference,
			Active:          *request.Active,
			SortOrder:       *request.SortOrder,
		})
		if err != nil {
			if errors.Is(err, admindb.ErrNotFound) {
				writeError(w, http.StatusNotFound, "moderation reason not found")
				return
			}
			if errors.Is(err, admindb.ErrConflict) {
				writeError(w, http.StatusConflict, "moderation reason code already exists")
				return
			}
			logging.FromContext(r.Context()).Errorf("failed to update moderation reason %q: %v", currentCode, err)
			writeError(w, http.StatusInternalServerError, "failed to update moderation reason")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminReasonResponse{Reason: *reason})
	})
}

func (s *Server) ListReviews() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limit := parseBoundedInt(r.URL.Query().Get("limit"), defaultReviewLimit, 1, maxReviewLimit)
		offset := parseBoundedInt(r.URL.Query().Get("offset"), 0, 0, 1_000_000)

		reviews, err := s.db.ListReviews(r.Context(), admindb.ListReviewOptions{
			Limit:                limit,
			Offset:               offset,
			Sort:                 parseChoiceQuery(r, "sort", "newest", "newest", "oldest", "most_reports", "most_signals", "random"),
			NeedsAttention:       parseBoolQuery(r, "needs_attention", true),
			Deleted:              parseChoiceQuery(r, "deleted", "exclude", "exclude", "include", "only"),
			Visible:              parseBoolChoiceQuery(r, "visible", "visible", "hidden"),
			Reviewed:             parseBoolChoiceQuery(r, "reviewed", "reviewed", "not_reviewed"),
			Positive:             parseBoolChoiceQuery(r, "positive", "recommended", "not_recommended"),
			StudentVerified:      parseBoolChoiceQuery(r, "student_verified", "verified", "not_verified"),
			UaeuOrigin:           parseBoolChoiceQuery(r, "uaeu_origin", "uaeu", "non_uaeu"),
			Media:                parseChoiceQuery(r, "media", "any", "any", "with_media", "without_media", "attachment", "gif"),
			OpenReports:          parseChoiceQuery(r, "open_reports", "any", "any", "has", "none"),
			Signals:              parseChoiceQuery(r, "signals", "any", "any", "has", "none"),
			HasSession:           parseChoiceQuery(r, "has_session", "any", "any", "has", "none"),
			HasUser:              parseChoiceQuery(r, "has_user", "any", "any", "has", "none"),
			HasIP:                parseChoiceQuery(r, "has_ip", "any", "any", "has", "none"),
			Search:               strings.TrimSpace(r.URL.Query().Get("search")),
			ReviewID:             parseOptionalInt64(r.URL.Query().Get("review_id")),
			ProfessorEmail:       strings.TrimSpace(r.URL.Query().Get("professor_email")),
			ProfessorName:        strings.TrimSpace(r.URL.Query().Get("professor_name")),
			ProfessorCollege:     strings.TrimSpace(r.URL.Query().Get("professor_college")),
			ProfessorUniversity:  strings.TrimSpace(r.URL.Query().Get("professor_university")),
			Language:             strings.TrimSpace(r.URL.Query().Get("language")),
			CourseTaken:          strings.TrimSpace(r.URL.Query().Get("course_taken")),
			GradeReceived:        strings.TrimSpace(r.URL.Query().Get("grade_received")),
			ModerationReasonCode: strings.TrimSpace(r.URL.Query().Get("moderation_reason_code")),
			ReviewerUserID:       parseOptionalInt64(r.URL.Query().Get("reviewer_user_id")),
			SessionID:            parseOptionalInt64(r.URL.Query().Get("session_id")),
			UserID:               parseOptionalInt64(r.URL.Query().Get("user_id")),
			IPAddress:            strings.TrimSpace(r.URL.Query().Get("ip_address")),
			ScoreMin:             parseOptionalInt(r.URL.Query().Get("score_min")),
			ScoreMax:             parseOptionalInt(r.URL.Query().Get("score_max")),
			LikeMin:              parseOptionalInt(r.URL.Query().Get("like_min")),
			LikeMax:              parseOptionalInt(r.URL.Query().Get("like_max")),
			DislikeMin:           parseOptionalInt(r.URL.Query().Get("dislike_min")),
			DislikeMax:           parseOptionalInt(r.URL.Query().Get("dislike_max")),
			ReplyMin:             parseOptionalInt64(r.URL.Query().Get("reply_min")),
			ReplyMax:             parseOptionalInt64(r.URL.Query().Get("reply_max")),
			CreatedFrom:          parseOptionalTime(r.URL.Query().Get("created_from")),
			CreatedTo:            parseOptionalEndTime(r.URL.Query().Get("created_to")),
			ReviewedFrom:         parseOptionalTime(r.URL.Query().Get("reviewed_from")),
			ReviewedTo:           parseOptionalEndTime(r.URL.Query().Get("reviewed_to")),
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

func (s *Server) ListSuspiciousReviewPairs() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limit := parseBoundedInt(r.URL.Query().Get("limit"), defaultSuspiciousReviewPairLimit, 1, maxSuspiciousReviewPairLimit)
		offset := parseBoundedInt(r.URL.Query().Get("offset"), 0, 0, 1_000_000)

		pairs, err := s.db.ListSuspiciousReviewPairs(r.Context(), admindb.ListSuspiciousReviewPairOptions{
			Limit:               limit,
			Offset:              offset,
			MinScore:            parseBoundedInt(r.URL.Query().Get("min_score"), 5, 0, 17),
			SimilarityThreshold: parseBoundedFloat(r.URL.Query().Get("similarity_threshold"), defaultSimilarityThreshold, 0.3, 1),
			Visible:             parseChoiceQuery(r, "visible", "at_least_one", "at_least_one", "both", "include_hidden"),
			ProfessorEmail:      strings.TrimSpace(r.URL.Query().Get("professor_email")),
			Search:              strings.TrimSpace(r.URL.Query().Get("search")),
			IncludeContentOnly:  parseBoolQuery(r, "include_content_only", false),
		})
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to list suspicious review pairs: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to list suspicious review pairs")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminSuspiciousReviewPairListResponse{
			Pairs:  pairs,
			Limit:  limit,
			Offset: offset,
		})
	})
}

func (s *Server) HideSuspiciousReviewPair() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		var request v1.AdminReviewPairVisibilityRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		if *request.Review1ID <= 0 || *request.Review2ID <= 0 {
			writeError(w, http.StatusBadRequest, "invalid review id")
			return
		}
		if *request.Review1ID == *request.Review2ID {
			writeError(w, http.StatusBadRequest, "reviews must be different")
			return
		}

		reasonCode := cleanOptionalText(request.ReasonCode)
		if reasonCode == nil {
			writeError(w, http.StatusBadRequest, "reason_code is required")
			return
		}
		if !s.validReason(w, r, reasonCode) {
			return
		}

		resolveReports := true
		if request.ResolveReports != nil {
			resolveReports = *request.ResolveReports
		}

		result, err := s.db.SetReviewPairVisibility(ctx, admindb.ReviewPairVisibilityDecision{
			Review1ID:      *request.Review1ID,
			Review2ID:      *request.Review2ID,
			Visible:        false,
			ActorUserID:    s.actorUserID(ctx),
			ReasonCode:     reasonCode,
			Note:           cleanOptionalText(request.Note),
			ResolveReports: resolveReports,
		})
		if err != nil {
			s.writeDecisionError(w, r, err, "failed to hide suspicious review pair")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminPairDecisionResponse{
			Success:             true,
			Review1:             *result.Review1,
			Review2:             *result.Review2,
			ResolvedReportCount: result.ResolvedReportCount,
			Action:              result.Action,
		})
	})
}

func (s *Server) HideSuspiciousReviewPairs() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		var request v1.AdminReviewPairBulkVisibilityRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		if len(request.Pairs) == 0 {
			writeError(w, http.StatusBadRequest, "at least one review pair is required")
			return
		}
		if len(request.Pairs) > maxSuspiciousReviewPairLimit {
			writeError(w, http.StatusBadRequest, "too many review pairs")
			return
		}

		pairs := make([]admindb.ReviewPairRef, 0, len(request.Pairs))
		for _, pair := range request.Pairs {
			if pair.Review1ID == nil || pair.Review2ID == nil || *pair.Review1ID <= 0 || *pair.Review2ID <= 0 {
				writeError(w, http.StatusBadRequest, "invalid review pair")
				return
			}
			if *pair.Review1ID == *pair.Review2ID {
				writeError(w, http.StatusBadRequest, "reviews must be different")
				return
			}
			pairs = append(pairs, admindb.ReviewPairRef{
				Review1ID: *pair.Review1ID,
				Review2ID: *pair.Review2ID,
			})
		}

		reasonCode := cleanOptionalText(request.ReasonCode)
		if reasonCode == nil {
			writeError(w, http.StatusBadRequest, "reason_code is required")
			return
		}
		if !s.validReason(w, r, reasonCode) {
			return
		}

		resolveReports := true
		if request.ResolveReports != nil {
			resolveReports = *request.ResolveReports
		}

		result, err := s.db.SetReviewPairsVisibility(ctx, admindb.ReviewPairBulkVisibilityDecision{
			Pairs:          pairs,
			Visible:        false,
			ActorUserID:    s.actorUserID(ctx),
			ReasonCode:     reasonCode,
			Note:           cleanOptionalText(request.Note),
			ResolveReports: resolveReports,
		})
		if err != nil {
			s.writeDecisionError(w, r, err, "failed to hide suspicious review pairs")
			return
		}

		responsePairs := make([]v1.AdminReviewPairDecision, 0, len(result.Pairs))
		for _, pair := range result.Pairs {
			responsePairs = append(responsePairs, v1.AdminReviewPairDecision{
				Review1: *pair.Review1,
				Review2: *pair.Review2,
				Action:  pair.Action,
			})
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminBulkPairDecisionResponse{
			Success:             true,
			Pairs:               responsePairs,
			ResolvedReportCount: result.ResolvedReportCount,
			Action:              result.Action,
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

func parseBoundedFloat(value string, fallback, min, max float64) float64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
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

func parseBoolQuery(r *http.Request, key string, fallback bool) bool {
	value := r.URL.Query().Get(key)
	if value == "" {
		return fallback
	}
	return strings.EqualFold(value, "true")
}

func parseBoolChoiceQuery(r *http.Request, key, trueValue, falseValue string) *bool {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	switch value {
	case trueValue:
		result := true
		return &result
	case falseValue:
		result := false
		return &result
	default:
		return nil
	}
}

func parseChoiceQuery(r *http.Request, key, fallback string, allowed ...string) string {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return fallback
	}
	for _, option := range allowed {
		if value == option {
			return value
		}
	}
	return fallback
}

func parseOptionalInt(value string) *int {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return nil
	}
	return &parsed
}

func parseOptionalInt64(value string) *int64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return nil
	}
	return &parsed
}

func parseOptionalTime(value string) *time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return &parsed
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return &parsed
	}
	return nil
}

func parseOptionalEndTime(value string) *time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return &parsed
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		end := parsed.AddDate(0, 0, 1).Add(-time.Nanosecond)
		return &end
	}
	return nil
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

func validReasonCode(code string) bool {
	if code == "" || len(code) > 80 {
		return false
	}
	for _, char := range code {
		switch {
		case char >= 'a' && char <= 'z':
		case char >= '0' && char <= '9':
		case char == '_':
		default:
			return false
		}
	}
	return true
}

func writeError(w http.ResponseWriter, status int, message string) {
	jsonutil.MarshalResponse(w, status, v1.ErrorResponse{
		Error:   status,
		Message: message,
	})
}
