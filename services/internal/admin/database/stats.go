package database

import (
	"context"
	"fmt"
	"time"

	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

// Query parameters shared by the stats queries:
//   $1 current period start, $2 current period end (now), $3 previous period start.
// Columns stored as "timestamp without time zone" hold UTC, so they are
// compared against UTC-converted bounds to keep the comparison index-friendly.

func naiveRange(column string) string {
	return fmt.Sprintf("%[1]s >= ($3::timestamptz AT TIME ZONE 'UTC') AND %[1]s < ($2::timestamptz AT TIME ZONE 'UTC')", column)
}

func tzRange(column string) string {
	return fmt.Sprintf("%[1]s >= $3::timestamptz AND %[1]s < $2::timestamptz", column)
}

// statsSource yields daily counts split into current and previous period.
// inner must select a timestamptz column named ts plus anything aggs uses.
type statsSource struct {
	name  string
	inner string
	aggs  string
	apply func(c *v1.AdminStatsCounts, values []int64)
}

func (s statsSource) query() string {
	return `SELECT (e.ts AT TIME ZONE '` + statsTimezone + `')::date, e.ts >= $1::timestamptz, ` + s.aggs + `
		FROM (` + s.inner + `) e
		GROUP BY 1, 2`
}

func countSource(name, inner string, apply func(c *v1.AdminStatsCounts, n int64)) statsSource {
	return statsSource{
		name:  name,
		inner: inner,
		aggs:  "count(*)",
		apply: func(c *v1.AdminStatsCounts, v []int64) { apply(c, v[0]) },
	}
}

var statsSources = []statsSource{
	{
		name: "reviews",
		inner: `SELECT created_at AT TIME ZONE 'UTC' AS ts, student_verified, positive, visible, deleted_at, score
			FROM professor.review WHERE ` + naiveRange("created_at"),
		aggs: `count(*),
			count(*) FILTER (WHERE e.student_verified),
			count(*) FILTER (WHERE e.positive),
			count(*) FILTER (WHERE NOT e.visible AND e.deleted_at IS NULL),
			count(*) FILTER (WHERE e.deleted_at IS NOT NULL),
			COALESCE(sum(e.score), 0)`,
		apply: func(c *v1.AdminStatsCounts, v []int64) {
			c.Reviews += v[0]
			c.VerifiedReviews += v[1]
			c.PositiveReviews += v[2]
			c.HiddenReviews += v[3]
			c.DeletedReviews += v[4]
			c.ReviewScoreSum += v[5]
		},
	},
	{
		name: "ratings",
		inner: `SELECT created_at AT TIME ZONE 'UTC' AS ts, value
			FROM professor.review_rating WHERE ` + naiveRange("created_at"),
		aggs: `count(*), count(*) FILTER (WHERE e.value)`,
		apply: func(c *v1.AdminStatsCounts, v []int64) {
			c.Ratings += v[0]
			c.HelpfulRatings += v[1]
		},
	},
	countSource("replies",
		`SELECT created_at AT TIME ZONE 'UTC' AS ts FROM professor.review_reply WHERE `+naiveRange("created_at"),
		func(c *v1.AdminStatsCounts, n int64) { c.Replies += n }),
	countSource("course_files",
		`SELECT created_at AS ts FROM course.file WHERE `+tzRange("created_at"),
		func(c *v1.AdminStatsCounts, n int64) { c.CourseFiles += n }),
	countSource("professor_requests",
		`SELECT created_at AS ts FROM professor.professor_request WHERE `+tzRange("created_at"),
		func(c *v1.AdminStatsCounts, n int64) { c.ProfessorRequests += n }),
	countSource("signups",
		`SELECT created_at AS ts FROM account."user" WHERE `+tzRange("created_at"),
		func(c *v1.AdminStatsCounts, n int64) { c.Signups += n }),
	countSource("sessions",
		`SELECT created_at AT TIME ZONE 'UTC' AS ts FROM account.session WHERE `+naiveRange("created_at"),
		func(c *v1.AdminStatsCounts, n int64) { c.Sessions += n }),
	countSource("reports",
		`SELECT created_at AT TIME ZONE 'UTC' AS ts FROM professor.review_report WHERE `+naiveRange("created_at"),
		func(c *v1.AdminStatsCounts, n int64) { c.Reports += n }),
	countSource("reports_resolved",
		`SELECT resolved_at AS ts FROM professor.review_report WHERE `+tzRange("resolved_at"),
		func(c *v1.AdminStatsCounts, n int64) { c.ReportsResolved += n }),
	countSource("moderation_actions",
		`SELECT created_at AS ts FROM moderation.action_log WHERE action <> 'note' AND `+tzRange("created_at"),
		func(c *v1.AdminStatsCounts, n int64) { c.ModerationActions += n }),
}

// Contributors are distinct anonymous sessions that wrote anything.
var statsContributorsQuery = `
	WITH events AS (
		SELECT created_at AT TIME ZONE 'UTC' AS ts, session_id FROM professor.review
			WHERE session_id IS NOT NULL AND ` + naiveRange("created_at") + `
		UNION ALL
		SELECT created_at AT TIME ZONE 'UTC', session_id FROM professor.review_rating WHERE ` + naiveRange("created_at") + `
		UNION ALL
		SELECT created_at AT TIME ZONE 'UTC', session_id FROM professor.review_reply WHERE ` + naiveRange("created_at") + `
		UNION ALL
		SELECT created_at, session_id FROM course.file WHERE session_id IS NOT NULL AND ` + tzRange("created_at") + `
		UNION ALL
		SELECT created_at, session_id FROM professor.professor_request WHERE ` + tzRange("created_at") + `
	)
	SELECT 'bucket', date_trunc($4::text, e.ts AT TIME ZONE '` + statsTimezone + `')::date, count(DISTINCT e.session_id)
		FROM events e WHERE e.ts >= $1::timestamptz GROUP BY 2
	UNION ALL
	SELECT 'current', NULL, count(DISTINCT e.session_id) FROM events e WHERE e.ts >= $1::timestamptz
	UNION ALL
	SELECT 'previous', NULL, count(DISTINCT e.session_id) FROM events e WHERE e.ts < $1::timestamptz`

const statsTotalsQuery = `
	SELECT
		(SELECT count(*) FROM professor.review WHERE deleted_at IS NULL AND visible),
		(SELECT count(*) FROM professor.professor WHERE visible),
		(SELECT count(*) FROM course.course),
		(SELECT count(*) FROM course.file WHERE visible),
		(SELECT count(*) FROM professor.review_rating),
		(SELECT count(*) FROM account."user"),
		(SELECT COALESCE(sum(views), 0) FROM professor.professor),
		(SELECT COALESCE(sum(views), 0) FROM course.course),
		(SELECT COALESCE(sum(download_count), 0) FROM course.file)`

const statsBacklogQuery = `
	SELECT
		(SELECT count(*) FROM professor.review WHERE NOT reviewed AND deleted_at IS NULL),
		(SELECT count(*) FROM professor.review WHERE NOT reviewed AND deleted_at IS NULL
			AND created_at >= (now() AT TIME ZONE 'UTC') - interval '30 days'),
		(SELECT count(*) FROM professor.review_reply WHERE NOT reviewed AND deleted_at IS NULL),
		(SELECT count(*) FROM course.file WHERE NOT reviewed),
		(SELECT count(*) FROM professor.review_report WHERE NOT resolved),
		(SELECT count(*) FROM professor.professor_request WHERE status = 'pending')`

// Median hours from submission to decision, for decisions made in the current period.
const statsTurnaroundQuery = `
	SELECT
		(SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM reviewed_at - (created_at AT TIME ZONE 'UTC'))::float8 / 3600)
			FROM professor.review WHERE reviewed_at >= $1::timestamptz AND reviewed_at < $2::timestamptz),
		(SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM reviewed_at - created_at)::float8 / 3600)
			FROM course.file WHERE reviewed_at >= $1::timestamptz AND reviewed_at < $2::timestamptz),
		(SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM resolved_at - (created_at AT TIME ZONE 'UTC'))::float8 / 3600)
			FROM professor.review_report WHERE resolved_at >= $1::timestamptz AND resolved_at < $2::timestamptz),
		(SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM reviewed_at - created_at)::float8 / 3600)
			FROM professor.professor_request WHERE status <> 'pending' AND reviewed_at >= $1::timestamptz AND reviewed_at < $2::timestamptz)`

const statsModerationActionsQuery = `
	SELECT action, count(*)
	FROM moderation.action_log
	WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
	GROUP BY action
	ORDER BY 2 DESC, action`

const statsReviewsByUniversityQuery = `
	SELECT p.university, count(*)
	FROM professor.review r
	JOIN professor.professor p ON p.email = r.professor_email
	WHERE r.deleted_at IS NULL
	  AND r.created_at >= ($1::timestamptz AT TIME ZONE 'UTC') AND r.created_at < ($2::timestamptz AT TIME ZONE 'UTC')
	GROUP BY p.university
	ORDER BY 2 DESC, p.university
	LIMIT 8`

const statsTopProfessorsQuery = `
	SELECT p.email, p.name, p.university, count(*)
	FROM professor.review r
	JOIN professor.professor p ON p.email = r.professor_email
	WHERE r.deleted_at IS NULL
	  AND r.created_at >= ($1::timestamptz AT TIME ZONE 'UTC') AND r.created_at < ($2::timestamptz AT TIME ZONE 'UTC')
	GROUP BY p.email, p.name, p.university
	ORDER BY 4 DESC, p.name
	LIMIT 10`

// EarliestActivity returns when the first review was written, used as the
// start of the "all time" range.
func (db *AdminDB) EarliestActivity(ctx context.Context) (*time.Time, error) {
	var earliest *time.Time
	err := db.db.Pool.QueryRow(ctx, `SELECT min(created_at) AT TIME ZONE 'UTC' FROM professor.review`).Scan(&earliest)
	if err != nil {
		return nil, fmt.Errorf("earliest activity: %w", err)
	}
	return earliest, nil
}

func (db *AdminDB) GetStats(ctx context.Context, w StatsWindow) (*v1.AdminStatsResponse, error) {
	starts := StatsBucketStarts(w)
	points := make([]v1.AdminStatsPoint, len(starts))
	index := make(map[string]int, len(starts))
	for i, start := range starts {
		key := StatsBucketKey(start)
		points[i].Start = key
		index[key] = i
	}

	var current, previous v1.AdminStatsCounts
	args := []any{w.From, w.To, w.PrevFrom}

	for _, source := range statsSources {
		if err := db.collectStatsSource(ctx, source, w, args, points, index, &current, &previous); err != nil {
			return nil, err
		}
	}

	if err := db.collectContributors(ctx, w, args, points, index, &current, &previous); err != nil {
		return nil, err
	}

	response := &v1.AdminStatsResponse{
		Series:  points,
		Current: current,
	}
	if w.HasPrevious() {
		response.Previous = &previous
	}

	t := &response.Totals
	if err := db.db.Pool.QueryRow(ctx, statsTotalsQuery).Scan(
		&t.Reviews, &t.Professors, &t.Courses, &t.CourseFiles, &t.Ratings,
		&t.Users, &t.ProfessorViews, &t.CourseViews, &t.FileDownloads,
	); err != nil {
		return nil, fmt.Errorf("stats totals: %w", err)
	}

	b := &response.Backlog
	if err := db.db.Pool.QueryRow(ctx, statsBacklogQuery).Scan(
		&b.UnreviewedReviews, &b.UnreviewedRecentReviews, &b.UnreviewedReplies,
		&b.UnreviewedCourseFiles, &b.OpenReports, &b.PendingProfessorRequests,
	); err != nil {
		return nil, fmt.Errorf("stats backlog: %w", err)
	}

	ta := &response.Turnaround
	if err := db.db.Pool.QueryRow(ctx, statsTurnaroundQuery, w.From, w.To).Scan(
		&ta.ReviewsHours, &ta.CourseFilesHours, &ta.ReportsHours, &ta.ProfessorRequestsHours,
	); err != nil {
		return nil, fmt.Errorf("stats turnaround: %w", err)
	}

	var err error
	if response.ModerationActions, err = db.statsCounts(ctx, statsModerationActionsQuery, w); err != nil {
		return nil, fmt.Errorf("stats moderation actions: %w", err)
	}
	if response.ReviewsByUniversity, err = db.statsCounts(ctx, statsReviewsByUniversityQuery, w); err != nil {
		return nil, fmt.Errorf("stats reviews by university: %w", err)
	}

	rows, err := db.db.Pool.Query(ctx, statsTopProfessorsQuery, w.From, w.To)
	if err != nil {
		return nil, fmt.Errorf("stats top professors: %w", err)
	}
	defer rows.Close()
	response.TopProfessors = []v1.AdminStatsProfessor{}
	for rows.Next() {
		var p v1.AdminStatsProfessor
		if err := rows.Scan(&p.Email, &p.Name, &p.University, &p.Reviews); err != nil {
			return nil, fmt.Errorf("stats top professors scan: %w", err)
		}
		response.TopProfessors = append(response.TopProfessors, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("stats top professors rows: %w", err)
	}

	return response, nil
}

func (db *AdminDB) collectStatsSource(
	ctx context.Context,
	source statsSource,
	w StatsWindow,
	args []any,
	points []v1.AdminStatsPoint,
	index map[string]int,
	current, previous *v1.AdminStatsCounts,
) error {
	rows, err := db.db.Pool.Query(ctx, source.query(), args...)
	if err != nil {
		return fmt.Errorf("stats %s: %w", source.name, err)
	}
	defer rows.Close()

	for rows.Next() {
		count := len(rows.FieldDescriptions()) - 2

		var day time.Time
		var isCurrent bool
		numbers := make([]int64, count)
		dest := make([]any, 0, count+2)
		dest = append(dest, &day, &isCurrent)
		for i := range numbers {
			dest = append(dest, &numbers[i])
		}
		if err := rows.Scan(dest...); err != nil {
			return fmt.Errorf("stats %s scan: %w", source.name, err)
		}

		if !isCurrent {
			source.apply(previous, numbers)
			continue
		}
		source.apply(current, numbers)
		if i, ok := index[StatsBucketKey(StatsBucketStart(localDate(day), w.Bucket))]; ok {
			source.apply(&points[i].AdminStatsCounts, numbers)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("stats %s rows: %w", source.name, err)
	}
	return nil
}

func (db *AdminDB) collectContributors(
	ctx context.Context,
	w StatsWindow,
	args []any,
	points []v1.AdminStatsPoint,
	index map[string]int,
	current, previous *v1.AdminStatsCounts,
) error {
	rows, err := db.db.Pool.Query(ctx, statsContributorsQuery, append(args, w.Bucket)...)
	if err != nil {
		return fmt.Errorf("stats contributors: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var kind string
		var bucket *time.Time
		var count int64
		if err := rows.Scan(&kind, &bucket, &count); err != nil {
			return fmt.Errorf("stats contributors scan: %w", err)
		}
		switch kind {
		case "current":
			current.ActiveContributors = count
		case "previous":
			previous.ActiveContributors = count
		default:
			if bucket == nil {
				continue
			}
			if i, ok := index[StatsBucketKey(localDate(*bucket))]; ok {
				points[i].ActiveContributors = count
			}
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("stats contributors rows: %w", err)
	}
	return nil
}

func (db *AdminDB) statsCounts(ctx context.Context, query string, w StatsWindow) ([]v1.AdminStatsCount, error) {
	rows, err := db.db.Pool.Query(ctx, query, w.From, w.To)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := []v1.AdminStatsCount{}
	for rows.Next() {
		var c v1.AdminStatsCount
		if err := rows.Scan(&c.Key, &c.Count); err != nil {
			return nil, err
		}
		counts = append(counts, c)
	}
	return counts, rows.Err()
}
