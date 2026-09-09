package admin

import (
	"net/http"
	"strings"

	admindb "github.com/osamashannak/uaeu-space/services/internal/admin/database"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

const (
	defaultSuspiciousReviewRatingPairLimit = 50
	maxSuspiciousReviewRatingPairLimit     = 100
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
