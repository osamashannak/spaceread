package database

import (
	"context"
	"fmt"
	"strings"

	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

type ListSuspiciousReviewRatingPairOptions struct {
	Limit          int
	Offset         int
	MinScore       int
	Value          string
	Visible        string
	Search         string
	ReviewID       *int64
	ProfessorEmail string
}

const (
	suspiciousReviewRatingCloseTimingSeconds  = int64(3600)
	suspiciousReviewRatingSameIPWeight        = 2
	suspiciousReviewRatingSameUserAgentWeight = 1
	suspiciousReviewRatingSameThumbmarkWeight = 5
	suspiciousReviewRatingSameCreepWeight     = 5
	suspiciousReviewRatingSameValueWeight     = 1
	suspiciousReviewRatingCloseTimingWeight   = 2
)

func suspiciousReviewRatingScore(sameIP, sameUserAgent, sameThumbmark, sameCreep, sameValue, closeTiming bool) int {
	score := 0
	if sameIP {
		score += suspiciousReviewRatingSameIPWeight
	}
	if sameUserAgent {
		score += suspiciousReviewRatingSameUserAgentWeight
	}
	if sameThumbmark {
		score += suspiciousReviewRatingSameThumbmarkWeight
	}
	if sameCreep {
		score += suspiciousReviewRatingSameCreepWeight
	}
	if sameValue {
		score += suspiciousReviewRatingSameValueWeight
	}
	if closeTiming {
		score += suspiciousReviewRatingCloseTimingWeight
	}
	return score
}

func buildSuspiciousReviewRatingPairsQuery(opts ListSuspiciousReviewRatingPairOptions) (string, []any) {
	if opts.Limit <= 0 {
		opts.Limit = 50
	}
	if opts.Offset < 0 {
		opts.Offset = 0
	}

	args := []any{opts.Limit, opts.Offset, opts.MinScore}
	nextArg := func(value any) string {
		args = append(args, value)
		return fmt.Sprintf("$%d", len(args))
	}

	conditions := []string{
		"r.deleted_at IS NULL",
	}

	switch opts.Value {
	case "like":
		conditions = append(conditions, "rr1.value = true AND rr2.value = true")
	case "dislike":
		conditions = append(conditions, "rr1.value = false AND rr2.value = false")
	case "mixed":
		conditions = append(conditions, "rr1.value <> rr2.value")
	}

	switch opts.Visible {
	case "hidden":
		conditions = append(conditions, "r.visible = false")
	case "any":
	default:
		conditions = append(conditions, "r.visible = true")
	}

	if opts.ReviewID != nil {
		conditions = append(conditions, "r.id = "+nextArg(*opts.ReviewID))
	}
	if opts.ProfessorEmail != "" {
		conditions = append(conditions, "r.professor_email ILIKE "+nextArg("%"+opts.ProfessorEmail+"%"))
	}
	if opts.Search != "" {
		param := nextArg("%" + opts.Search + "%")
		conditions = append(conditions, fmt.Sprintf(`(
			r.id::text ILIKE %[1]s
			OR r.professor_email ILIKE %[1]s
			OR COALESCE(p.name, '') ILIKE %[1]s
			OR COALESCE(p.college, '') ILIKE %[1]s
			OR COALESCE(p.university, '') ILIKE %[1]s
			OR r.content ILIKE %[1]s
			OR rr1.session_id::text ILIKE %[1]s
			OR rr2.session_id::text ILIKE %[1]s
			OR COALESCE(rr1.user_id::text, '') ILIKE %[1]s
			OR COALESCE(rr2.user_id::text, '') ILIKE %[1]s
			OR rr1.ip_address::text ILIKE %[1]s
			OR rr2.ip_address::text ILIKE %[1]s
			OR COALESCE(rr1.thumbmark_fingerprint, '') ILIKE %[1]s
			OR COALESCE(rr2.thumbmark_fingerprint, '') ILIKE %[1]s
			OR COALESCE(rr1.creep_fingerprint, '') ILIKE %[1]s
			OR COALESCE(rr2.creep_fingerprint, '') ILIKE %[1]s
		)`, param))
	}

	query := fmt.Sprintf(`
		WITH candidate_pairs AS (
			SELECT rr1.review_id, rr1.session_id AS rating_1_session_id, rr2.session_id AS rating_2_session_id
			FROM professor.review_rating rr1
			JOIN professor.review_rating rr2
				ON rr1.review_id = rr2.review_id
				AND rr1.session_id < rr2.session_id
				AND rr1.ip_address = rr2.ip_address

			UNION

			SELECT rr1.review_id, rr1.session_id AS rating_1_session_id, rr2.session_id AS rating_2_session_id
			FROM professor.review_rating rr1
			JOIN professor.review_rating rr2
				ON rr1.review_id = rr2.review_id
				AND rr1.session_id < rr2.session_id
				AND rr1.thumbmark_fingerprint IS NOT NULL
				AND rr1.thumbmark_fingerprint <> ''
				AND rr1.thumbmark_fingerprint = rr2.thumbmark_fingerprint

			UNION

			SELECT rr1.review_id, rr1.session_id AS rating_1_session_id, rr2.session_id AS rating_2_session_id
			FROM professor.review_rating rr1
			JOIN professor.review_rating rr2
				ON rr1.review_id = rr2.review_id
				AND rr1.session_id < rr2.session_id
				AND rr1.creep_fingerprint IS NOT NULL
				AND rr1.creep_fingerprint <> ''
				AND rr1.creep_fingerprint = rr2.creep_fingerprint
		),
		candidates AS (
			SELECT
				r.id AS review_id,
				r.professor_email,
				COALESCE(p.name, r.professor_email) AS professor_name,
				r.content,
				r.score,
				r.positive,
				r.created_at AS review_created_at,
				r.visible,
				r.like_count,
				r.dislike_count,
				CASE WHEN rr1.value THEN 'like' ELSE 'dislike' END AS rating_1_value,
				rr1.session_id AS rating_1_session_id,
				rr1.user_id AS rating_1_user_id,
				rr1.ip_address::text AS rating_1_ip_address,
				s1.user_agent AS rating_1_user_agent,
				rr1.thumbmark_fingerprint AS rating_1_thumbmark_fingerprint,
				rr1.creep_fingerprint AS rating_1_creep_fingerprint,
				rr1.created_at AS rating_1_created_at,
				CASE WHEN rr2.value THEN 'like' ELSE 'dislike' END AS rating_2_value,
				rr2.session_id AS rating_2_session_id,
				rr2.user_id AS rating_2_user_id,
				rr2.ip_address::text AS rating_2_ip_address,
				s2.user_agent AS rating_2_user_agent,
				rr2.thumbmark_fingerprint AS rating_2_thumbmark_fingerprint,
				rr2.creep_fingerprint AS rating_2_creep_fingerprint,
				rr2.created_at AS rating_2_created_at,
				(rr1.ip_address = rr2.ip_address) AS same_ip,
				COALESCE(NULLIF(s1.user_agent, '') IS NOT NULL AND s1.user_agent = s2.user_agent, false) AS same_user_agent,
				COALESCE(NULLIF(rr1.thumbmark_fingerprint, '') IS NOT NULL AND rr1.thumbmark_fingerprint = rr2.thumbmark_fingerprint, false) AS same_thumbmark,
				COALESCE(NULLIF(rr1.creep_fingerprint, '') IS NOT NULL AND rr1.creep_fingerprint = rr2.creep_fingerprint, false) AS same_creep,
				(rr1.value = rr2.value) AS same_value,
				ABS(EXTRACT(EPOCH FROM (rr1.created_at - rr2.created_at)))::bigint AS created_delta_seconds
			FROM candidate_pairs cp
			JOIN professor.review_rating rr1
				ON rr1.review_id = cp.review_id
				AND rr1.session_id = cp.rating_1_session_id
			JOIN professor.review_rating rr2
				ON rr2.review_id = cp.review_id
				AND rr2.session_id = cp.rating_2_session_id
			JOIN professor.review r ON r.id = rr1.review_id
			LEFT JOIN professor.professor p ON p.email = r.professor_email
			LEFT JOIN account.session s1 ON s1.id = rr1.session_id
			LEFT JOIN account.session s2 ON s2.id = rr2.session_id
			WHERE %[8]s
		),
		scored AS (
			SELECT
				*,
				created_delta_seconds < %[1]d AS close_timing,
				(
					(CASE WHEN same_ip THEN %[2]d ELSE 0 END) +
					(CASE WHEN same_user_agent THEN %[3]d ELSE 0 END) +
					(CASE WHEN same_thumbmark THEN %[4]d ELSE 0 END) +
					(CASE WHEN same_creep THEN %[5]d ELSE 0 END) +
					(CASE WHEN same_value THEN %[6]d ELSE 0 END) +
					(CASE WHEN created_delta_seconds < %[1]d THEN %[7]d ELSE 0 END)
				) AS suspicion_score
			FROM candidates
		)
		SELECT
			review_id,
			professor_email,
			professor_name,
			content,
			score,
			positive,
			review_created_at,
			visible,
			like_count,
			dislike_count,
			rating_1_value,
			rating_1_session_id,
			rating_1_user_id,
			rating_1_ip_address,
			rating_1_user_agent,
			rating_1_thumbmark_fingerprint,
			rating_1_creep_fingerprint,
			rating_1_created_at,
			rating_2_value,
			rating_2_session_id,
			rating_2_user_id,
			rating_2_ip_address,
			rating_2_user_agent,
			rating_2_thumbmark_fingerprint,
			rating_2_creep_fingerprint,
			rating_2_created_at,
			suspicion_score,
			created_delta_seconds,
			same_ip,
			same_user_agent,
			same_thumbmark,
			same_creep,
			same_value,
			close_timing
		FROM scored
		WHERE suspicion_score >= $3
		ORDER BY suspicion_score DESC, created_delta_seconds ASC, GREATEST(rating_1_created_at, rating_2_created_at) DESC, review_id DESC, rating_1_session_id, rating_2_session_id
		LIMIT $1 OFFSET $2`,
		suspiciousReviewRatingCloseTimingSeconds,
		suspiciousReviewRatingSameIPWeight,
		suspiciousReviewRatingSameUserAgentWeight,
		suspiciousReviewRatingSameThumbmarkWeight,
		suspiciousReviewRatingSameCreepWeight,
		suspiciousReviewRatingSameValueWeight,
		suspiciousReviewRatingCloseTimingWeight,
		strings.Join(conditions, "\n\t\t\t\tAND "),
	)

	return query, args
}

func (db *AdminDB) ListSuspiciousReviewRatingPairs(ctx context.Context, opts ListSuspiciousReviewRatingPairOptions) ([]v1.AdminSuspiciousReviewRatingPair, error) {
	query, args := buildSuspiciousReviewRatingPairsQuery(opts)
	rows, err := db.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	pairs := make([]v1.AdminSuspiciousReviewRatingPair, 0)
	for rows.Next() {
		var pair v1.AdminSuspiciousReviewRatingPair
		if err := rows.Scan(
			&pair.Review.ID,
			&pair.Review.ProfessorEmail,
			&pair.Review.ProfessorName,
			&pair.Review.Text,
			&pair.Review.Score,
			&pair.Review.Positive,
			&pair.Review.CreatedAt,
			&pair.Review.Visible,
			&pair.Review.LikeCount,
			&pair.Review.DislikeCount,
			&pair.Rating1.Value,
			&pair.Rating1.SessionID,
			&pair.Rating1.UserID,
			&pair.Rating1.IPAddress,
			&pair.Rating1.UserAgent,
			&pair.Rating1.ThumbmarkFingerprint,
			&pair.Rating1.CreepFingerprint,
			&pair.Rating1.CreatedAt,
			&pair.Rating2.Value,
			&pair.Rating2.SessionID,
			&pair.Rating2.UserID,
			&pair.Rating2.IPAddress,
			&pair.Rating2.UserAgent,
			&pair.Rating2.ThumbmarkFingerprint,
			&pair.Rating2.CreepFingerprint,
			&pair.Rating2.CreatedAt,
			&pair.SuspicionScore,
			&pair.CreatedDeltaSeconds,
			&pair.SameIP,
			&pair.SameUserAgent,
			&pair.SameThumbmark,
			&pair.SameCreep,
			&pair.SameValue,
			&pair.CloseTiming,
		); err != nil {
			return nil, err
		}

		pair.Rating1.ReviewID = pair.Review.ID
		pair.Rating2.ReviewID = pair.Review.ID
		pairs = append(pairs, pair)
	}

	return pairs, rows.Err()
}
