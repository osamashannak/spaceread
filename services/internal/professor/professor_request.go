package professor

import (
	"net/http"
	"strings"

	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/internal/professor/model"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

const (
	maxProfessorRequestNameLength = 120
	maxProfessorRequestTextLength = 500
)

func (s *Server) PrepareProfessorRequest() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		jsonutil.MarshalResponse(w, http.StatusOK, v1.SuccessResponse{
			Success: true,
			Message: "Ready",
		})
	})
}

func (s *Server) RequestProfessor() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		logger := logging.FromContext(ctx)

		profile, ok := s.gateway.GetProfile(ctx)
		if !ok {
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "session missing",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		var request v1.ProfessorRequestBody
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{
				Message: err.Error(),
				Error:   code,
			})
			return
		}

		professorRequest, validationMessage := buildProfessorRequest(int64(s.generator.Next()), profile.SessionId, profile.UserId, request)
		if validationMessage != "" {
			jsonutil.MarshalResponse(w, http.StatusBadRequest, v1.ErrorResponse{
				Message: validationMessage,
				Error:   http.StatusBadRequest,
			})
			return
		}

		if err := s.db.InsertProfessorRequest(ctx, professorRequest); err != nil {
			logger.Errorf("failed to insert professor request: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, v1.ErrorResponse{
				Message: "failed to submit professor request",
				Error:   http.StatusInternalServerError,
			})
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.ProfessorRequestResponse{
			ID:      professorRequest.ID,
			Success: true,
			Message: "Professor request submitted",
		})
	})
}

func buildProfessorRequest(id, sessionId int64, userId *int64, request v1.ProfessorRequestBody) (model.ProfessorRequest, string) {
	professorName := cleanRequired(request.ProfessorName)
	university := cleanRequired(request.University)

	if professorName == "" {
		return model.ProfessorRequest{}, "professor_name is required"
	}
	if university == "" {
		return model.ProfessorRequest{}, "university is required"
	}
	if len(professorName) > maxProfessorRequestNameLength {
		return model.ProfessorRequest{}, "professor_name is too long"
	}
	if len(university) > maxProfessorRequestNameLength {
		return model.ProfessorRequest{}, "university is too long"
	}

	email := cleanOptionalLower(request.ProfessorEmail)
	college := cleanOptional(request.College)

	for _, value := range []*string{email, college} {
		if value != nil && len(*value) > maxProfessorRequestTextLength {
			return model.ProfessorRequest{}, "one of the submitted fields is too long"
		}
	}

	if email != nil && !isValidEmailHint(*email) {
		return model.ProfessorRequest{}, "professor_email must be a valid email"
	}

	return model.ProfessorRequest{
		ID:            id,
		ProfessorName: professorName,
		ProfessorEmail: email,
		University:    university,
		College:       college,
		SessionId:     sessionId,
		UserId:        userId,
	}, ""
}

func cleanRequired(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func cleanOptional(value *string) *string {
	if value == nil {
		return nil
	}

	cleaned := strings.TrimSpace(*value)
	if cleaned == "" {
		return nil
	}

	return &cleaned
}

func cleanOptionalLower(value *string) *string {
	cleaned := cleanOptional(value)
	if cleaned == nil {
		return nil
	}

	lower := strings.ToLower(*cleaned)
	return &lower
}

func isValidEmailHint(value string) bool {
	if strings.ContainsAny(value, " \t\r\n") {
		return false
	}

	at := strings.Index(value, "@")
	return at > 0 && at < len(value)-1 && strings.Contains(value[at+1:], ".")
}
