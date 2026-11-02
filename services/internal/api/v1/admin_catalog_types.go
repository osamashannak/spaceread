package v1

import "time"

type AdminCatalogProfessor struct {
	Email              string     `json:"email"`
	Name               string     `json:"name"`
	College            string     `json:"college"`
	University         string     `json:"university"`
	Visible            bool       `json:"visible"`
	Aliases            []string   `json:"aliases"`
	Views              int64      `json:"views"`
	ReviewCount        int64      `json:"review_count"`
	VisibleReviewCount int64      `json:"visible_review_count"`
	CourseCount        int64      `json:"course_count"`
	ModeratedAt        *time.Time `json:"moderated_at,omitempty"`
}

type AdminCatalogCourseRef struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
}

type AdminCatalogProfessorDetail struct {
	AdminCatalogProfessor
	Courses       []AdminCatalogCourseRef `json:"courses"`
	ViewsLast30   int64                   `json:"views_last_30_days"`
	ActionHistory []AdminModerationAction `json:"action_history"`
}

type AdminCatalogProfessorListResponse struct {
	Professors   []AdminCatalogProfessor `json:"professors"`
	Total        int64                   `json:"total"`
	Limit        int                     `json:"limit"`
	Offset       int                     `json:"offset"`
	Universities []string                `json:"universities"`
}

type AdminCatalogProfessorResponse struct {
	Professor AdminCatalogProfessorDetail `json:"professor"`
}

type AdminCatalogProfessorUpdateRequest struct {
	Name       *string  `json:"name" required:"true"`
	College    *string  `json:"college" required:"true"`
	University *string  `json:"university" required:"true"`
	Aliases    []string `json:"aliases"`
	Visible    *bool    `json:"visible" required:"true"`
	CourseTags []string `json:"course_tags"`
	ReasonCode *string  `json:"reason_code"`
	Note       *string  `json:"note"`
}

type AdminCatalogProfessorMergeRequest struct {
	TargetEmail *string `json:"target_email" required:"true"`
	Note        *string `json:"note"`
}

type AdminCatalogProfessorMergeResponse struct {
	Professor        AdminCatalogProfessorDetail `json:"professor"`
	MovedReviewCount int64                       `json:"moved_review_count"`
}

type AdminCatalogCourse struct {
	Tag              string `json:"tag"`
	Name             string `json:"name"`
	Views            int64  `json:"views"`
	FileCount        int64  `json:"file_count"`
	VisibleFileCount int64  `json:"visible_file_count"`
	ProfessorCount   int64  `json:"professor_count"`
}

type AdminCatalogCourseListResponse struct {
	Courses []AdminCatalogCourse `json:"courses"`
	Total   int64                `json:"total"`
	Limit   int                  `json:"limit"`
	Offset  int                  `json:"offset"`
}

type AdminCatalogCourseUpdateRequest struct {
	Name *string `json:"name" required:"true"`
	Note *string `json:"note"`
}

type AdminCatalogCourseResponse struct {
	Course AdminCatalogCourse `json:"course"`
}

// AdminQueueCounts match the default queue of each admin page, for sidebar badges.
type AdminQueueCounts struct {
	Reviews           int64 `json:"reviews"`
	CourseFiles       int64 `json:"course_files"`
	ProfessorRequests int64 `json:"professor_requests"`
}
