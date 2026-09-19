package database

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
)

const (
	professorRequestMatchLimit   = 5
	professorRequestMatchesQuery = `
		SELECT
			pr.id,
			candidate.email,
			candidate.name,
			candidate.university,
			candidate.college,
			candidate.visible,
			candidate.match_type,
			candidate.name_similarity
		FROM professor.professor_request pr
		CROSS JOIN LATERAL (
			SELECT
				p.email,
				p.name,
				p.university,
				p.college,
				p.visible,
				CASE
					WHEN pr.professor_email IS NOT NULL AND lower(p.email) = lower(pr.professor_email) THEN 'exact_email'
					WHEN lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.professor_name), '\s+', ' ', 'g'))
					 AND lower(regexp_replace(btrim(p.university), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.university), '\s+', ' ', 'g')) THEN 'same_university_name'
					ELSE 'similar_name'
				END AS match_type,
				CASE
					WHEN pr.professor_email IS NOT NULL AND lower(p.email) = lower(pr.professor_email) THEN 0
					WHEN lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.professor_name), '\s+', ' ', 'g'))
					 AND lower(regexp_replace(btrim(p.university), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.university), '\s+', ' ', 'g')) THEN 1
					WHEN similarity(lower(p.name), lower(pr.professor_name)) >= 0.85 THEN 2
					WHEN lower(regexp_replace(btrim(p.university), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.university), '\s+', ' ', 'g')) THEN 3
					ELSE 4
				END AS match_priority,
				similarity(lower(p.name), lower(pr.professor_name))::double precision AS name_similarity
			FROM professor.professor p
			WHERE (
				pr.professor_email IS NOT NULL
				AND lower(p.email) = lower(pr.professor_email)
			) OR (
				lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.professor_name), '\s+', ' ', 'g'))
				AND lower(regexp_replace(btrim(p.university), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(pr.university), '\s+', ' ', 'g'))
			) OR similarity(lower(p.name), lower(pr.professor_name)) >= 0.35
			ORDER BY
				match_priority,
				name_similarity DESC,
				p.email
			LIMIT $2
		) candidate
		WHERE pr.id = ANY($1::bigint[])
		ORDER BY pr.id, candidate.match_priority, candidate.name_similarity DESC, candidate.email`
)

var (
	ErrProfessorRequestAlreadyDecided  = errors.New("professor request has already been decided")
	ErrProfessorAlreadyExists          = errors.New("professor already exists")
	ErrResolvedProfessorNotFound       = errors.New("resolved professor not found")
	ErrInvalidProfessorRequestDecision = errors.New("invalid professor request decision")
)

type ListProfessorRequestOptions struct {
	Limit     int
	Offset    int
	Status    string
	Duplicate string
	Search    string
}

type ProfessorRequestListResult struct {
	Requests        []v1.AdminProfessorRequest
	Total           int64
	GroupTotal      int64
	StatusCounts    v1.AdminProfessorRequestStatusCounts
	DuplicateCounts v1.AdminProfessorRequestDuplicateCounts
}

type professorRequestIndexRow struct {
	ID            int64
	Status        string
	CreatedAt     time.Time
	EmailKey      *string
	NameKey       string
	UniversityKey string
	SearchMatch   bool
}

type professorRequestMetadata struct {
	GroupID         int64
	GroupSize       int
	PendingCount    int
	LikelyDuplicate bool
}

type professorRequestListPage struct {
	IDs             []int64
	Total           int64
	GroupTotal      int64
	StatusCounts    v1.AdminProfessorRequestStatusCounts
	DuplicateCounts v1.AdminProfessorRequestDuplicateCounts
}

type professorRequestPageGroup struct {
	ID              int64
	LatestCreatedAt time.Time
	LatestRequestID int64
	Members         []professorRequestIndexRow
}

type professorRequestIdentityKey struct {
	Name       string
	University string
}

type professorRequestDisjointSet struct {
	parent map[int64]int64
	size   map[int64]int
}

type ProfessorRequestDecision struct {
	RequestID              int64
	Decision               string
	ActorUserID            *int64
	ProfessorName          *string
	ProfessorEmail         *string
	University             *string
	College                *string
	ResolvedProfessorEmail *string
	ReasonCode             *string
	Note                   *string
}

type ProfessorRequestDecisionResult struct {
	Request *v1.AdminProfessorRequest
	Action  string
}

