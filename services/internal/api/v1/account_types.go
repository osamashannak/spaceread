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
