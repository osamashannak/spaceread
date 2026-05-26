package ranking

import (
	"math"
	"strings"
)

const (
	sequenceBits = 12
	serverBits   = 10
	timeShift    = sequenceBits + serverBits

	newWindowHours = 7 * 24

	laneShift       = 61
	scoreShift      = 50
	newTimeShift    = 19
	newScoreShift   = 8
	normalTimeShift = 8

	tieMask        = uint64(0xff)
	maxScoreBucket = uint64(2047)
	maxSortIndex   = uint64(math.MaxInt64)
)

type Lane uint64

const (
	LaneLowQuality Lane = iota
	LaneUseful
	LaneNew
)

type Review struct {
	ID                int64
	Score             int
	Content           string
	ProfessorEmail    string
	CourseTaken       *string
	GradeReceived     *string
	CreatedAtUnixHour int64
	NowUnixHour       int64
	Visible           bool
	UaeuOrigin        bool
	HasAttachment     bool
	HasGif            bool
	LikeCount         int
	DislikeCount      int
	ReplyCount        int
	ReportCount       int
	BurstSiblingCount int
}

type Result struct {
	SortIndex       int64
	Lane            Lane
	UsefulnessScore float64
	ScoreBucket     uint64
}

func Compute(review Review) Result {
	usefulness := UsefulnessScore(review)
	scoreBucket := scoreBucket(usefulness)
	lane := DetermineLane(review)
	snowflakeTime := uint64(review.ID) >> timeShift
	tieBits := uint64(review.ID) & tieMask

	var packed uint64
	if lane == LaneNew {
		packed = (uint64(lane) << laneShift) |
			(snowflakeTime << newTimeShift) |
			(scoreBucket << newScoreShift) |
			tieBits
	} else {
		packed = (uint64(lane) << laneShift) |
			(scoreBucket << scoreShift) |
			(snowflakeTime << normalTimeShift) |
			tieBits
	}

	if packed > maxSortIndex {
		packed = maxSortIndex
	}

	return Result{
		SortIndex:       int64(packed),
		Lane:            lane,
		UsefulnessScore: usefulness,
		ScoreBucket:     scoreBucket,
	}
}

func DetermineLane(review Review) Lane {
	if IsLowQualityRisky(review) {
		return LaneLowQuality
	}
	if reviewAgeHours(review) < newWindowHours {
		return LaneNew
	}
	return LaneUseful
}

func UsefulnessScore(review Review) float64 {
	score := 180.0
	score += wilsonScore(review.LikeCount, review.DislikeCount) * 340
	score += substanceScore(review)
	if review.UaeuOrigin {
		score += 60
	}
	score += math.Min(math.Log1p(float64(nonNegative(review.ReplyCount)))*22, 60)
	score -= wilsonScore(review.DislikeCount, review.LikeCount) * 220
	score -= math.Min(float64(nonNegative(review.ReportCount))*70, 220)

	if isOldLowEffort(review) {
		score -= 100
	}
	if score < 0 {
		return 0
	}
	if score > 1000 {
		return 1000
	}
	return score
}

func IsLowQualityRisky(review Review) bool {
	if !review.Visible {
		return true
	}
	if review.ReportCount >= 3 {
		return true
	}
	if review.DislikeCount >= 3 && wilsonScore(review.DislikeCount, review.LikeCount) >= 0.55 {
		return true
	}
	if isOldLowEffort(review) {
		return true
	}
	if isSuspiciousReviewBomb(review) {
		return true
	}
	return false
}

func isSuspiciousReviewBomb(review Review) bool {
	if review.Score != 1 && review.Score != 5 {
		return false
	}
	if review.BurstSiblingCount < 4 {
		return false
	}
	if review.HasAttachment || review.HasGif {
		return false
	}
	return textLen(review.Content) < 80 && review.LikeCount <= review.DislikeCount
}

func isOldLowEffort(review Review) bool {
	return reviewAgeHours(review) >= newWindowHours &&
		textLen(review.Content) < 25 &&
		!hasText(review.CourseTaken) &&
		!hasText(review.GradeReceived) &&
		!review.HasAttachment &&
		!review.HasGif
}

func isLowSubstance(review Review) bool {
	return textLen(review.Content) < 80 &&
		!hasText(review.CourseTaken) &&
		!hasText(review.GradeReceived) &&
		!review.HasAttachment &&
		!review.HasGif
}

func substanceScore(review Review) float64 {
	length := textLen(review.Content)
	score := 0.0
	if length >= 80 {
		score += 50
	}
	if length >= 200 {
		score += 70
	}
	if length >= 500 {
		score += 30
	}
	if hasText(review.CourseTaken) {
		score += 35
	}
	if hasText(review.GradeReceived) {
		score += 20
	}
	if review.HasAttachment || review.HasGif {
		score += 15
	}
	return score
}

func scoreBucket(score float64) uint64 {
	if score <= 0 {
		return 0
	}
	if score >= 1000 {
		return maxScoreBucket
	}
	return uint64(math.Round(score / 1000 * float64(maxScoreBucket)))
}

func wilsonScore(positive, negative int) float64 {
	positive = nonNegative(positive)
	negative = nonNegative(negative)
	n := positive + negative
	if n == 0 {
		return 0
	}

	z := 1.96
	phat := float64(positive) / float64(n)
	nf := float64(n)
	return (phat + z*z/(2*nf) - z*math.Sqrt((phat*(1-phat)+z*z/(4*nf))/nf)) / (1 + z*z/nf)
}

func reviewAgeHours(review Review) int64 {
	age := review.NowUnixHour - review.CreatedAtUnixHour
	if age < 0 {
		return 0
	}
	return age
}

func textLen(value string) int {
	return len([]rune(strings.TrimSpace(value)))
}

func hasText(value *string) bool {
	return value != nil && strings.TrimSpace(*value) != ""
}

func nonNegative(value int) int {
	if value < 0 {
		return 0
	}
	return value
}