func (db *AdminDB) ListProfessorRequests(ctx context.Context, opts ListProfessorRequestOptions) (*ProfessorRequestListResult, error) {
	opts = normalizeProfessorRequestListOptions(opts)
	indexRows, err := db.loadProfessorRequestIndex(ctx, opts.Search)
	if err != nil {
		return nil, err
	}
	metadata := buildProfessorRequestMetadata(indexRows)

	matchCandidateIDs := professorRequestExistingMatchCandidateIDs(indexRows, metadata, opts)
	existingMatches, err := db.loadProfessorRequestExistingMatches(ctx, matchCandidateIDs)
	if err != nil {
		return nil, err
	}
	markProfessorRequestExistingMatches(metadata, existingMatches)
	page := buildProfessorRequestListPage(indexRows, metadata, opts)

	requests, err := db.loadProfessorRequests(ctx, page.IDs, false, metadata)
	if err != nil {
		return nil, err
	}

	return &ProfessorRequestListResult{
		Requests:        requests,
		Total:           page.Total,
		GroupTotal:      page.GroupTotal,
		StatusCounts:    page.StatusCounts,
		DuplicateCounts: page.DuplicateCounts,
	}, nil
}

func (db *AdminDB) GetProfessorRequest(ctx context.Context, requestID int64) (*v1.AdminProfessorRequest, error) {
	requestMetadata, found, err := db.loadProfessorRequestMetadata(ctx, requestID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, nil
	}
	metadata := map[int64]professorRequestMetadata{requestID: requestMetadata}

	existingMatches := map[int64]struct{}{}
	if requestMetadata.GroupSize == 1 {
		existingMatches, err = db.loadProfessorRequestExistingMatches(ctx, []int64{requestID})
		if err != nil {
			return nil, err
		}
	}
	markProfessorRequestExistingMatches(metadata, existingMatches)

	requests, err := db.loadProfessorRequests(ctx, []int64{requestID}, true, metadata)
	if err != nil {
		return nil, err
	}
	if len(requests) == 0 {
		return nil, nil
	}
	return &requests[0], nil
}

func normalizeProfessorRequestListOptions(opts ListProfessorRequestOptions) ListProfessorRequestOptions {
	if opts.Limit <= 0 {
		opts.Limit = 50
	}
	if opts.Offset < 0 {
		opts.Offset = 0
	}
	if opts.Status == "" {
		opts.Status = "pending"
	}
	if opts.Duplicate != "likely" && opts.Duplicate != "not_likely" {
		opts.Duplicate = "all"
	}
	opts.Search = strings.TrimSpace(opts.Search)
	return opts
}

func buildProfessorRequestIndexQuery(search string) (string, []any) {
	args := []any{}
	searchCondition := "TRUE"
	if search = strings.TrimSpace(search); search != "" {
		args = append(args, "%"+search+"%")
		searchCondition = professorRequestSearchCondition("pr", len(args))
	}

	query := fmt.Sprintf(`
		SELECT
			pr.id,
			pr.status,
			pr.created_at,
			CASE WHEN pr.professor_email IS NULL THEN NULL ELSE lower(pr.professor_email) END AS email_key,
			lower(regexp_replace(btrim(pr.professor_name), '\s+', ' ', 'g')) AS name_key,
			lower(regexp_replace(btrim(pr.university), '\s+', ' ', 'g')) AS university_key,
			%s AS search_match
		FROM professor.professor_request pr`, searchCondition)

	return query, args
}

