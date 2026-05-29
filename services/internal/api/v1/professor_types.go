package v1

import "time"

type ProfessorInList struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

type ProfessorRequestBody struct {
	ProfessorName  *string `json:"professor_name" required:"true"`
	ProfessorEmail *string `json:"professor_email"`
	University     *string `json:"university" required:"true"`
	College        *string `json:"college"`
}

type ProfessorRequestResponse struct {
	ID      int64  `json:"id,string"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type ProfessorResponse struct {
	Email             string             `json:"email"`
	Name              string             `json:"name"`
	College           string             `json:"college"`
	University        string             `json:"university"`
	Reviews           []Review           `json:"reviews"`
	SimilarProfessors []SimilarProfessor `json:"similar_professors"`
	Reviewed          bool               `json:"reviewed"`
	Score             float64            `json:"score"`
	Courses           []string           `json:"courses"`
}

type SimilarProfessor struct {
	ProfessorEmail   string  `json:"professor_email"`
	ProfessorName    string  `json:"professor_name"`
	ProfessorCollege string  `json:"professor_college"`
	ReviewsCount     int     `json:"reviews_count"`
	Score            float64 `json:"score"`
	ReviewPreview    string  `json:"review_preview"`
}

type Review struct {
	SortIndex     int64             `json:"sort_index,string"`
	ID            int64             `json:"id,string"`
	Score         int               `json:"score"`
	Positive      bool              `json:"positive"`
	Text          string            `json:"text"`
	CreatedAt     time.Time         `json:"created_at"`
	Author        string            `json:"author"`
	Language      string            `json:"language"`
	LikeCount     int               `json:"like_count"`
	DislikeCount  int               `json:"dislike_count"`
	ReplyCount    int               `json:"reply_count"`
	GradeReceived *string           `json:"grade_received,omitempty"`
	CourseTaken   *string           `json:"course_taken,omitempty"`
	Attachment    *ReviewAttachment `json:"attachment,omitempty"`
	Gif           *string           `json:"gif,omitempty"`
	Self          bool              `json:"self"`
	Rated         *string           `json:"rated,omitempty"`
	UaeuOrigin    bool              `json:"uaeu_origin"`
}

type ReviewAttachment struct {
	ID     int64  `json:"id,string"`
	Height int    `json:"height"`
	Width  int    `json:"width"`
	URL    string `json:"url"`
}

type ReviewPostBody struct {
	Text           string  `json:"text"`
	Score          *int    `json:"score" required:"true"`
	Positive       *bool   `json:"positive" required:"true"`
	ProfessorEmail *string `json:"professor_email" required:"true"`
	RecaptchaToken *string `json:"recaptcha_token" required:"true"`
	Attachment     *int64  `json:"attachment,string"`
	Gif            *string `json:"gif"`
	GradeReceived  *string `json:"grade_received"`
	CourseTaken    *string `json:"course_taken"`
}

type ReviewAttachmentResponse struct {
	ID int64 `json:"id,string"`
}

type ReviewRatingBody struct {
	ReviewID int64  `json:"review_id,string"`
	Rating   string `json:"rating"`
}

type ReviewPostResponse struct {
	SortIndex     int64             `json:"sort_index,string"`
	Text          string            `json:"text"`
	Score         int               `json:"score"`
	Positive      bool              `json:"positive"`
	CourseTaken   *string           `json:"course_taken,omitempty"`
	GradeReceived *string           `json:"grade_received,omitempty"`
	Attachment    *ReviewAttachment `json:"attachment,omitempty"`
	Gif           *string           `json:"gif,omitempty"`
	ID            int64             `json:"id,string"`
	Flagged       *bool             `json:"flagged,omitempty"`
	CreatedAt     time.Time         `json:"created_at"`
	Language      string            `json:"language"`
}

type ReviewReportBody struct {
	ReviewID int64  `json:"review_id,string"`
	Reason   string `json:"reason"`
}

type SuccessResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type ReviewTranslationResponse struct {
	Content string `json:"content"`
	Target  string `json:"target"`
}

type ReplyNameBody struct {
	ReviewID int64 `json:"review_id,string"`
}

type ReplyNameResponse struct {
	Name string `json:"name"`
}

type ReplyPostBody struct {
	ReviewID int64   `json:"review_id,string" required:"true"`
	ReplyID  *int64  `json:"reply_id,string"`
	Comment  string  `json:"comment"`
	Gif      *string `json:"gif"`
}

type Reply struct {
	ID        int64     `json:"id,string"`
	Comment   string    `json:"comment"`
	CreatedAt time.Time `json:"created_at"`
	Gif       *string   `json:"gif,omitempty"`
	Author    string    `json:"author"`
	Mention   *string   `json:"mention,omitempty"`
	Op        bool      `json:"op"`
	Self      bool      `json:"self"`
	Liked     bool      `json:"liked"`
	LikeCount int       `json:"like_count"`
}

type GetRepliesResponse struct {
	Replies []Reply `json:"replies"`
}

type StudentVerifyRequest struct {
	Email string `json:"email"`
}

type StudentConfirmRequest struct {
	OTP   string `json:"otp"`
	Email string `json:"email"`
}
