package database

import "time"

// Stats are bucketed by UAE local time. The UAE has no DST, so a fixed
// offset matches Postgres' 'Asia/Dubai' zone and avoids needing tzdata.
const statsTimezone = "Asia/Dubai"

var statsLocation = time.FixedZone(statsTimezone, 4*60*60)

const (
	StatsBucketDay   = "day"
	StatsBucketWeek  = "week"
	StatsBucketMonth = "month"

	StatsRange7Days   = "7d"
	StatsRange30Days  = "30d"
	StatsRange90Days  = "90d"
	StatsRange12Month = "12m"
	StatsRangeAll     = "all"

	maxStatsBuckets = 400
)

// StatsWindow is the current period [From, To) and the equal-length
// previous period [PrevFrom, From) used for comparisons. For the "all"
// range there is no previous period and PrevFrom equals From.
type StatsWindow struct {
	Range    string
	Bucket   string
	From     time.Time
	To       time.Time
	PrevFrom time.Time
}

func (w StatsWindow) HasPrevious() bool {
	return w.PrevFrom.Before(w.From)
}

func DefaultStatsBucket(rangeKey string) string {
	switch rangeKey {
	case StatsRange90Days, StatsRange12Month:
		return StatsBucketWeek
	case StatsRangeAll:
		return StatsBucketMonth
	default:
		return StatsBucketDay
	}
}

// ResolveStatsWindow turns a range key and bucket into concrete bounds.
// earliest is only used for the "all" range.
func ResolveStatsWindow(rangeKey, bucket string, now time.Time, earliest *time.Time) StatsWindow {
	today := localDayStart(now)

	var start time.Time
	switch rangeKey {
	case StatsRange7Days:
		start = today.AddDate(0, 0, -6)
	case StatsRange90Days:
		start = today.AddDate(0, 0, -89)
	case StatsRange12Month:
		start = time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, statsLocation).AddDate(0, -11, 0)
	case StatsRangeAll:
		start = today
		if earliest != nil && earliest.Before(now) {
			start = localDayStart(*earliest)
		}
	default:
		rangeKey = StatsRange30Days
		start = today.AddDate(0, 0, -29)
	}

	switch bucket {
	case StatsBucketDay, StatsBucketWeek, StatsBucketMonth:
	default:
		bucket = DefaultStatsBucket(rangeKey)
	}

	// Keep charts readable by coarsening buckets on long ranges.
	days := int(today.Sub(start).Hours()/24) + 1
	if bucket == StatsBucketDay && days > maxStatsBuckets {
		bucket = StatsBucketWeek
	}
	if bucket == StatsBucketWeek && days > maxStatsBuckets*7 {
		bucket = StatsBucketMonth
	}

	from := StatsBucketStart(start, bucket)
	window := StatsWindow{
		Range:    rangeKey,
		Bucket:   bucket,
		From:     from,
		To:       now,
		PrevFrom: from,
	}
	if rangeKey != StatsRangeAll {
		window.PrevFrom = from.Add(-now.Sub(from))
	}
	return window
}

// StatsBucketStart returns the local start of the bucket containing t.
// Weeks start on Monday, matching Postgres date_trunc('week', ...).
func StatsBucketStart(t time.Time, bucket string) time.Time {
	day := localDayStart(t)
	switch bucket {
	case StatsBucketWeek:
		offset := (int(day.Weekday()) + 6) % 7
		return day.AddDate(0, 0, -offset)
	case StatsBucketMonth:
		return time.Date(day.Year(), day.Month(), 1, 0, 0, 0, 0, statsLocation)
	default:
		return day
	}
}

// StatsBucketStarts lists every bucket start from the window start up to now.
func StatsBucketStarts(w StatsWindow) []time.Time {
	var starts []time.Time
	for cursor := StatsBucketStart(w.From, w.Bucket); cursor.Before(w.To); cursor = nextStatsBucket(cursor, w.Bucket) {
		starts = append(starts, cursor)
	}
	return starts
}

func StatsBucketKey(t time.Time) string {
	return t.In(statsLocation).Format("2006-01-02")
}

func StatsLocation() *time.Location {
	return statsLocation
}

func nextStatsBucket(t time.Time, bucket string) time.Time {
	switch bucket {
	case StatsBucketWeek:
		return t.AddDate(0, 0, 7)
	case StatsBucketMonth:
		return t.AddDate(0, 1, 0)
	default:
		return t.AddDate(0, 0, 1)
	}
}

func localDayStart(t time.Time) time.Time {
	local := t.In(statsLocation)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, statsLocation)
}

// localDate converts a Postgres date (scanned as UTC midnight) to local midnight.
func localDate(d time.Time) time.Time {
	return time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, statsLocation)
}