func (db *AdminDB) loadProfessorRequestIndex(ctx context.Context, search string) ([]professorRequestIndexRow, error) {
	query, args := buildProfessorRequestIndexQuery(search)
	rows, err := db.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	indexRows := make([]professorRequestIndexRow, 0)
	for rows.Next() {
		var row professorRequestIndexRow
		if err := rows.Scan(
			&row.ID,
			&row.Status,
			&row.CreatedAt,
			&row.EmailKey,
			&row.NameKey,
			&row.UniversityKey,
			&row.SearchMatch,
		); err != nil {
			return nil, err
		}
		indexRows = append(indexRows, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return indexRows, nil
}

func (db *AdminDB) loadProfessorRequestMetadata(
	ctx context.Context,
	requestID int64,
) (professorRequestMetadata, bool, error) {
	// Detail views only need the selected request's component. Seeding recursion
	// with one request avoids the all-roots reachability expansion used by lists.
	var (
		groupID      *int64
		groupSize    int
		pendingCount int
	)
	err := db.db.Pool.QueryRow(ctx, `
		WITH RECURSIVE component AS (
			SELECT
				pr.id,
				pr.status,
				CASE WHEN pr.professor_email IS NULL THEN NULL ELSE lower(pr.professor_email) END AS email_key,
				lower(regexp_replace(btrim(pr.professor_name), '\s+', ' ', 'g')) AS name_key,
				lower(regexp_replace(btrim(pr.university), '\s+', ' ', 'g')) AS university_key
			FROM professor.professor_request pr
			WHERE pr.id = $1

			UNION

			SELECT
				neighbor.id,
				neighbor.status,
				CASE WHEN neighbor.professor_email IS NULL THEN NULL ELSE lower(neighbor.professor_email) END,
				lower(regexp_replace(btrim(neighbor.professor_name), '\s+', ' ', 'g')),
				lower(regexp_replace(btrim(neighbor.university), '\s+', ' ', 'g'))
			FROM component current
			JOIN professor.professor_request neighbor ON (
				current.email_key IS NOT NULL
				AND neighbor.professor_email IS NOT NULL
				AND lower(neighbor.professor_email) = current.email_key
			) OR (
				lower(regexp_replace(btrim(neighbor.professor_name), '\s+', ' ', 'g')) = current.name_key
				AND lower(regexp_replace(btrim(neighbor.university), '\s+', ' ', 'g')) = current.university_key
			)
		)
		SELECT
			min(id),
			count(*)::int,
			count(*) FILTER (WHERE status = 'pending')::int
		FROM component`, requestID).Scan(&groupID, &groupSize, &pendingCount)
	if err != nil {
		return professorRequestMetadata{}, false, err
	}
	if groupID == nil || groupSize == 0 {
		return professorRequestMetadata{}, false, nil
	}
	return professorRequestMetadata{
		GroupID:         *groupID,
		GroupSize:       groupSize,
		PendingCount:    pendingCount,
		LikelyDuplicate: groupSize > 1,
	}, true, nil
}

func buildProfessorRequestMetadata(rows []professorRequestIndexRow) map[int64]professorRequestMetadata {
	groups := professorRequestDisjointSet{
		parent: make(map[int64]int64, len(rows)),
		size:   make(map[int64]int, len(rows)),
	}
	emailOwners := make(map[string]int64)
	identityOwners := make(map[professorRequestIdentityKey]int64)

	for _, row := range rows {
		groups.add(row.ID)
		if row.EmailKey != nil {
			if ownerID, ok := emailOwners[*row.EmailKey]; ok {
				groups.union(row.ID, ownerID)
			} else {
				emailOwners[*row.EmailKey] = row.ID
			}
		}

		identity := professorRequestIdentityKey{Name: row.NameKey, University: row.UniversityKey}
		if ownerID, ok := identityOwners[identity]; ok {
			groups.union(row.ID, ownerID)
		} else {
			identityOwners[identity] = row.ID
		}
	}

	pendingCounts := make(map[int64]int)
	for _, row := range rows {
		if row.Status == "pending" {
			pendingCounts[groups.find(row.ID)]++
		}
	}

	metadata := make(map[int64]professorRequestMetadata, len(rows))
	for _, row := range rows {
		groupID := groups.find(row.ID)
		groupSize := groups.size[groupID]
		metadata[row.ID] = professorRequestMetadata{
			GroupID:         groupID,
			GroupSize:       groupSize,
			PendingCount:    pendingCounts[groupID],
			LikelyDuplicate: groupSize > 1,
		}
	}
	return metadata
}

func (groups *professorRequestDisjointSet) add(id int64) {
	groups.parent[id] = id
	groups.size[id] = 1
}

func (groups *professorRequestDisjointSet) find(id int64) int64 {
	root := id
	for groups.parent[root] != root {
		root = groups.parent[root]
	}
	for groups.parent[id] != id {
		parent := groups.parent[id]
		groups.parent[id] = root
		id = parent
	}
	return root
}

func (groups *professorRequestDisjointSet) union(leftID, rightID int64) {
	leftRoot := groups.find(leftID)
	rightRoot := groups.find(rightID)
	if leftRoot == rightRoot {
		return
	}
	if leftRoot > rightRoot {
		leftRoot, rightRoot = rightRoot, leftRoot
	}
	groups.parent[rightRoot] = leftRoot
	groups.size[leftRoot] += groups.size[rightRoot]
	delete(groups.size, rightRoot)
}

func professorRequestExistingMatchCandidateIDs(
	rows []professorRequestIndexRow,
	metadata map[int64]professorRequestMetadata,
	opts ListProfessorRequestOptions,
) []int64 {
	opts = normalizeProfessorRequestListOptions(opts)
	ids := make([]int64, 0)
	for _, row := range rows {
		requestMetadata := metadata[row.ID]
		if !row.SearchMatch || requestMetadata.GroupSize > 1 {
			continue
		}
		// With no duplicate filter, existing-professor matches only affect the
		// duplicate counts for the selected status. A duplicate filter also makes
		// them necessary for status counts across every status.
		if opts.Duplicate != "all" || professorRequestMatchesStatus(row.Status, opts.Status) {
			ids = append(ids, row.ID)
		}
	}
	return ids
}

func (db *AdminDB) loadProfessorRequestExistingMatches(ctx context.Context, ids []int64) (map[int64]struct{}, error) {
	matches := make(map[int64]struct{})
	if len(ids) == 0 {
		return matches, nil
	}

	rows, err := db.db.Pool.Query(ctx, fmt.Sprintf(`
		SELECT pr.id
		FROM professor.professor_request pr
		WHERE pr.id = ANY($1::bigint[])
		  AND %s
		ORDER BY pr.id`, professorRequestLikelyDuplicateCondition("pr")), ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		matches[id] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return matches, nil
}

func markProfessorRequestExistingMatches(metadata map[int64]professorRequestMetadata, matches map[int64]struct{}) {
	for id, requestMetadata := range metadata {
		_, hasExistingMatch := matches[id]
		requestMetadata.LikelyDuplicate = requestMetadata.GroupSize > 1 || hasExistingMatch
		metadata[id] = requestMetadata
	}
}

func buildProfessorRequestListPage(
	rows []professorRequestIndexRow,
	metadata map[int64]professorRequestMetadata,
	opts ListProfessorRequestOptions,
) professorRequestListPage {
	opts = normalizeProfessorRequestListOptions(opts)
	page := professorRequestListPage{IDs: []int64{}}
	groupsByID := make(map[int64]*professorRequestPageGroup)

	for _, row := range rows {
		if !row.SearchMatch {
			continue
		}
		requestMetadata, ok := metadata[row.ID]
		if !ok {
			pendingCount := 0
			if row.Status == "pending" {
				pendingCount = 1
			}
			requestMetadata = professorRequestMetadata{GroupID: row.ID, GroupSize: 1, PendingCount: pendingCount}
		}

		matchesStatus := professorRequestMatchesStatus(row.Status, opts.Status)
		matchesDuplicate := professorRequestMatchesDuplicate(requestMetadata.LikelyDuplicate, opts.Duplicate)
		if matchesDuplicate {
			incrementProfessorRequestStatusCount(&page.StatusCounts, row.Status)
		}
		if matchesStatus {
			page.DuplicateCounts.All++
			if requestMetadata.LikelyDuplicate {
				page.DuplicateCounts.Likely++
			} else {
				page.DuplicateCounts.NotLikely++
			}
		}
		if !matchesStatus || !matchesDuplicate {
			continue
		}

		page.Total++
		group := groupsByID[requestMetadata.GroupID]
		if group == nil {
			group = &professorRequestPageGroup{
				ID:              requestMetadata.GroupID,
				LatestCreatedAt: row.CreatedAt,
				LatestRequestID: row.ID,
			}
			groupsByID[requestMetadata.GroupID] = group
		} else if row.CreatedAt.After(group.LatestCreatedAt) ||
			(row.CreatedAt.Equal(group.LatestCreatedAt) && row.ID > group.LatestRequestID) {
			group.LatestCreatedAt = row.CreatedAt
			group.LatestRequestID = row.ID
		}
		group.Members = append(group.Members, row)
	}

	groups := make([]*professorRequestPageGroup, 0, len(groupsByID))
	for _, group := range groupsByID {
		sort.Slice(group.Members, func(i, j int) bool {
			left := group.Members[i]
			right := group.Members[j]
			leftPending := left.Status == "pending"
			rightPending := right.Status == "pending"
			if leftPending != rightPending {
				return leftPending
			}
			if !left.CreatedAt.Equal(right.CreatedAt) {
				return left.CreatedAt.After(right.CreatedAt)
			}
			return left.ID > right.ID
		})
		groups = append(groups, group)
	}
	page.GroupTotal = int64(len(groups))
	sort.Slice(groups, func(i, j int) bool {
		left := groups[i]
		right := groups[j]
		if !left.LatestCreatedAt.Equal(right.LatestCreatedAt) {
			return left.LatestCreatedAt.After(right.LatestCreatedAt)
		}
		if left.LatestRequestID != right.LatestRequestID {
			return left.LatestRequestID > right.LatestRequestID
		}
		return left.ID < right.ID
	})

	start := opts.Offset
	if start >= len(groups) {
		return page
	}
	end := start + opts.Limit
	if end > len(groups) {
		end = len(groups)
	}
	for _, group := range groups[start:end] {
		for _, member := range group.Members {
			page.IDs = append(page.IDs, member.ID)
		}
	}
	return page
}

func incrementProfessorRequestStatusCount(counts *v1.AdminProfessorRequestStatusCounts, status string) {
	counts.All++
	switch status {
	case "pending":
		counts.Pending++
	case "approved":
		counts.Approved++
	case "rejected":
		counts.Rejected++
	case "dismissed":
		counts.Dismissed++
	}
}

func professorRequestMatchesStatus(status, selectedStatus string) bool {
	return selectedStatus == "all" || status == selectedStatus
}

func professorRequestMatchesDuplicate(likelyDuplicate bool, selectedDuplicate string) bool {
	switch selectedDuplicate {
	case "likely":
		return likelyDuplicate
	case "not_likely":
		return !likelyDuplicate
	default:
		return true
	}
}

func professorRequestSearchCondition(alias string, argument int) string {
	return fmt.Sprintf(`(
		%s.id::text ILIKE $%[2]d
		OR (%[1]s.professor_name || ' ' || COALESCE(%[1]s.professor_email, '') || ' ' || %[1]s.university || ' ' || COALESCE(%[1]s.college, '')) ILIKE $%[2]d
	)`, alias, argument)
}

func professorRequestLikelyDuplicateCondition(alias string) string {
	return fmt.Sprintf(`EXISTS (
		SELECT 1
		FROM professor.professor candidate
		WHERE (
			%[1]s.professor_email IS NOT NULL
			AND lower(candidate.email) = lower(%[1]s.professor_email)
		) OR (
			lower(regexp_replace(btrim(candidate.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(%[1]s.professor_name), '\s+', ' ', 'g'))
			AND lower(regexp_replace(btrim(candidate.university), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(%[1]s.university), '\s+', ' ', 'g'))
		) OR similarity(lower(candidate.name), lower(%[1]s.professor_name)) >= 0.85
	)`, alias)
}

func (db *AdminDB) loadProfessorRequests(
	ctx context.Context,
	ids []int64,
	includeModerationContext bool,
	metadata map[int64]professorRequestMetadata,
) ([]v1.AdminProfessorRequest, error) {
	if len(ids) == 0 {
		return []v1.AdminProfessorRequest{}, nil
	}

	rows, err := db.db.Pool.Query(ctx, `
		SELECT
			pr.id,
			pr.professor_name,
			pr.professor_email,
			pr.university,
			pr.college,
			pr.status,
			pr.session_id,
			pr.user_id,
			pr.created_at,
			pr.reviewed_at,
			pr.reviewer_user_id,
			pr.moderation_reason_code,
			pr.moderation_note,
			pr.resolved_professor_email
		FROM professor.professor_request pr
		WHERE pr.id = ANY($1::bigint[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requestsByID := make(map[int64]*v1.AdminProfessorRequest, len(ids))
	for rows.Next() {
		var request v1.AdminProfessorRequest
		if err := rows.Scan(
			&request.ID,
			&request.ProfessorName,
			&request.ProfessorEmail,
			&request.University,
			&request.College,
			&request.Status,
			&request.SessionID,
			&request.UserID,
			&request.CreatedAt,
			&request.ReviewedAt,
			&request.ReviewerUserID,
			&request.ModerationReasonCode,
			&request.ModerationNote,
			&request.ResolvedProfessorEmail,
		); err != nil {
			return nil, err
		}
		requestMetadata, ok := metadata[request.ID]
		if !ok {
			pendingCount := 0
			if request.Status == "pending" {
				pendingCount = 1
			}
			requestMetadata = professorRequestMetadata{GroupID: request.ID, GroupSize: 1, PendingCount: pendingCount}
		}
		request.RelatedGroupID = requestMetadata.GroupID
		request.RelatedRequestCount = requestMetadata.GroupSize - 1
		request.RelatedPendingRequestCount = requestMetadata.PendingCount
		request.LikelyDuplicate = requestMetadata.LikelyDuplicate
		request.Matches = []v1.AdminProfessorMatch{}
		request.Signals = []v1.AdminModerationSignal{}
		request.ActionHistory = []v1.AdminModerationAction{}
		requestsByID[request.ID] = &request
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := db.attachProfessorRequestMatches(ctx, ids, requestsByID); err != nil {
		return nil, err
	}
	if includeModerationContext {
		if err := db.attachProfessorRequestSignals(ctx, ids, requestsByID); err != nil {
			return nil, err
		}
		if err := db.attachProfessorRequestActions(ctx, ids, requestsByID); err != nil {
			return nil, err
		}
	}

	requests := make([]v1.AdminProfessorRequest, 0, len(ids))
	for _, id := range ids {
		if request, ok := requestsByID[id]; ok {
			requests = append(requests, *request)
		}
	}
	return requests, nil
}

func (db *AdminDB) attachProfessorRequestMatches(ctx context.Context, ids []int64, requestsByID map[int64]*v1.AdminProfessorRequest) error {
	rows, err := db.db.Pool.Query(ctx, professorRequestMatchesQuery, ids, professorRequestMatchLimit)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			requestID int64
			match     v1.AdminProfessorMatch
		)
		if err := rows.Scan(
			&requestID,
			&match.Email,
			&match.Name,
			&match.University,
			&match.College,
			&match.Visible,
			&match.MatchType,
			&match.NameSimilarity,
		); err != nil {
			return err
		}
		if request, ok := requestsByID[requestID]; ok {
			request.Matches = append(request.Matches, match)
		}
	}

	return rows.Err()
}

func (db *AdminDB) attachProfessorRequestSignals(ctx context.Context, ids []int64, requestsByID map[int64]*v1.AdminProfessorRequest) error {
	targetIDs := professorRequestTargetIDs(ids)
	rows, err := db.db.Pool.Query(ctx, `
		SELECT id, target_type, target_id, source, attribute, score, threshold, severity, payload, created_at
		FROM moderation.signal
		WHERE target_type = 'professor_request'
		  AND target_id = ANY($1::text[])
		ORDER BY created_at DESC`, targetIDs)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			signal  v1.AdminModerationSignal
			payload []byte
		)
		if err := rows.Scan(
			&signal.ID,
			&signal.TargetType,
			&signal.TargetID,
			&signal.Source,
			&signal.Attribute,
			&signal.Score,
			&signal.Threshold,
			&signal.Severity,
			&payload,
			&signal.CreatedAt,
		); err != nil {
			return err
		}
		signal.Payload = rawJSONPtr(payload)
		requestID, err := strconv.ParseInt(signal.TargetID, 10, 64)
		if err != nil {
			continue
		}
		if request, ok := requestsByID[requestID]; ok {
			request.Signals = append(request.Signals, signal)
		}
	}
	return rows.Err()
}

func (db *AdminDB) attachProfessorRequestActions(ctx context.Context, ids []int64, requestsByID map[int64]*v1.AdminProfessorRequest) error {
	targetIDs := professorRequestTargetIDs(ids)
	rows, err := db.db.Pool.Query(ctx, `
		SELECT id, actor_user_id, target_type, target_id, action, reason_code, note, previous_state, next_state, created_at
		FROM moderation.action_log
		WHERE target_type = 'professor_request'
		  AND target_id = ANY($1::text[])
		ORDER BY created_at DESC`, targetIDs)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			action        v1.AdminModerationAction
			previousState []byte
			nextState     []byte
		)
		if err := rows.Scan(
			&action.ID,
			&action.ActorUserID,
			&action.TargetType,
			&action.TargetID,
			&action.Action,
			&action.ReasonCode,
			&action.Note,
			&previousState,
			&nextState,
			&action.CreatedAt,
		); err != nil {
			return err
		}
		action.PreviousState = rawJSONPtr(previousState)
		action.NextState = rawJSONPtr(nextState)
		requestID, err := strconv.ParseInt(action.TargetID, 10, 64)
		if err != nil {
			continue
		}
		if request, ok := requestsByID[requestID]; ok {
			request.ActionHistory = append(request.ActionHistory, action)
		}
	}
	return rows.Err()
}

func professorRequestTargetIDs(ids []int64) []string {
	targetIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		targetIDs = append(targetIDs, strconv.FormatInt(id, 10))
	}
	return targetIDs
}

func (db *AdminDB) DecideProfessorRequest(ctx context.Context, decision ProfessorRequestDecision) (*ProfessorRequestDecisionResult, error) {
	tx, err := db.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	current, err := getProfessorRequestForUpdate(ctx, tx, decision.RequestID)
	if err != nil {
		return nil, err
	}
	if current.Status != "pending" {
		return nil, ErrProfessorRequestAlreadyDecided
	}

	name := current.ProfessorName
	if decision.ProfessorName != nil {
		name = *decision.ProfessorName
	}
	email := current.ProfessorEmail
	if decision.ProfessorEmail != nil {
		email = copyStringPointer(decision.ProfessorEmail)
	}
	university := current.University
	if decision.University != nil {
		university = *decision.University
	}
	college := current.College
	if decision.College != nil {
		college = copyStringPointer(decision.College)
	}

	status, action, resolvedEmail, err := resolveProfessorRequestDecision(
		ctx,
		tx,
		decision,
		name,
		email,
		university,
		college,
	)
	if err != nil {
		return nil, err
	}

	previousState, err := json.Marshal(professorRequestAuditState(*current))
	if err != nil {
		return nil, err
	}

	updated, err := updateProfessorRequestDecision(
		ctx,
		tx,
		decision,
		name,
		email,
		university,
		college,
		status,
		resolvedEmail,
	)
	if err != nil {
		return nil, err
	}

	nextState, err := json.Marshal(professorRequestAuditState(*updated))
	if err != nil {
		return nil, err
	}
	if err := insertActionLog(ctx, tx, actionLogInput{
		ActorUserID:   decision.ActorUserID,
		TargetType:    "professor_request",
		TargetID:      strconv.FormatInt(decision.RequestID, 10),
		Action:        action,
		ReasonCode:    decision.ReasonCode,
		Note:          decision.Note,
		PreviousState: previousState,
		NextState:     nextState,
	}); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	request, err := db.GetProfessorRequest(ctx, decision.RequestID)
	if err != nil {
		return nil, err
	}
	if request == nil {
		return nil, ErrNotFound
	}
	return &ProfessorRequestDecisionResult{Request: request, Action: action}, nil
}

type professorRequestTx interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

func getProfessorRequestForUpdate(ctx context.Context, tx professorRequestTx, requestID int64) (*v1.AdminProfessorRequestSummary, error) {
	var request v1.AdminProfessorRequestSummary
	err := tx.QueryRow(ctx, `
		SELECT
			id,
			professor_name,
			professor_email,
			university,
			college,
			status,
			session_id,
			user_id,
			created_at,
			reviewed_at,
			reviewer_user_id,
			moderation_reason_code,
			moderation_note,
			resolved_professor_email
		FROM professor.professor_request
		WHERE id = $1
		FOR UPDATE`, requestID).Scan(
		&request.ID,
		&request.ProfessorName,
		&request.ProfessorEmail,
		&request.University,
		&request.College,
		&request.Status,
		&request.SessionID,
		&request.UserID,
		&request.CreatedAt,
		&request.ReviewedAt,
		&request.ReviewerUserID,
		&request.ModerationReasonCode,
		&request.ModerationNote,
		&request.ResolvedProfessorEmail,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &request, nil
}

func resolveProfessorRequestDecision(
	ctx context.Context,
	tx professorRequestTx,
	decision ProfessorRequestDecision,
	name string,
	email *string,
	university string,
	college *string,
) (string, string, *string, error) {
	switch decision.Decision {
	case "approve":
		if strings.TrimSpace(name) == "" || email == nil || strings.TrimSpace(*email) == "" || strings.TrimSpace(university) == "" || college == nil || strings.TrimSpace(*college) == "" {
			return "", "", nil, ErrInvalidProfessorRequestDecision
		}
		var existingEmail string
		err := tx.QueryRow(ctx, `
			SELECT email
			FROM professor.professor
			WHERE lower(email) = lower($1)
			ORDER BY email
			LIMIT 1`, *email).Scan(&existingEmail)
		if err == nil {
			return "", "", nil, ErrProfessorAlreadyExists
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return "", "", nil, err
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO professor.professor (
				email,
				name,
				college,
				university,
				moderated_at,
				moderator_user_id,
				moderation_reason_code,
				moderation_note
			)
			VALUES ($1, $2, $3, $4, now(), $5, $6, $7)`,
			*email,
			name,
			*college,
			university,
			decision.ActorUserID,
			decision.ReasonCode,
			decision.Note,
		)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				return "", "", nil, ErrProfessorAlreadyExists
			}
			return "", "", nil, err
		}
		return "approved", "approve", copyStringPointer(email), nil

	case "reject":
		return "rejected", "reject", nil, nil

	case "dismiss":
		return "dismissed", "dismiss", nil, nil

	case "mark_duplicate":
		if decision.ResolvedProfessorEmail == nil || strings.TrimSpace(*decision.ResolvedProfessorEmail) == "" {
			return "", "", nil, ErrInvalidProfessorRequestDecision
		}
		var canonicalEmail string
		err := tx.QueryRow(ctx, `
			SELECT email
			FROM professor.professor
			WHERE lower(email) = lower($1)
			ORDER BY email
			LIMIT 1`, *decision.ResolvedProfessorEmail).Scan(&canonicalEmail)
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", nil, ErrResolvedProfessorNotFound
		}
		if err != nil {
			return "", "", nil, err
		}
		return "dismissed", "mark_duplicate", &canonicalEmail, nil
	default:
		return "", "", nil, ErrInvalidProfessorRequestDecision
	}
}

