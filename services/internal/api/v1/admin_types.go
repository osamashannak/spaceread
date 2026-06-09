package v1

import (
	"encoding/json"
	"time"
)

type AdminSessionResponse struct {
	User AdminSessionUser `json:"user"`
}

type AdminSessionUser struct {
	ID       int64   `json:"id,string"`
	Username *string `json:"username,omitempty"`
	Email    *string `json:"email,omitempty"`
	Role     string  `json:"role"`
}

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

type AdminReasonResponse struct {
	Reason AdminReason `json:"reason"`
}

type AdminReasonUpdateRequest struct {
	Code            *string `json:"code" required:"true"`
	Label           *string `json:"label" required:"true"`
	PolicyArea      *string `json:"policy_area" required:"true"`
	PolicyReference *string `json:"policy_reference"`
	Active          *bool   `json:"active" required:"true"`
	SortOrder       *int16  `json:"sort_order" required:"true"`
}

type AdminReviewListResponse struct {
	Reviews []AdminReview `json:"reviews"`
	Limit   int           `json:"limit"`
	Offset  int           `json:"offset"`
}

type AdminSuspiciousReviewPairListResponse struct {
	Pairs  []AdminSuspiciousReviewPair `json:"pairs"`
	Limit  int                         `json:"limit"`
	Offset int                         `json:"offset"`
}

type AdminReviewResponse struct {
	Review AdminReview `json:"review"`
}

