package professor

import (
	"encoding/json"
	"errors"
	"fmt"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/internal/professor/model"
	"github.com/osamashannak/uaeu-space/services/internal/professor/policywarning"
	"github.com/osamashannak/uaeu-space/services/internal/professor/ranking"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/osamashannak/uaeu-space/services/pkg/subnetchecker"
	"github.com/osamashannak/uaeu-space/services/pkg/utils"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (s *Server) PostReview() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		logger := logging.FromContext(ctx)

		logger.Debugf("received request to post review")

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

		var request v1.ReviewPostBody
		code, err := jsonutil.Unmarshal(w, r, &request)

		if err != nil {
			logger.Debugf("failed to unmarshal request: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: err.Error(),
				Error:   code,
			}
			jsonutil.MarshalResponse(w, code, errorResponse)
			return
		}

		assessment, err := s.recaptcha.Verify(ctx, *request.RecaptchaToken, utils.GetClientIP(r), r.UserAgent())

		if err != nil {
			logger.Errorf("recaptcha verification failed: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error has occurred. please try again later.",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		if !assessment {
			logger.Debugf("recaptcha verification failed: %v", assessment)
			errorResponse := v1.ErrorResponse{
				Message: "recaptcha verification failed",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		professor, err := s.db.GetProfessor(ctx, *request.ProfessorEmail)

		if err != nil {
			logger.Errorf("failed to get professor: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error has occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if professor == nil {
			logger.Debugf("professor not found: %s", *request.ProfessorEmail)
			errorResponse := v1.ErrorResponse{
				Message: "professor not found",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		existingReview, err := s.db.ExistsReviewIdentity(ctx, *request.ProfessorEmail, profile.SessionId, profile.UserId)

		if err != nil {
			logger.Errorf("failed to check existing review: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error has occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if existingReview {
			logger.Debugf("user has already reviewed this professor: %s", *request.ProfessorEmail)
			errorResponse := v1.ErrorResponse{
				Message: "you have already reviewed this professor",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		if *request.Score < 1 || *request.Score > 5 {
			logger.Debugf("invalid score: %d", request.Score)
			errorResponse := v1.ErrorResponse{
				Message: "score must be between 1 and 5",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		if professor.University == "United Arab Emirates University" {
			if *request.GradeReceived != "" && !utils.IsValidGrade(*request.GradeReceived) {
				errorResponse := v1.ErrorResponse{
					Message: "invalid grade received",
					Error:   http.StatusBadRequest,
				}
				jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
				return
			}

			if *request.CourseTaken == "" || !utils.IsValidCourseCode(*request.CourseTaken) {
				errorResponse := v1.ErrorResponse{
					Message: "invalid course taken",
					Error:   http.StatusBadRequest,
				}
				jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
				return
			}
		} else {
			request.GradeReceived = nil
			request.CourseTaken = nil
		}

		request.Text = utils.ReviewTextCleaner(request.Text)

		var attachmentInfo *v1.ReviewAttachment

		if request.Attachment != nil {
			attachment, err := s.db.GetReviewAttachment(ctx, *request.Attachment)

			if err != nil || attachment == nil {
				logger.Debugf("failed to get review attachment: %v", err)
			} else {
				logger.Debugf("review attachment: %v", attachment)
				attachmentInfo = &v1.ReviewAttachment{
					ID:     attachment.ID,
					Height: attachment.Height,
					Width:  attachment.Width,
					URL:    s.storage.FormatSASURL(attachment.BlobName, ""),
				}
			}
		}

		var gif *string

		if request.Gif != nil {
			if attachmentInfo != nil {
				logger.Debugf("both attachment and gif provided, only one is allowed")
				errorResponse := v1.ErrorResponse{
					Message: "only one of attachment or gif can be provided",
					Error:   http.StatusBadRequest,
				}
				jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
				return
			}

			if !utils.IsValidGIFURL(*request.Gif) {
				logger.Debugf("invalid gif URL: %s", *request.Gif)
				errorResponse := v1.ErrorResponse{
					Message: "gif must be a valid GIF provider URL",
					Error:   http.StatusBadRequest,
				}
				jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
				return
			} else {
				gif = request.Gif
			}
		}

		if request.Text == "" && attachmentInfo == nil && gif == nil {
			logger.Debugf("review text is empty")
			errorResponse := v1.ErrorResponse{
				Message: "review cannot be empty",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		flags := s.perspective.Analyze(request.Text)

		logger.Debugf("perspective analysis result: %+v", flags)

		moderationWarning := policywarning.ReviewModerationWarning(request.Text, flags.Flagged())

		ipAddress := utils.GetClientIP(r)
		now := time.Now()
		browserFingerprint, thumbmarkFingerprint, creepFingerprint := sanitizeClientFingerprint(request.ClientFingerprint)

		review := model.Review{
			ID:                   int64(s.generator.Next()),
			Score:                *request.Score,
			Positive:             *request.Positive,
			Content:              request.Text,
			CourseTaken:          request.CourseTaken,
			GradeReceived:        request.GradeReceived,
			ProfessorEmail:       *request.ProfessorEmail,
			UaeuOrigin:           subnetchecker.CheckIP(ipAddress),
			Visible:              moderationWarning == nil,
			Language:             flags.Language,
			IpAddress:            ipAddress,
			SessionId:            &profile.SessionId,
			UserId:               profile.UserId,
			CreatedAt:            now,
			Gif:                  gif,
			BrowserFingerprint:   browserFingerprint,
			ThumbmarkFingerprint: thumbmarkFingerprint,
			CreepFingerprint:     creepFingerprint,
		}

		if attachmentInfo != nil {
			review.Attachment = &attachmentInfo.ID
		} else {
			review.Attachment = nil
		}

		review.SortIndex = ranking.Compute(ranking.Review{
			ID:                review.ID,
			Score:             review.Score,
			Content:           review.Content,
			ProfessorEmail:    review.ProfessorEmail,
			CourseTaken:       review.CourseTaken,
			GradeReceived:     review.GradeReceived,
			CreatedAtUnixHour: now.Unix() / int64(time.Hour/time.Second),
			NowUnixHour:       now.Unix() / int64(time.Hour/time.Second),
			Visible:           review.Visible,
			UaeuOrigin:        review.UaeuOrigin,
			HasAttachment:     review.Attachment != nil,
			HasGif:            review.Gif != nil,
		}).SortIndex

		err = s.db.InsertReview(ctx, &review)

		if err != nil {
			logger.Errorf("failed to insert review: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error has occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		s.refreshReviewAndBurstRanks(ctx, review.ID)
		if sortIndex, ok, err := s.db.GetReviewSortIndex(ctx, review.ID); err != nil {
			logger.Warnf("failed to reload review sort index for %d: %v", review.ID, err)
		} else if ok {
			review.SortIndex = sortIndex
		}

		var flagged *bool
		if !review.Visible {
			val := true
			flagged = &val
		}

		var response = v1.ReviewPostResponse{
			SortIndex:     review.SortIndex,
			Text:          review.Content,
			Score:         review.Score,
			Positive:      review.Positive,
			Attachment:    attachmentInfo,
			ID:            review.ID,
			Flagged:       flagged,
			Warning:       moderationWarning,
			Language:      review.Language,
			CourseTaken:   review.CourseTaken,
			GradeReceived: review.GradeReceived,
			CreatedAt:     review.CreatedAt,
		}

		logger.Debugf("review posted successfully: %+v", response)

		jsonutil.MarshalResponse(w, http.StatusCreated, response)

	})
}

func sanitizeClientFingerprint(input *v1.ClientFingerprintBody) (*string, *string, *string) {
	const (
		maxComponents       = 4
		maxFingerprintLen   = 256
		maxVersionLen       = 80
		maxGeneratedAtLen   = 80
		maxErrorLen         = 200
		maxSignals          = 24
		maxSignalKeyLen     = 64
		maxSignalStringLen  = 180
		maxFingerprintBytes = 12_000
	)

	if input == nil || len(input.Components) == 0 {
		return nil, nil, nil
	}

	sanitized := v1.ClientFingerprintBody{
		Version:     trimClientFingerprintString(input.Version, maxVersionLen),
		GeneratedAt: trimClientFingerprintString(input.GeneratedAt, maxGeneratedAtLen),
		Components:  make([]v1.ClientFingerprintComponentBody, 0, len(input.Components)),
	}

	var thumbmarkFingerprint *string
	var creepFingerprint *string

	for _, component := range input.Components {
		if len(sanitized.Components) >= maxComponents {
			break
		}

		source := strings.ToLower(strings.TrimSpace(component.Source))
		if source != "thumbmark" && source != "creep" {
			continue
		}

		fingerprint := trimClientFingerprintString(component.Fingerprint, maxFingerprintLen)
		if fingerprint == "" {
			continue
		}

		sanitizedComponent := v1.ClientFingerprintComponentBody{
			Source:      source,
			Fingerprint: fingerprint,
			Signals:     sanitizeClientFingerprintSignals(component.Signals, maxSignals, maxSignalKeyLen, maxSignalStringLen),
		}

		if component.Version != nil {
			version := trimClientFingerprintString(*component.Version, maxVersionLen)
			if version != "" {
				sanitizedComponent.Version = &version
			}
		}

		if component.DurationMS != nil && *component.DurationMS >= 0 && *component.DurationMS <= 10_000 {
			duration := *component.DurationMS
			sanitizedComponent.DurationMS = &duration
		}

		if component.Error != nil {
			errMessage := trimClientFingerprintString(*component.Error, maxErrorLen)
			if errMessage != "" {
				sanitizedComponent.Error = &errMessage
			}
		}

		if source == "thumbmark" && thumbmarkFingerprint == nil {
			thumbmarkFingerprint = clientFingerprintStringPtr(fingerprint)
		}
		if source == "creep" && creepFingerprint == nil {
			creepFingerprint = clientFingerprintStringPtr(fingerprint)
		}

		sanitized.Components = append(sanitized.Components, sanitizedComponent)
	}

	if len(sanitized.Components) == 0 {
		return nil, nil, nil
	}

	payload, err := json.Marshal(sanitized)
	if err != nil {
		return nil, thumbmarkFingerprint, creepFingerprint
	}

	if len(payload) > maxFingerprintBytes {
		for i := range sanitized.Components {
			sanitized.Components[i].Signals = nil
			sanitized.Components[i].Error = nil
		}
		payload, err = json.Marshal(sanitized)
		if err != nil || len(payload) > maxFingerprintBytes {
			return nil, thumbmarkFingerprint, creepFingerprint
		}
	}

	payloadString := string(payload)
	return &payloadString, thumbmarkFingerprint, creepFingerprint
}

func sanitizeClientFingerprintSignals(signals map[string]any, maxSignals, maxKeyLen, maxStringLen int) map[string]any {
	if len(signals) == 0 {
		return nil
	}

	sanitized := make(map[string]any, min(len(signals), maxSignals))
	for key, value := range signals {
		if len(sanitized) >= maxSignals {
			break
		}

		cleanKey := trimClientFingerprintString(key, maxKeyLen)
		if cleanKey == "" {
			continue
		}

		switch val := value.(type) {
		case nil:
			sanitized[cleanKey] = nil
		case bool:
			sanitized[cleanKey] = val
		case float64:
			sanitized[cleanKey] = val
		case string:
			sanitized[cleanKey] = trimClientFingerprintString(val, maxStringLen)
		}
	}

	if len(sanitized) == 0 {
		return nil
	}
	return sanitized
}

func trimClientFingerprintString(value string, maxLen int) string {
	value = strings.TrimSpace(value)
	if len(value) <= maxLen {
		return value
	}
	return value[:maxLen]
}

func clientFingerprintStringPtr(value string) *string {
	return &value
}

func (s *Server) DeleteReview() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		logger := logging.FromContext(ctx)

		profile, ok := s.gateway.GetProfile(ctx)

		if !ok {
			errorResponse := v1.ErrorResponse{
				Message: "session missing",
				Error:   http.StatusUnauthorized,
			}
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, errorResponse)
			return
		}

		reviewIdStr := r.URL.Query().Get("reviewId")

		if reviewIdStr == "" {
			errorResponse := v1.ErrorResponse{
				Message: "missing reviewId parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		reviewId, err := strconv.ParseInt(reviewIdStr, 10, 64)

		if err != nil {
			errorResponse := v1.ErrorResponse{
				Message: "invalid reviewId format",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		review, err := s.db.GetReview(ctx, reviewId)

		if err != nil || review == nil {
			errorResponse := v1.ErrorResponse{
				Message: "review not found",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		ownedBySession := review.SessionId != nil && *review.SessionId == profile.SessionId
		ownedByUser := review.UserId != nil && profile.UserId != nil && *review.UserId == *profile.UserId
		if !ownedBySession && !ownedByUser {
			errorResponse := v1.ErrorResponse{
				Message: "you are not allowed to delete this review",
				Error:   http.StatusForbidden,
			}
			jsonutil.MarshalResponse(w, http.StatusForbidden, errorResponse)
			return
		}

		err = s.db.SoftDeleteReview(ctx, reviewId)

		if err != nil {
			logger.Errorf("failed to delete review: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to delete review",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.SuccessResponse{
			Message: "review deleted successfully",
			Success: true,
		})

	})
}

func (s *Server) TranslateReview() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		logger := logging.FromContext(ctx)

		reviewIdStr := r.URL.Query().Get("reviewId")

		logger.Debugf("received request to translate review with ID: %s", reviewIdStr)

		if reviewIdStr == "" {
			logger.Debugf("missing reviewId parameter")
			errorResponse := v1.ErrorResponse{
				Message: "missing reviewId parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		reviewId, err := strconv.ParseInt(reviewIdStr, 10, 64)

		if err != nil {
			errorResponse := v1.ErrorResponse{
				Message: "invalid reviewId format",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		review, err := s.db.GetReview(ctx, reviewId)

		if err != nil {
			logger.Errorf("failed to get review: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to get review",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if review == nil {
			logger.Debugf("review not found: %d", reviewId)
			errorResponse := v1.ErrorResponse{
				Message: "review not found",
				Error:   http.StatusNotFound,
			}
			jsonutil.MarshalResponse(w, http.StatusNotFound, errorResponse)
			return
		}

		translation, err := s.db.GetTranslatedReview(ctx, reviewId)

		if err != nil {
			logger.Errorf("failed to get translation: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error has occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if translation != nil {
			logger.Debugf("translation found for review ID: %d", reviewId)
			jsonutil.MarshalResponse(w, http.StatusOK, &v1.ReviewTranslationResponse{
				Content: translation.TranslatedText,
				Target:  translation.Target,
			})
			return
		}

		if review.Language == "en" {
			logger.Debugf("review is already in English, no translation needed")
			errorResponse := v1.ErrorResponse{
				Message: "review is already in English, no translation needed",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		translatedText, err := s.translate.TranslateToEnglish(ctx, review.Content)

		if err != nil {
			logger.Errorf("failed to translate review: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to translate review",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		err = s.db.InsertReviewTranslation(ctx, &model.ReviewTranslation{
			ReviewId:       review.ID,
			TranslatedText: translatedText,
			Target:         "en",
		})

		if err != nil {
			logger.Errorf("failed to insert translation: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to insert translation",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		logger.Debugf("translation inserted successfully for review ID: %d", reviewId)

		jsonutil.MarshalResponse(w, http.StatusOK, &v1.ReviewTranslationResponse{
			Content: translatedText,
			Target:  "en",
		})

	})
}

func (s *Server) ReportReview() http.Handler {
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

		var request v1.ReviewReportBody
		code, err := jsonutil.Unmarshal(w, r, &request)

		if err != nil {
			logger.Debugf("failed to unmarshal request: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: err.Error(),
				Error:   code,
			}
			jsonutil.MarshalResponse(w, code, errorResponse)
			return
		}

		logger.Debugf("received request to translate review with ID: %d", request.ReviewID)

		review, err := s.db.GetReview(ctx, request.ReviewID)

		if err != nil {
			logger.Errorf("failed to get review: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to get review",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if review == nil {
			logger.Debugf("review not found: %d", request.ReviewID)
			errorResponse := v1.ErrorResponse{
				Message: "review not found",
				Error:   http.StatusNotFound,
			}
			jsonutil.MarshalResponse(w, http.StatusNotFound, errorResponse)
			return
		}

		err = s.db.InsertReviewReport(ctx, &model.ReviewReport{
			ID:        int64(s.generator.Next()),
			ReviewId:  review.ID,
			Reason:    request.Reason,
			SessionId: profile.SessionId,
		})

		if err != nil {
			logger.Errorf("failed to insert review report: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to report review",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		s.refreshReviewRank(ctx, review.ID)

		logger.Debugf("review reported successfully: %d", request.ReviewID)

		jsonutil.MarshalResponse(w, http.StatusOK, v1.SuccessResponse{
			Message: "review reported successfully",
			Success: true,
		})

	})
}

func (s *Server) UploadReviewAttachment() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		const maxUploadSize = 64 << 20 // 64 megabytes

		r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
		ctx := r.Context()
		logger := logging.FromContext(ctx)

		logger.Debugf("received request to upload review attachment")

		if err := r.ParseMultipartForm(maxUploadSize); err != nil {
			var maxBytesErr *http.MaxBytesError
			if errors.As(err, &maxBytesErr) {
				logger.Debugf("file size exceeds limit: %v", err)
				errorResponse := v1.ErrorResponse{
					Message: fmt.Sprintf("file size cannot exceed %d MB", maxUploadSize>>20),
					Error:   http.StatusRequestEntityTooLarge,
				}
				jsonutil.MarshalResponse(w, http.StatusRequestEntityTooLarge, errorResponse)
			} else {
				logger.Errorf("failed to parse multipart form: %v", err)
				errorResponse := v1.ErrorResponse{
					Message: "failed to parse multipart form",
					Error:   http.StatusBadRequest,
				}
				jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			}
			return
		}

		file, _, err := r.FormFile("file")
		if err != nil {
			logger.Debugf("failed to get 'file' from form: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to get 'file' from form",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}
		defer file.Close()

		fileBytes, err := io.ReadAll(file)
		if err != nil {
			logger.Errorf("failed to read file content: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		contentType := http.DetectContentType(fileBytes)
		extension, ok := utils.GetValidExtension(contentType)

		if !ok {
			logger.Debugf("invalid file type: %s", contentType)
			errorResponse := v1.ErrorResponse{
				Message: fmt.Sprintf("invalid file type '%s'. only jpeg, png, and gif are allowed", contentType),
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		if contentType != "image/gif" {
			fileBytes, contentType, err = utils.ProcessImageFile(fileBytes)
			if err != nil {
				logger.Errorf("failed to process image file: %v", err)
				errorResponse := v1.ErrorResponse{
					Message: "an error occurred. please try again later.",
					Error:   http.StatusInternalServerError,
				}
				jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
				return
			}
		}

		imageBounds, err := utils.GetImageBounds(fileBytes)

		if err != nil {
			logger.Errorf("failed to get image bounds: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		attachmentId := int64(s.generator.Next())
		finalBlobName := fmt.Sprintf("%d%s", attachmentId, extension)
		cacheControl := "public, max-age=604800"

		err = s.storage.CreateObject(ctx, finalBlobName, &contentType, &cacheControl, nil, nil, fileBytes)
		if err != nil {
			logger.Errorf("failed to save file to storage: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		blobUrl := s.storage.FormatSASURL(finalBlobName, "")

		safety, err := s.vision.AnalyzeImageSafety(blobUrl)

		attachment := model.ReviewAttachment{
			ID:        attachmentId,
			MimeType:  contentType,
			Size:      len(fileBytes),
			Width:     imageBounds.Width,
			Height:    imageBounds.Height,
			Visible:   err == nil && safety.IsSafe(),
			BlobName:  finalBlobName,
			IpAddress: utils.GetClientIP(r),
		}

		err = s.db.InsertReviewAttachment(ctx, &attachment)

		if err != nil {
			logger.Errorf("failed to insert review attachment: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		response := v1.ReviewAttachmentResponse{
			ID: attachmentId,
		}

		logger.Debugf("review attachment uploaded successfully: %+v", response)

		jsonutil.MarshalResponse(w, http.StatusCreated, response)

	})
}

func (s *Server) AddReviewRating() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		logger := logging.FromContext(ctx)

		logger.Debugf("received request to add review rating")

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

		var request v1.ReviewRatingBody
		code, err := jsonutil.Unmarshal(w, r, &request)

		if err != nil {
			logger.Errorf("failed to unmarshal request: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: err.Error(),
				Error:   code,
			}
			jsonutil.MarshalResponse(w, code, errorResponse)
			return
		}

		review, err := s.db.GetReview(ctx, request.ReviewID)

		if err != nil {
			logger.Errorf("failed to get review: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error has occurred from our end. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if review == nil {
			logger.Debugf("review not found: %d", request.ReviewID)
			errorResponse := v1.ErrorResponse{
				Message: "review not found",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		existingRating, err := s.db.ExistsReviewRatingFromIdentity(ctx, request.ReviewID, profile.SessionId, profile.UserId)

		if err != nil {
			logger.Errorf("failed to check existing rating: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error has occurred from our end. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if *existingRating {
			logger.Debugf("user has already rated this review: %d", request.ReviewID)
			errorResponse := v1.ErrorResponse{
				Message: "you have already rated this review",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		var value *bool

		if request.Rating == "like" {
			val := true
			value = &val
		} else if request.Rating == "dislike" {
			val := false
			value = &val
		} else {
			logger.Debugf("invalid rating: %s", request.Rating)
			errorResponse := v1.ErrorResponse{
				Message: "invalid rating, must be 'like' or 'dislike'",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		rating := model.ReviewRating{
			ReviewId:  request.ReviewID,
			SessionId: profile.SessionId,
			UserId:    profile.UserId,
			Value:     *value,
			IpAddress: utils.GetClientIP(r),
		}

		err = s.db.InsertReviewRating(ctx, &rating)

		if err != nil {
			logger.Errorf("failed to insert review rating: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error has occurred from our end. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		s.refreshReviewRank(ctx, request.ReviewID)

		logger.Debugf("review rating added successfully for review ID: %d", request.ReviewID)

		jsonutil.MarshalResponse(w, http.StatusCreated, v1.SuccessResponse{
			Success: ok,
			Message: fmt.Sprintf("review %d rated successfully", request.ReviewID),
		})

	})
}

func (s *Server) DeleteReviewRating() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		logger := logging.FromContext(ctx)

		logger.Debugf("received request to delete review rating")

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

		reviewId := r.URL.Query().Get("reviewId")

		if reviewId == "" {
			errorResponse := v1.ErrorResponse{
				Message: "missing reviewId parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		reviewIdInt, err := strconv.ParseInt(reviewId, 10, 64)

		if err != nil {
			logger.Errorf("failed to parse reviewId: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "invalid reviewId format",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		existingRating, err := s.db.ExistsReviewRatingFromIdentity(ctx, reviewIdInt, profile.SessionId, profile.UserId)

		if err != nil {
			logger.Errorf("failed to check existing rating: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error has occurred from our end. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if !*existingRating {
			logger.Debugf("user has not rated this review: %s", reviewId)
			errorResponse := v1.ErrorResponse{
				Message: "you have not rated this review",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		err = s.db.DeleteReviewRating(ctx, reviewIdInt, profile.SessionId, profile.UserId)

		if err != nil {
			logger.Errorf("failed to delete review rating: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error has occurred from our end. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		s.refreshReviewRank(ctx, reviewIdInt)

		logger.Debugf("review rating deleted successfully for review ID: %s", reviewId)

		jsonutil.MarshalResponse(w, http.StatusOK, v1.SuccessResponse{
			Success: true,
			Message: fmt.Sprintf("review %s rating deleted successfully", reviewId),
		})
	})
}
