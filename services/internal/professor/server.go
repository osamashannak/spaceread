package professor

import (
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/internal/middleware"
	"github.com/osamashannak/uaeu-space/services/internal/professor/database"
	"github.com/osamashannak/uaeu-space/services/pkg/azure/blobstorage"
	"github.com/osamashannak/uaeu-space/services/pkg/azure/vision"
	"github.com/osamashannak/uaeu-space/services/pkg/cache"
	"github.com/osamashannak/uaeu-space/services/pkg/gateway"
	"github.com/osamashannak/uaeu-space/services/pkg/google/perspective"
	"github.com/osamashannak/uaeu-space/services/pkg/google/recaptcha"
	"github.com/osamashannak/uaeu-space/services/pkg/google/translate"
	"github.com/osamashannak/uaeu-space/services/pkg/ses"
	"github.com/osamashannak/uaeu-space/services/pkg/snowflake"
	"net/http"
	"time"
)

type Server struct {
	db               *database.ProfessorDB
	generator        *snowflake.Generator
	recaptcha        *recaptcha.Recaptcha
	perspective      *perspective.Perspective
	vision           *vision.AzureVision
	translate        *translate.Translate
	cache            *cache.Cache[[]v1.ProfessorInList]
	similarProfCache *cache.Cache[[]v1.SimilarProfessor]
	courseCache      *cache.Cache[[]string]
	storage          *blobstorage.BlobStorage
	gateway          *gateway.Gateway
	sesClient        *ses.Client
}

func NewServer(db *database.ProfessorDB,
	generator *snowflake.Generator,
	recaptcha *recaptcha.Recaptcha,
	perspective *perspective.Perspective,
	vision *vision.AzureVision,
	translate *translate.Translate,
	storage *blobstorage.BlobStorage,
	gateway *gateway.Gateway,
	sesClient *ses.Client) (*Server, error) {
	return &Server{
		db:               db,
		generator:        generator,
		recaptcha:        recaptcha,
		perspective:      perspective,
		vision:           vision,
		translate:        translate,
		cache:            cache.New[[]v1.ProfessorInList](12 * time.Hour),
		similarProfCache: cache.New[[]v1.SimilarProfessor](7 * 24 * time.Hour),
		courseCache:      cache.New[[]string](7 * 24 * time.Hour),
		storage:          storage,
		gateway:          gateway,
		sesClient:        sesClient,
	}, nil
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.Handle("GET /professor", s.gateway.OptionalAuthMiddleware(s.Get()))
	mux.Handle("GET /professor/all", s.GetAll())
	mux.Handle("GET /professor/request", s.gateway.Middleware(s.PrepareProfessorRequest()))
	mux.Handle("POST /professor/request", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.RequestProfessor())))

	mux.Handle("POST /comment", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.PostReview())))
	mux.Handle("DELETE /comment", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.DeleteReview())))
	mux.Handle("GET /comment/translate", s.TranslateReview())
	mux.Handle("POST /comment/report", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.ReportReview())))
	mux.Handle("POST /comment/attachment", s.gateway.Middleware(s.gateway.RequireCSRF(s.UploadReviewAttachment())))
	mux.Handle("POST /comment/rating", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.AddReviewRating())))
	mux.Handle("DELETE /comment/rating", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.DeleteReviewRating())))

	mux.Handle("GET /comment/reply", s.gateway.OptionalAuthMiddleware(s.GetReplies()))
	mux.Handle("GET /comment/reply/name", s.gateway.OptionalAuthMiddleware(s.GetReplyName()))
	mux.Handle("POST /comment/reply", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.PostReply())))
	mux.Handle("DELETE /comment/reply", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.DeleteReply())))
	mux.Handle("POST /comment/reply/like", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.LikeReply())))
	mux.Handle("DELETE /comment/reply/like", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.UnlikeReply())))

	mux.Handle("GET /feedback/new", s.gateway.OptionalAuthMiddleware(s.NewFeedback()))
	mux.Handle("POST /feedback", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.Feedback())))

	return middleware.CORS(mux)
}