type AdminSuspiciousReviewPair struct {
	Review1             AdminReview `json:"review_1"`
	Review2             AdminReview `json:"review_2"`
	SuspicionScore      int         `json:"suspicion_score"`
	ContentSimilarity   float64     `json:"content_similarity"`
	CreatedDeltaSeconds int64       `json:"created_delta_seconds"`
	SameIP              bool        `json:"same_ip"`
	SameUser            bool        `json:"same_user"`
	SimilarContent      bool        `json:"similar_content"`
	SameLanguage        bool        `json:"same_language"`
	SameScore           bool        `json:"same_score"`
	SameRecommendation  bool        `json:"same_recommendation"`
	CloseTiming         bool        `json:"close_timing"`
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
	IPAddress            *string    `json:"ip_address,omitempty"`
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

type AdminReviewPairVisibilityRequest struct {
	Review1ID      *int64  `json:"review_1_id,string" required:"true"`
	Review2ID      *int64  `json:"review_2_id,string" required:"true"`
	ReasonCode     *string `json:"reason_code" required:"true"`
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

type AdminReviewReplyVisibilityRequest struct {
	Visible    *bool   `json:"visible" required:"true"`
	ReasonCode *string `json:"reason_code"`
	Note       *string `json:"note"`
}

type AdminReviewReplyReviewRequest struct {
	ReasonCode *string `json:"reason_code"`
	Note       *string `json:"note"`
}

type AdminReviewReplyNoteRequest struct {
	Note *string `json:"note" required:"true"`
}

type AdminDecisionResponse struct {
	Success             bool        `json:"success"`
	Review              AdminReview `json:"review"`
	ResolvedReportCount int64       `json:"resolved_report_count"`
	Action              string      `json:"action"`
}

type AdminPairDecisionResponse struct {
	Success             bool        `json:"success"`
	Review1             AdminReview `json:"review_1"`
	Review2             AdminReview `json:"review_2"`
	ResolvedReportCount int64       `json:"resolved_report_count"`
	Action              string      `json:"action"`
}

type AdminReplyDecisionResponse struct {
	Success bool             `json:"success"`
	Review  AdminReview      `json:"review"`
	Reply   AdminReviewReply `json:"reply"`
	Action  string           `json:"action"`
}

type AdminReviewReplyResponse struct {
	Reply         AdminReviewReply        `json:"reply"`
	ParentReview  AdminReview             `json:"parent_review"`
	Likes         []AdminReplyLike        `json:"likes"`
	Signals       []AdminModerationSignal `json:"signals"`
	ActionHistory []AdminModerationAction `json:"action_history"`
}

type AdminReplyLike struct {
	ReplyID   int64     `json:"reply_id,string"`
	SessionID int64     `json:"session_id,string"`
	UserID    *int64    `json:"user_id,string,omitempty"`
	IPAddress *string   `json:"ip_address,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type AdminEntitySession struct {
	ID        int64      `json:"id,string"`
	UserID    *int64     `json:"user_id,string,omitempty"`
	UserAgent *string    `json:"user_agent,omitempty"`
	IPAddress string     `json:"ip_address"`
	CreatedAt *time.Time `json:"created_at,omitempty"`
}

type AdminUserAccount struct {
	ID          int64      `json:"id,string"`
	Username    string     `json:"username"`
	Email       string     `json:"email"`
	Role        string     `json:"role"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
}

type AdminUserIdentity struct {
	ID            int64     `json:"id,string"`
	Provider      string    `json:"provider"`
	Email         string    `json:"email"`
	EmailVerified bool      `json:"email_verified"`
	CreatedAt     time.Time `json:"created_at"`
}

type AdminLoginSession struct {
	ID         int64      `json:"id,string"`
	UserID     int64      `json:"user_id,string"`
	SessionID  int64      `json:"session_id,string"`
	CreatedAt  time.Time  `json:"created_at"`
	LastSeenAt *time.Time `json:"last_seen_at,omitempty"`
	ExpiresAt  time.Time  `json:"expires_at"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty"`
	UserAgent  *string    `json:"user_agent,omitempty"`
	IPAddress  *string    `json:"ip_address,omitempty"`
}

type AdminEntityStats struct {
	HiddenContentCount   int        `json:"hidden_content_count"`
	OpenReportCount      int        `json:"open_report_count"`
	SignalCount          int        `json:"signal_count"`
	RecentActivityCount  int        `json:"recent_activity_count"`
	DistinctSessionCount int        `json:"distinct_session_count,omitempty"`
	DistinctUserCount    int        `json:"distinct_user_count,omitempty"`
	FirstSeen            *time.Time `json:"first_seen,omitempty"`
	LastSeen             *time.Time `json:"last_seen,omitempty"`
}

type AdminEntityActivity struct {
	Reviews           []AdminReviewSummary           `json:"reviews"`
	Replies           []AdminReviewReplySummary      `json:"replies"`
	Reports           []AdminReviewReportSummary     `json:"reports"`
	Ratings           []AdminReviewRatingSummary     `json:"ratings"`
	ReplyLikes        []AdminReplyLike               `json:"reply_likes"`
	ProfessorRequests []AdminProfessorRequestSummary `json:"professor_requests"`
	CourseFiles       []AdminCourseFileSummary       `json:"course_files"`
	Attachments       []AdminReviewAttachmentSummary `json:"attachments"`
	Signals           []AdminModerationSignal        `json:"signals"`
	Actions           []AdminModerationAction        `json:"actions"`
}

type AdminReviewSummary struct {
	ID              int64      `json:"id,string"`
	ProfessorEmail  string     `json:"professor_email"`
	ProfessorName   string     `json:"professor_name"`
	Score           int        `json:"score"`
	Positive        bool       `json:"positive"`
	Text            string     `json:"text"`
	CreatedAt       time.Time  `json:"created_at"`
	Visible         bool       `json:"visible"`
	Reviewed        bool       `json:"reviewed"`
	DeletedAt       *time.Time `json:"deleted_at,omitempty"`
	LikeCount       int        `json:"like_count"`
	DislikeCount    int        `json:"dislike_count"`
	ReplyCount      int64      `json:"reply_count"`
	SessionID       *int64     `json:"session_id,string,omitempty"`
	UserID          *int64     `json:"user_id,string,omitempty"`
	IPAddress       *string    `json:"ip_address,omitempty"`
	OpenReportCount int        `json:"open_report_count"`
	SignalCount     int        `json:"signal_count"`
	MediaKind       *string    `json:"media_kind,omitempty"`
}

type AdminReviewReplySummary struct {
	ID             int64      `json:"id,string"`
	ReviewID       int64      `json:"review_id,string"`
	ProfessorEmail string     `json:"professor_email"`
	ProfessorName  string     `json:"professor_name"`
	Text           string     `json:"text"`
	CreatedAt      time.Time  `json:"created_at"`
	Visible        bool       `json:"visible"`
	Reviewed       bool       `json:"reviewed"`
	DeletedAt      *time.Time `json:"deleted_at,omitempty"`
	Author         *string    `json:"author,omitempty"`
	Mention        *string    `json:"mention,omitempty"`
	Op             bool       `json:"op"`
	LikeCount      int16      `json:"like_count"`
	SessionID      int64      `json:"session_id,string"`
	UserID         *int64     `json:"user_id,string,omitempty"`
	IPAddress      *string    `json:"ip_address,omitempty"`
}

type AdminReviewReportSummary struct {
	ID            int64      `json:"id,string"`
	ReviewID      int64      `json:"review_id,string"`
	Reason        string     `json:"reason"`
	SessionID     int64      `json:"session_id,string"`
	UserID        *int64     `json:"user_id,string,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	Resolved      bool       `json:"resolved"`
	ResolvedAt    *time.Time `json:"resolved_at,omitempty"`
	ReviewText    string     `json:"review_text"`
	ProfessorName string     `json:"professor_name"`
}

type AdminReviewRatingSummary struct {
	ReviewID      int64     `json:"review_id,string"`
	ProfessorName string    `json:"professor_name"`
	Value         string    `json:"value"`
	SessionID     int64     `json:"session_id,string"`
	UserID        *int64    `json:"user_id,string,omitempty"`
	IPAddress     string    `json:"ip_address"`
	CreatedAt     time.Time `json:"created_at"`
}

type AdminReviewAttachmentSummary struct {
	ID        int64     `json:"id,string"`
	ReviewID  *int64    `json:"review_id,string,omitempty"`
	MimeType  string    `json:"mime_type"`
	Size      int       `json:"size"`
	Width     int       `json:"width"`
	Height    int       `json:"height"`
	Visible   bool      `json:"visible"`
	Reviewed  bool      `json:"reviewed"`
	BlobName  string    `json:"blob_name"`
	IPAddress *string   `json:"ip_address,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	URL       string    `json:"url"`
}

type AdminProfessorRequestSummary struct {
	ID                   int64      `json:"id,string"`
	ProfessorName        string     `json:"professor_name"`
	ProfessorEmail       *string    `json:"professor_email,omitempty"`
	University           string     `json:"university"`
	College              *string    `json:"college,omitempty"`
	Status               string     `json:"status"`
	SessionID            int64      `json:"session_id,string"`
	UserID               *int64     `json:"user_id,string,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	ReviewedAt           *time.Time `json:"reviewed_at,omitempty"`
	ReviewerUserID       *int64     `json:"reviewer_user_id,string,omitempty"`
	ModerationReasonCode *string    `json:"moderation_reason_code,omitempty"`
	ModerationNote       *string    `json:"moderation_note,omitempty"`
}

type AdminCourseFileSummary struct {
	ID                   int64      `json:"id,string"`
	Name                 string     `json:"name"`
	Type                 string     `json:"type"`
	Size                 int        `json:"size"`
	Visible              bool       `json:"visible"`
	Reviewed             bool       `json:"reviewed"`
	CourseTag            string     `json:"course_tag"`
	DownloadCount        int        `json:"download_count"`
	CreatedAt            time.Time  `json:"created_at"`
	UserID               *int64     `json:"user_id,string,omitempty"`
	SessionID            *int64     `json:"session_id,string,omitempty"`
	ReviewedAt           *time.Time `json:"reviewed_at,omitempty"`
	ReviewerUserID       *int64     `json:"reviewer_user_id,string,omitempty"`
	ModerationReasonCode *string    `json:"moderation_reason_code,omitempty"`
	ModerationNote       *string    `json:"moderation_note,omitempty"`
}

type AdminSessionDetailResponse struct {
	Session       AdminEntitySession  `json:"session"`
	Stats         AdminEntityStats    `json:"stats"`
	Activity      AdminEntityActivity `json:"activity"`
	LoginSessions []AdminLoginSession `json:"login_sessions"`
}

type AdminUserDetailResponse struct {
	User          AdminUserAccount     `json:"user"`
	Identities    []AdminUserIdentity  `json:"identities"`
	Sessions      []AdminEntitySession `json:"sessions"`
	LoginSessions []AdminLoginSession  `json:"login_sessions"`
	Stats         AdminEntityStats     `json:"stats"`
	Activity      AdminEntityActivity  `json:"activity"`
}

type AdminIPDetailResponse struct {
	IPAddress     string               `json:"ip_address"`
	Stats         AdminEntityStats     `json:"stats"`
	Sessions      []AdminEntitySession `json:"sessions"`
	LoginSessions []AdminLoginSession  `json:"login_sessions"`
	Activity      AdminEntityActivity  `json:"activity"`
}
