package professor

import (
	"context"
	"time"

	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

func (s *Server) refreshReviewRank(ctx context.Context, reviewID int64) {
	logger := logging.FromContext(ctx)
	if _, err := s.db.RecomputeReviewSortIndex(ctx, reviewID, time.Now()); err != nil {
		logger.Warnf("failed to refresh review rank for %d: %v", reviewID, err)
	}
}

func (s *Server) refreshReviewAndBurstRanks(ctx context.Context, reviewID int64) {
	logger := logging.FromContext(ctx)
	if _, err := s.db.RecomputeReviewAndBurstSortIndexes(ctx, reviewID, time.Now()); err != nil {
		logger.Warnf("failed to refresh review/burst ranks for %d: %v", reviewID, err)
	}
}
