package v1

import (
	"encoding/json"
	"time"
)

type AdminReason struct {
	Code            string  `json:"code"`
	Label           string  `json:"label"`
	PolicyArea      string  `json:"policy_area"`
	PolicyReference *string `json:"policy_reference,omitempty"`
	Active          bool    `json:"active"`
	SortOrder       int16   `json:"sort_order"`
}

type AdminReasonsResponse struct {
	Reasons []AdminReason `json:"reasons"`
}

type AdminReviewListResponse struct {
	Reviews []AdminReview `json:"reviews"`
	Limit   int           `json:"limit"`
	Offset  int           `json:"offset"`
}

type AdminReviewResponse struct {
	Review AdminReview `json:"review"`
}

type AdminReview struct {
	SortIndex            int64                   `json:"sort_index,string"`
	ID                   int64                   `json:"id,string"`
	ProfessorEmail       string                  `json:"professor_email"`
	ProfessorName        string                  `json:"professor_name"`
	ProfessorCollege     *string                 `json:"professor_college,omitempty"`
	ProfessorUniversity  *string                 `json:"professor_university,omitempty"`
	Score                int                     `json:"score"`
	Positive             bool                    `json:"positive"`
	Text                 string                  `json:"text"`
	CreatedAt            time.Time               `json:"created_at"`
	Language             string                  `json:"language"`
	LikeCount            int                     `json:"like_count"`
	DislikeCount         int                     `json:"dislike_count"`
	ReplyCount           int64                   `json:"reply_count"`
	GradeReceived        *string                 `json:"grade_received,omitempty"`
	CourseTaken          *string                 `json:"course_taken,omitempty"`
	Attachment           *AdminReviewAttachment  `json:"attachment,omitempty"`
	Gif                  *string                 `json:"gif,omitempty"`
	Visible              bool                    `json:"visible"`
	Reviewed             bool                    `json:"reviewed"`
	ReviewedAt           *time.Time              `json:"reviewed_at,omitempty"`
	ReviewerUserID       *int64                  `json:"reviewer_user_id,string,omitempty"`
	DeletedAt            *time.Time              `json:"deleted_at,omitempty"`
	UaeuOrigin           bool                    `json:"uaeu_origin"`
	StudentVerified      bool                    `json:"student_verified"`
	SessionID            *int64                  `json:"session_id,string,omitempty"`
	UserID               *int64                  `json:"user_id,string,omitempty"`
	IPAddress            *string                 `json:"ip_address,omitempty"`
	ModerationReasonCode *string                 `json:"moderation_reason_code,omitempty"`
	ModerationNote       *string                 `json:"moderation_note,omitempty"`
	Reports              []AdminReviewReport     `json:"reports"`
	Replies              []AdminReviewReply      `json:"replies"`
	Ratings              []AdminReviewRating     `json:"ratings"`
	Signals              []AdminModerationSignal `json:"signals"`
	ActionHistory        []AdminModerationAction `json:"action_history"`
}

type AdminReviewAttachment struct {
	ID                   int64      `json:"id,string"`
	MimeType             string     `json:"mime_type"`
	Size                 int        `json:"size"`
	Width                int        `json:"width"`
	Height               int        `json:"height"`
	Visible              bool       `json:"visible"`
	Reviewed             bool       `json:"reviewed"`
	ReviewedAt           *time.Time `json:"reviewed_at,omitempty"`
	ReviewerUserID       *int64     `json:"reviewer_user_id,string,omitempty"`
	ModerationReasonCode *string    `json:"moderation_reason_code,omitempty"`
	ModerationNote       *string    `json:"moderation_note,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	URL                  string     `json:"url"`
	BlobName             string     `json:"blob_name"`
	IPAddress            *string    `json:"ip_address,omitempty"`
}

type AdminReviewReport struct {
	ID                   int64      `json:"id,string"`
	ReviewID             int64      `json:"review_id,string"`
	Reason               string     `json:"reason"`
	SessionID            int64      `json:"session_id,string"`
	UserID               *int64     `json:"user_id,string,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	Resolved             bool       `json:"resolved"`
	ResolvedAt           *time.Time `json:"resolved_at,omitempty"`
	ResolverUserID       *int64     `json:"resolver_user_id,string,omitempty"`
	ResolutionAction     *string    `json:"resolution_action,omitempty"`
	ResolutionReasonCode *string    `json:"resolution_reason_code,omitempty"`
	ResolutionNote       *string    `json:"resolution_note,omitempty"`
}

