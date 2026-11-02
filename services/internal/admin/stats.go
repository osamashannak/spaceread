package admin

import (
	"net/http"
	"time"

	admindb "github.com/osamashannak/uaeu-space/services/internal/admin/database"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

func (s *Server) GetStats() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		rangeKey := parseChoiceQuery(r, "range", admindb.StatsRange30Days,
			admindb.StatsRange7Days, admindb.StatsRange30Days, admindb.StatsRange90Days,
			admindb.StatsRange12Month, admindb.StatsRangeAll)
		bucket := parseChoiceQuery(r, "bucket", "",
			admindb.StatsBucketDay, admindb.StatsBucketWeek, admindb.StatsBucketMonth)

		var earliest *time.Time
		if rangeKey == admindb.StatsRangeAll {
			var err error
			earliest, err = s.db.EarliestActivity(ctx)
			if err != nil {
				logging.FromContext(ctx).Errorf("failed to load earliest activity: %v", err)
				writeError(w, http.StatusInternalServerError, "failed to load statistics")
				return
			}
		}

		window := admindb.ResolveStatsWindow(rangeKey, bucket, time.Now(), earliest)
		stats, err := s.db.GetStats(ctx, window)
		if err != nil {
			logging.FromContext(ctx).Errorf("failed to load statistics: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to load statistics")
			return
		}

		stats.Range = v1.AdminStatsRange{
			Key:      window.Range,
			Bucket:   window.Bucket,
			From:     window.From,
			To:       window.To,
			Timezone: admindb.StatsLocation().String(),
		}
		jsonutil.MarshalResponse(w, http.StatusOK, stats)
	})
}
