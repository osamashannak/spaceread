package course

import (
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/internal/course/database"
	"github.com/osamashannak/uaeu-space/services/internal/middleware"
	"github.com/osamashannak/uaeu-space/services/pkg/azure/blobstorage"
	"github.com/osamashannak/uaeu-space/services/pkg/cache"
	"github.com/osamashannak/uaeu-space/services/pkg/gateway"
	"github.com/osamashannak/uaeu-space/services/pkg/snowflake"
	"net/http"
	"time"
)

type Server struct {
	db        *database.CourseDB
	generator *snowflake.Generator
	cache     *cache.Cache[[]v1.CourseInList]
	storage   *blobstorage.BlobStorage
	gateway   *gateway.Gateway
}

func NewServer(db *database.CourseDB, generator *snowflake.Generator, storage *blobstorage.BlobStorage, gateway *gateway.Gateway) (*Server, error) {
	return &Server{
		db:        db,
		generator: generator,
		cache:     cache.New[[]v1.CourseInList](24 * 7 * 24 * time.Hour),
		storage:   storage,
		gateway:   gateway,
	}, nil
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.Handle("GET /course", s.Get())
	mux.Handle("GET /course/list", s.GetCourseList())
	mux.Handle("POST /course/upload", s.gateway.OptionalAuthMiddleware(s.gateway.RequireCSRF(s.UploadCourseFile())))
	mux.Handle("GET /course/download", s.DownloadCourseFile())

	return middleware.CORS(mux)
}
