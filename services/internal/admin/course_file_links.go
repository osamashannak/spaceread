package admin

import (
	"net"
	"net/http"
	"time"

	"github.com/osamashannak/uaeu-space/services/pkg/coursefile"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/osamashannak/uaeu-space/services/pkg/utils"
)

const courseFileLinkDuration = 15 * time.Minute

// CourseFileLinkSigner creates short-lived signed links to stored course files.
type CourseFileLinkSigner interface {
	GenerateInlineSASToken(blobName, fileName, contentType string, ipAddress net.IP, expiresOn time.Time) (string, error)
	GenerateAttachmentSASToken(blobName, fileName string, ipAddress net.IP, expiresOn time.Time) (string, error)
	FormatSASURL(blobName, queryParams string) string
}

// GetCourseFileLink returns a signed link for any course file, including hidden
// ones awaiting review. mode=preview opens supported types in the browser;
// mode=download always saves the file. Links are locked to the admin's IP.
func (s *Server) GetCourseFileLink() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		fileID, ok := parsePathID(w, r, "fileID")
		if !ok {
			return
		}
		mode := r.URL.Query().Get("mode")
		if mode != "preview" && mode != "download" {
			writeError(w, http.StatusBadRequest, "mode must be preview or download")
			return
		}
		if s.courseFileLinks == nil {
			writeError(w, http.StatusServiceUnavailable, "file storage is not configured")
			return
		}

		logger := logging.FromContext(r.Context())
		file, err := s.db.GetCourseFile(r.Context(), fileID)
		if err != nil {
			logger.Errorf("failed to get course file %d for link: %v", fileID, err)
			writeError(w, http.StatusInternalServerError, "failed to get course file")
			return
		}
		if file == nil || file.BlobName == "" {
			writeError(w, http.StatusNotFound, "course file not found")
			return
		}

		ip := net.ParseIP(utils.GetClientIP(r))
		expiresOn := time.Now().Add(courseFileLinkDuration)
		var query string
		if mode == "preview" {
			contentType, previewable := coursefile.PreviewContentType(file.Type)
			if !previewable {
				writeError(w, http.StatusUnsupportedMediaType, "preview is only available for PDF, image, audio and video files")
				return
			}
			query, err = s.courseFileLinks.GenerateInlineSASToken(file.BlobName, file.Name, contentType, ip, expiresOn)
		} else {
			query, err = s.courseFileLinks.GenerateAttachmentSASToken(file.BlobName, file.Name, ip, expiresOn)
		}
		if err != nil || query == "" {
			logger.Errorf("failed to sign %s link for course file %d: %v", mode, fileID, err)
			writeError(w, http.StatusInternalServerError, "failed to create file link")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, struct {
			URL       string    `json:"url"`
			ExpiresAt time.Time `json:"expires_at"`
		}{URL: s.courseFileLinks.FormatSASURL(file.BlobName, query), ExpiresAt: expiresOn})
	})
}