type AdminReviewReply struct {
	ID                   int64      `json:"id,string"`
	ReviewID             int64      `json:"review_id,string"`
	Text                 string     `json:"text"`
	Gif                  *string    `json:"gif,omitempty"`
	Visible              bool       `json:"visible"`
	Reviewed             bool       `json:"reviewed"`
	ReviewedAt           *time.Time `json:"reviewed_at,omitempty"`
	ReviewerUserID       *int64     `json:"reviewer_user_id,string,omitempty"`
	ModerationReasonCode *string    `json:"moderation_reason_code,omitempty"`
	ModerationNote       *string    `json:"moderation_note,omitempty"`
	DeletedAt            *time.Time `json:"deleted_at,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	Author               *string    `json:"author,omitempty"`
	Mention              *string    `json:"mention,omitempty"`
	Op                   bool       `json:"op"`
	LikeCount            int16      `json:"like_count"`
	SessionID            int64      `json:"session_id,string"`
	UserID               *int64     `json:"user_id,string,omitempty"`
}

type AdminReviewRating struct {
	ReviewID  int64     `json:"review_id,string"`
	Value     string    `json:"value"`
	SessionID int64     `json:"session_id,string"`
	UserID    *int64    `json:"user_id,string,omitempty"`
	IPAddress string    `json:"ip_address"`
	CreatedAt time.Time `json:"created_at"`
}

type AdminModerationSignal struct {
	ID         *int64           `json:"id,string,omitempty"`
	TargetType string           `json:"target_type"`
	TargetID   string           `json:"target_id"`
	Source     string           `json:"source"`
	Attribute  string           `json:"attribute"`
	Score      *float64         `json:"score,omitempty"`
	Threshold  *float64         `json:"threshold,omitempty"`
	Severity   *string          `json:"severity,omitempty"`
	Payload    *json.RawMessage `json:"payload,omitempty"`
	CreatedAt  time.Time        `json:"created_at"`
}

type AdminModerationAction struct {
	ID            int64            `json:"id,string"`
	ActorUserID   *int64           `json:"actor_user_id,string,omitempty"`
	TargetType    string           `json:"target_type"`
	TargetID      string           `json:"target_id"`
	Action        string           `json:"action"`
	ReasonCode    *string          `json:"reason_code,omitempty"`
	Note          *string          `json:"note,omitempty"`
	PreviousState *json.RawMessage `json:"previous_state,omitempty"`
	NextState     *json.RawMessage `json:"next_state,omitempty"`
	CreatedAt     time.Time        `json:"created_at"`
}

type AdminReviewVisibilityRequest struct {
	Visible        *bool   `json:"visible" required:"true"`
	ReasonCode     *string `json:"reason_code"`
	Note           *string `json:"note"`
	ResolveReports *bool   `json:"resolve_reports"`
}

type AdminAttachmentVisibilityRequest struct {
	Visible    *bool   `json:"visible" required:"true"`
	ReasonCode *string `json:"reason_code"`
	Note       *string `json:"note"`
}

type AdminReviewNoteRequest struct {
	Note *string `json:"note" required:"true"`
}

type AdminDecisionResponse struct {
	Success             bool        `json:"success"`
	Review              AdminReview `json:"review"`
	ResolvedReportCount int64       `json:"resolved_report_count"`
	Action              string      `json:"action"`
}
