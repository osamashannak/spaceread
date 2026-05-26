package course

import (
	"errors"
	"fmt"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/internal/course/model"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/osamashannak/uaeu-space/services/pkg/utils"
	"io"
	"mime"
	"net"
	"net/http"
	"strconv"
	"time"
)

const maxCourseUploadSize = 101 << 20

func (s *Server) Get() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		ctx := r.Context()

		logger := logging.FromContext(ctx)

		tag := r.URL.Query().Get("tag")

		logger.Debugf("received request to get course with tag: %s", tag)

		if tag == "" {
			errorResponse := v1.ErrorResponse{
				Message: "tag is required",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		course, err := s.db.GetCourse(ctx, tag)

		if err != nil {
			logger.Errorf("failed to get course with tag %s: %v", tag, err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if course == nil {
			logger.Debugf("course with tag %s not found", tag)
			errorResponse := v1.ErrorResponse{
				Message: "course not found",
				Error:   http.StatusNotFound,
			}
			jsonutil.MarshalResponse(w, http.StatusNotFound, errorResponse)
			return
		}

		files, err := s.db.GetCourseFiles(ctx, course.Tag)

		if err != nil {
			logger.Errorf("failed to get course files for course with tag %s: %v", course.Tag, err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		response := v1.CourseFindResponse{
			Tag:   course.Tag,
			Name:  course.Name,
			Files: *files,
		}

		jsonutil.MarshalResponse(w, http.StatusOK, response)
	})
}

func (s *Server) GetCourseList() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		logger := logging.FromContext(ctx)

		logger.Debugf("received request to get courses list")

		if cached, ok := s.cache.Get("courses"); ok {
			logger.Debugf("returning cached courses list")
			jsonutil.MarshalResponse(w, http.StatusOK, cached)
			return
		}

		logger.Debugf("caching courses list")

		courses, err := s.db.GetCourses(ctx)

		if err != nil {
			logger.Errorf("failed to get courses list")
			errorResponse := v1.ErrorResponse{
				Message: "failed to get professors",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, courses)

	})
}

func (s *Server) UploadCourseFile() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		logger := logging.FromContext(ctx)

		profile, ok := s.gateway.GetProfile(ctx)

		if !ok {
			logger.Debugf("profile not found in context, session missing")
			errorResponse := v1.ErrorResponse{
				Message: "session missing",
				Error:   http.StatusUnauthorized,
			}
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, errorResponse)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, maxCourseUploadSize)
		err := r.ParseMultipartForm(maxCourseUploadSize)
		if err != nil {
			var maxBytesErr *http.MaxBytesError
			if errors.As(err, &maxBytesErr) {
				jsonutil.MarshalResponse(w, http.StatusRequestEntityTooLarge, v1.ErrorResponse{
					Message: fmt.Sprintf("file size cannot exceed %d MB", maxCourseUploadSize>>20),
					Error:   http.StatusRequestEntityTooLarge,
				})
				return
			}

			jsonutil.MarshalResponse(w, http.StatusBadRequest, v1.ErrorResponse{
				Message: "failed to parse multipart form",
				Error:   http.StatusBadRequest,
			})
			return
		}

		file, fileHeader, err := r.FormFile("contents")
		if err != nil {
			jsonutil.MarshalResponse(w, http.StatusBadRequest, v1.ErrorResponse{
				Message: "file is required",
				Error:   http.StatusBadRequest,
			})
			return
		}
		defer file.Close()

		contents, err := io.ReadAll(file)
		if err != nil {
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			})
			return
		}

		tag := r.FormValue("course_tag")
		fileName := r.FormValue("file_name")
		if fileName == "" && fileHeader != nil {
			fileName = fileHeader.Filename
		}

		logger.Debugf("received request to upload course file by session id: %d", profile.SessionId)

		course, err := s.db.GetCourse(ctx, tag)

		if err != nil || course == nil {
			logger.Debugf("course with tag %s not found: %v", tag, err)
			errorResponse := v1.ErrorResponse{
				Message: "invalid course tag",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		fileId := strconv.FormatUint(s.generator.Next(), 10)

		fileName = utils.SanitizeFileName(fileName)

		contentType, err := validateCourseMaterial(fileName, contents)
		if err != nil {
			logger.Debugf("invalid course material upload: %v", err)
			jsonutil.MarshalResponse(w, http.StatusBadRequest, v1.ErrorResponse{
				Message: err.Error(),
				Error:   http.StatusBadRequest,
			})
			return
		}

		compressedContents, err := utils.CompressData(contents)

		if err != nil {
			logger.Errorf("failed to compress file contents: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		cacheControl := "max-age=31536000, immutable"
		encoding := "gzip"
		disposition := mime.FormatMediaType("attachment", map[string]string{"filename": fileName})

		err = s.storage.CreateObject(ctx, fileId, &contentType, &cacheControl, &encoding, &disposition, compressedContents)

		if err != nil {
			logger.Errorf("failed to upload file to blob storage: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		err = s.db.InsertCourseFile(ctx, &model.CourseFile{
			ID:        fileId,
			BlobName:  fileId,
			Name:      fileName,
			Type:      contentType,
			Size:      len(compressedContents),
			CourseTag: course.Tag,
			UserId:    profile.UserId,
			SessionId: &profile.SessionId,
		})

		if err != nil {
			logger.Errorf("failed to insert course file record to database: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		w.WriteHeader(http.StatusCreated)

	})
}

func (s *Server) DownloadCourseFile() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		logger := logging.FromContext(ctx)

		fileId := r.URL.Query().Get("fileId")

		logger.Debugf("received request to download course file with id: %s", fileId)

		if fileId == "" {
			errorResponse := v1.ErrorResponse{
				Message: "file id is required",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		blobName, err := s.db.GetCourseFileBlobName(ctx, fileId)

		if err != nil {
			logger.Errorf("failed to get course file blob name with id %s: %v", fileId, err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if blobName == nil {
			logger.Debugf("course file with id %s not found", fileId)
			errorResponse := v1.ErrorResponse{
				Message: "file not found",
				Error:   http.StatusNotFound,
			}
			jsonutil.MarshalResponse(w, http.StatusNotFound, errorResponse)
			return
		}

		ipAddress := utils.GetClientIP(r)

		accessToken, err := s.db.GetAccessToken(ctx, ipAddress)

		if err != nil {
			logger.Errorf("failed to get access token for ip address %s: %v", ipAddress, err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		var queryParams string

		if accessToken == nil {
			logger.Debugf("no access token found for ip address %s", ipAddress)

			expiresOn := time.Now().AddDate(0, 3, 0)
			queryParams, err = s.storage.GenerateSASToken(net.ParseIP(ipAddress), expiresOn)

			if err != nil || queryParams == "" {
				logger.Errorf("failed to generate SAS token for ip address %s: %v", ipAddress, err)
				errorResponse := v1.ErrorResponse{
					Message: "an error occurred. please try again later.",
					Error:   http.StatusInternalServerError,
				}
				jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
				return
			}

			err = s.db.InsertAccessToken(ctx, &model.FileAccessToken{
				ClientAddress: ipAddress,
				QueryParams:   queryParams,
				ExpiresOn:     expiresOn,
				CreatedAt:     time.Now(),
			})

			if err != nil {
				logger.Errorf("failed to insert access token for ip address %s: %v", ipAddress, err)
				errorResponse := v1.ErrorResponse{
					Message: "an error occurred. please try again later.",
					Error:   http.StatusInternalServerError,
				}
				jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
				return
			}
		} else if accessToken.ExpiresOn.Before(time.Now()) {
			logger.Debugf("access token for ip address %s has expired", ipAddress)

			expiresOn := time.Now().AddDate(0, 3, 0)
			queryParams, err = s.storage.GenerateSASToken(net.ParseIP(ipAddress), expiresOn)

			if err != nil || queryParams == "" {
				logger.Errorf("failed to generate SAS token for ip address %s: %v", ipAddress, err)
				errorResponse := v1.ErrorResponse{
					Message: "an error occurred. please try again later.",
					Error:   http.StatusInternalServerError,
				}
				jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
				return
			}

			err = s.db.UpdateAccessToken(ctx, &model.FileAccessToken{
				ClientAddress: ipAddress,
				QueryParams:   queryParams,
				ExpiresOn:     expiresOn,
			})

			if err != nil {
				logger.Errorf("failed to update access token for ip address %s: %v", ipAddress, err)
				errorResponse := v1.ErrorResponse{
					Message: "an error occurred. please try again later.",
					Error:   http.StatusInternalServerError,
				}
				jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
				return
			}

		} else {
			queryParams = accessToken.QueryParams
		}

		downloadUrl := s.storage.FormatSASURL(*blobName, queryParams)

		err = s.db.IncrementCourseFileDownloadCount(ctx, fileId)

		if err != nil {
			logger.Warnf("failed to increment download count for course file with id %s: %v", fileId, err)
		}

		http.Redirect(w, r, downloadUrl, http.StatusSeeOther)
	})
}
