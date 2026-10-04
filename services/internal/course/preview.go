package course

import (
	"context"
	"mime"
	"net"
	"net/http"
	"strconv"
	"time"

	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/internal/course/model"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/osamashannak/uaeu-space/services/pkg/utils"
)

type courseFilePreviewStore interface {
	GetCourseFileForPreview(context.Context, string) (*model.CourseFile, error)
}

type courseFilePreviewStorage interface {
	GenerateInlineSASToken(string, string, string, net.IP, time.Time) (string, error)
	FormatSASURL(string, string) string
}

func (s *Server) PreviewCourseFile() http.Handler {
	return courseFilePreviewHandler(s.db, s.storage)
}

func courseFilePreviewHandler(db courseFilePreviewStore, storage courseFilePreviewStorage) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// This response contains an expiring URL tied to the requesting client.
		w.Header().Set("Cache-Control", "no-store")
		respondError := func(status int, message string) {
			jsonutil.MarshalResponse(w, status, v1.ErrorResponse{Message: message, Error: status})
		}

		fileID := r.URL.Query().Get("fileId")
		if fileID == "" {
			respondError(http.StatusBadRequest, "file id is required")
			return
		}
		if id, err := strconv.ParseInt(fileID, 10, 64); err != nil || id <= 0 {
			respondError(http.StatusBadRequest, "invalid file id")
			return
		}

		logger := logging.FromContext(r.Context())
		file, err := db.GetCourseFileForPreview(r.Context(), fileID)
		if err != nil {
			logger.Errorf("failed to get course file for preview with id %s: %v", fileID, err)
			respondError(http.StatusInternalServerError, "an error occurred. please try again later.")
			return
		}
		if file == nil {
			respondError(http.StatusNotFound, "file not found")
			return
		}
		contentType, _, err := mime.ParseMediaType(file.Type)
		if err != nil || contentType != "application/pdf" {
			respondError(http.StatusUnsupportedMediaType, "preview is only available for PDF files")
			return
		}

		ipAddress := net.ParseIP(utils.GetClientIP(r))
		expiresOn := time.Now().Add(courseDownloadSASDuration)
		queryParams, err := storage.GenerateInlineSASToken(file.BlobName, file.Name, contentType, ipAddress, expiresOn)
		if err != nil || queryParams == "" {
			logger.Errorf("failed to generate preview SAS token for file %s: %v", fileID, err)
			respondError(http.StatusInternalServerError, "an error occurred. please try again later.")
			return
		}

		// Previewing does not increment download_count; the download endpoint still does.
		jsonutil.MarshalResponse(w, http.StatusOK, struct {
			URL string `json:"url"`
		}{URL: storage.FormatSASURL(file.BlobName, queryParams)})
	})
}
