package admin

import (
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
	defaultSuspiciousReviewRatingPairLimit = 50
	maxSuspiciousReviewRatingPairLimit     = 100
	maxReviewRatingDeleteCount             = 200
)

var (
	errReviewRatingDeleteEmpty   = errors.New("at least one review rating is required")
	errReviewRatingDeleteInvalid = errors.New("invalid review rating")
	errReviewRatingDeleteTooMany = errors.New("too many review ratings")
)

func (s *Server) ListSuspiciousReviewRatingPairs() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limit := parseBoundedInt(r.URL.Query().Get("limit"), defaultSuspiciousReviewRatingPairLimit, 1, maxSuspiciousReviewRatingPairLimit)
		offset := parseBoundedInt(r.URL.Query().Get("offset"), 0, 0, 1_000_000)

		pairs, err := s.db.ListSuspiciousReviewRatingPairs(r.Context(), admindb.ListSuspiciousReviewRatingPairOptions{
			Limit:          limit,
			Offset:         offset,
			MinScore:       parseBoundedInt(r.URL.Query().Get("min_score"), 5, 0, 16),
			Value:          parseChoiceQuery(r, "value", "any", "any", "like", "dislike", "mixed"),
			Visible:        parseChoiceQuery(r, "visible", "visible", "visible", "hidden", "any"),
			Search:         strings.TrimSpace(r.URL.Query().Get("search")),
			ReviewID:       parseOptionalInt64(r.URL.Query().Get("review_id")),
			ProfessorEmail: strings.TrimSpace(r.URL.Query().Get("professor_email")),
		})
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to list suspicious review rating pairs: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to list suspicious review rating pairs")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminSuspiciousReviewRatingPairListResponse{
			Pairs:  pairs,
			Limit:  limit,
			Offset: offset,
		})
	})
}

func (s *Server) DeleteReviewRatings() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		var request v1.AdminReviewRatingDeleteRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		ratings, err := normalizeReviewRatingDeleteRefs(request.Ratings)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
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
		actorUserID := s.actorUserID(ctx)
		if actorUserID == nil {
			logging.FromContext(ctx).Error("admin profile is missing an actor user id")
			writeError(w, http.StatusInternalServerError, "failed to delete review ratings")
			return
		}

		result, err := s.db.DeleteReviewRatings(ctx, admindb.DeleteReviewRatingsDecision{
			Ratings:     ratings,
			ActorUserID: *actorUserID,
			ReasonCode:  *reasonCode,
			Note:        cleanOptionalText(request.Note),
		})
		if err != nil {
			logging.FromContext(ctx).Errorf("failed to delete review ratings: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to delete review ratings")
			return
		}
		if len(result.AffectedReviewIDs) > 0 {
			if _, err := s.db.RecomputeReviewRatingSortIndexes(ctx, result.AffectedReviewIDs, time.Now()); err != nil {
				logging.FromContext(ctx).Warnf("review ratings were deleted, but affected review ranks could not be refreshed: %v", err)
			}
		}

		affectedReviewIDs := make([]string, 0, len(result.AffectedReviewIDs))
		for _, reviewID := range result.AffectedReviewIDs {
			affectedReviewIDs = append(affectedReviewIDs, strconv.FormatInt(reviewID, 10))
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminReviewRatingDeleteResponse{
			Success:           true,
			RequestedCount:    len(ratings),
			DeletedCount:      result.DeletedCount,
			AffectedReviewIDs: affectedReviewIDs,
		})
	})
}

func normalizeReviewRatingDeleteRefs(refs []v1.AdminReviewRatingRef) ([]admindb.ReviewRatingRef, error) {
	if len(refs) == 0 {
		return nil, errReviewRatingDeleteEmpty
	}

	type ratingKey struct {
		reviewID  int64
		sessionID int64
	}

	ratings := make([]admindb.ReviewRatingRef, 0, len(refs))
	seen := make(map[ratingKey]struct{}, len(refs))
	for _, ref := range refs {
		if ref.ReviewID == nil || ref.SessionID == nil || *ref.ReviewID <= 0 || *ref.SessionID <= 0 {
			return nil, errReviewRatingDeleteInvalid
		}

		key := ratingKey{reviewID: *ref.ReviewID, sessionID: *ref.SessionID}
		if _, duplicate := seen[key]; duplicate {
			continue
		}
		if len(ratings) == maxReviewRatingDeleteCount {
			return nil, errReviewRatingDeleteTooMany
		}

		seen[key] = struct{}{}
		ratings = append(ratings, admindb.ReviewRatingRef{
			ReviewID:  key.reviewID,
			SessionID: key.sessionID,
		})
	}

	return ratings, nil
}
