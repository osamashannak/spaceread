package v1

import "time"

type AccountSignupRequest struct {
	Username string `json:"username" required:"true"`
	Email    string `json:"email" required:"true"`
	Password string `json:"password" required:"true"`
}

type AccountLoginRequest struct {
	ID       string `json:"id" required:"true"`
	Password string `json:"password" required:"true"`
}

type GoogleLoginRequest struct {
	Credential string `json:"credential" required:"true"`
}

type GoogleSignupRequest struct {
	Credential string `json:"credential" required:"true"`
	Username   string `json:"username" required:"true"`
}

type AuthResponse struct {
	Redirect string `json:"redirect,omitempty"`
	Status   string `json:"status"`
	ID       string `json:"id,omitempty"`
	Username string `json:"username,omitempty"`
	Role     string `json:"role,omitempty"`
}

type GoogleSignupPromptResponse struct {
	NeedsSignup       bool   `json:"needs_signup"`
	Email             string `json:"email"`
	SuggestedUsername string `json:"suggestedUsername"`
}

type NotificationResponse struct {
	ID        int64      `json:"id,string"`
	Type      string     `json:"type"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Href      string     `json:"href"`
	ReadAt    *time.Time `json:"read_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type NotificationsResponse struct {
	Notifications []NotificationResponse `json:"notifications"`
	UnreadCount   int                    `json:"unread_count"`
}

type NotificationSummaryResponse struct {
	UnreadCount int `json:"unread_count"`
}

type MySpaceUserResponse struct {
	ID       int64  `json:"id,string"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

type MySpaceSummaryResponse struct {
	Reviews             int `json:"reviews"`
	Replies             int `json:"replies"`
	Uploads             int `json:"uploads"`
	PendingUploads      int `json:"pending_uploads"`
	UnreadNotifications int `json:"unread_notifications"`
}

type MySpaceReviewResponse struct {
	ID             int64     `json:"id,string"`
	ProfessorEmail string    `json:"professor_email"`
	ProfessorName  string    `json:"professor_name"`
	Score          int       `json:"score"`
	Positive       bool      `json:"positive"`
	Text           string    `json:"text"`
	Visible        bool      `json:"visible"`
	Reviewed       bool      `json:"reviewed"`
	Status         string    `json:"status"`
	LikeCount      int       `json:"like_count"`
	DislikeCount   int       `json:"dislike_count"`
	ReplyCount     int       `json:"reply_count"`
	CourseTaken    *string   `json:"course_taken,omitempty"`
	GradeReceived  *string   `json:"grade_received,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

type MySpaceReplyResponse struct {
	ID             int64     `json:"id,string"`
	ReviewID       int64     `json:"review_id,string"`
	ProfessorEmail string    `json:"professor_email"`
	ProfessorName  string    `json:"professor_name"`
	ReviewPreview  string    `json:"review_preview"`
	Comment        string    `json:"comment"`
	Visible        bool      `json:"visible"`
	Status         string    `json:"status"`
	LikeCount      int       `json:"like_count"`
	CreatedAt      time.Time `json:"created_at"`
}

type MySpaceUploadResponse struct {
	ID            int64      `json:"id,string"`
	CourseTag     string     `json:"course_tag"`
	CourseName    string     `json:"course_name"`
	Name          string     `json:"name"`
	Type          string     `json:"type"`
	Size          int        `json:"size"`
	DownloadCount int        `json:"download_count"`
	Visible       bool       `json:"visible"`
	Reviewed      bool       `json:"reviewed"`
	ReviewedAt    *time.Time `json:"reviewed_at,omitempty"`
	Status        string     `json:"status"`
	CreatedAt     time.Time  `json:"created_at"`
}

type MySpaceResponse struct {
	User    MySpaceUserResponse     `json:"user"`
	Summary MySpaceSummaryResponse  `json:"summary"`
	Reviews []MySpaceReviewResponse `json:"reviews"`
	Replies []MySpaceReplyResponse  `json:"replies"`
	Uploads []MySpaceUploadResponse `json:"uploads"`
}
