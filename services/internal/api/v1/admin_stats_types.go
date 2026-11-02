package v1

import "time"

// AdminStatsCounts holds activity counters for one time bucket or one whole period.
type AdminStatsCounts struct {
	Reviews            int64 `json:"reviews"`
	VerifiedReviews    int64 `json:"verified_reviews"`
	PositiveReviews    int64 `json:"positive_reviews"`
	HiddenReviews      int64 `json:"hidden_reviews"`
	DeletedReviews     int64 `json:"deleted_reviews"`
	ReviewScoreSum     int64 `json:"review_score_sum"`
	Replies            int64 `json:"replies"`
	Ratings            int64 `json:"ratings"`
	HelpfulRatings     int64 `json:"helpful_ratings"`
	CourseFiles        int64 `json:"course_files"`
	ProfessorRequests  int64 `json:"professor_requests"`
	Signups            int64 `json:"signups"`
	Sessions           int64 `json:"sessions"`
	Reports            int64 `json:"reports"`
	ReportsResolved    int64 `json:"reports_resolved"`
	ModerationActions  int64 `json:"moderation_actions"`
	ActiveContributors int64 `json:"active_contributors"`
	ProfessorViews     int64 `json:"professor_views"`
	CourseViews        int64 `json:"course_views"`
	FileDownloads      int64 `json:"file_downloads"`
}

type AdminStatsPoint struct {
	Start string `json:"start"`
	AdminStatsCounts
}

type AdminStatsRange struct {
	Key      string    `json:"key"`
	Bucket   string    `json:"bucket"`
	From     time.Time `json:"from"`
	To       time.Time `json:"to"`
	Timezone string    `json:"timezone"`
}

// AdminStatsTotals are all-time figures. Views and downloads are running
// counters, so they have no history.
type AdminStatsTotals struct {
	Reviews        int64 `json:"reviews"`
	Professors     int64 `json:"professors"`
	Courses        int64 `json:"courses"`
	CourseFiles    int64 `json:"course_files"`
	Ratings        int64 `json:"ratings"`
	Users          int64 `json:"users"`
	ProfessorViews int64 `json:"professor_views"`
	CourseViews    int64 `json:"course_views"`
	FileDownloads  int64 `json:"file_downloads"`
}

type AdminStatsBacklog struct {
	UnreviewedReviews        int64 `json:"unreviewed_reviews"`
	UnreviewedRecentReviews  int64 `json:"unreviewed_recent_reviews"`
	UnreviewedReplies        int64 `json:"unreviewed_replies"`
	UnreviewedCourseFiles    int64 `json:"unreviewed_course_files"`
	OpenReports              int64 `json:"open_reports"`
	PendingProfessorRequests int64 `json:"pending_professor_requests"`
}

// AdminStatsTurnaround is the median hours from submission to a moderation
// decision, for items decided inside the selected range.
type AdminStatsTurnaround struct {
	ReviewsHours           *float64 `json:"reviews_hours"`
	CourseFilesHours       *float64 `json:"course_files_hours"`
	ReportsHours           *float64 `json:"reports_hours"`
	ProfessorRequestsHours *float64 `json:"professor_requests_hours"`
}

type AdminStatsCount struct {
	Key   string `json:"key"`
	Count int64  `json:"count"`
}

type AdminStatsProfessor struct {
	Email      string `json:"email"`
	Name       string `json:"name"`
	University string `json:"university"`
	Reviews    int64  `json:"reviews"`
}

type AdminStatsResponse struct {
	Range               AdminStatsRange       `json:"range"`
	Series              []AdminStatsPoint     `json:"series"`
	Current             AdminStatsCounts      `json:"current"`
	Previous            *AdminStatsCounts     `json:"previous,omitempty"`
	Totals              AdminStatsTotals      `json:"totals"`
	Backlog             AdminStatsBacklog     `json:"backlog"`
	Turnaround          AdminStatsTurnaround  `json:"turnaround"`
	ModerationActions   []AdminStatsCount     `json:"moderation_actions"`
	ReviewsByUniversity []AdminStatsCount     `json:"reviews_by_university"`
	TopProfessors       []AdminStatsProfessor `json:"top_professors"`
}