func updateProfessorRequestDecision(
	ctx context.Context,
	tx professorRequestTx,
	decision ProfessorRequestDecision,
	name string,
	email *string,
	university string,
	college *string,
	status string,
	resolvedEmail *string,
) (*v1.AdminProfessorRequestSummary, error) {
	var request v1.AdminProfessorRequestSummary
	err := tx.QueryRow(ctx, `
		UPDATE professor.professor_request
		SET
			professor_name = $2,
			professor_email = $3,
			university = $4,
			college = $5,
			status = $6,
			reviewed_at = now(),
			reviewer_user_id = $7,
			moderation_reason_code = $8,
			moderation_note = $9,
			resolved_professor_email = $10
		WHERE id = $1
		RETURNING
			id,
			professor_name,
			professor_email,
			university,
			college,
			status,
			session_id,
			user_id,
			created_at,
			reviewed_at,
			reviewer_user_id,
			moderation_reason_code,
			moderation_note,
			resolved_professor_email`,
		decision.RequestID,
		name,
		email,
		university,
		college,
		status,
		decision.ActorUserID,
		decision.ReasonCode,
		decision.Note,
		resolvedEmail,
	).Scan(
		&request.ID,
		&request.ProfessorName,
		&request.ProfessorEmail,
		&request.University,
		&request.College,
		&request.Status,
		&request.SessionID,
		&request.UserID,
		&request.CreatedAt,
		&request.ReviewedAt,
		&request.ReviewerUserID,
		&request.ModerationReasonCode,
		&request.ModerationNote,
		&request.ResolvedProfessorEmail,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &request, nil
}

func professorRequestAuditState(request v1.AdminProfessorRequestSummary) map[string]any {
	return map[string]any{
		"professor_name":           request.ProfessorName,
		"professor_email":          request.ProfessorEmail,
		"university":               request.University,
		"college":                  request.College,
		"status":                   request.Status,
		"reviewed_at":              request.ReviewedAt,
		"reviewer_user_id":         request.ReviewerUserID,
		"moderation_reason_code":   request.ModerationReasonCode,
		"moderation_note":          request.ModerationNote,
		"resolved_professor_email": request.ResolvedProfessorEmail,
	}
}

func copyStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}
