package professor

import (
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"net/http"
)

func (s *Server) GetAll() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		logger := logging.FromContext(ctx)

		university := r.URL.Query().Get("university")

		logger.Debugf("received request to get professors for university: %s", university)

		if university == "" {
			university = "United Arab Emirates University"
		}

		if cached, ok := s.cache.Get(university); ok {
			logger.Debugf("returning cached professors for university: %s", university)
			jsonutil.MarshalResponse(w, http.StatusOK, cached)
			return
		}

		professors, err := s.db.GetProfessors(ctx, university)
		if err != nil {
			logger.Errorf("failed to get professors for university %s: %v", university, err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to get professors",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		logger.Debugf("caching professors for university: %s", university)
		s.cache.Set(university, professors)

		jsonutil.MarshalResponse(w, http.StatusOK, professors)
	})
}

func (s *Server) Get() http.Handler {
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

		email := r.URL.Query().Get("email")

		logger.Debugf("received request to get professor with email: %s", email)

		if email == "" {
			logger.Debug("missing email parameter in request")
			errorResponse := v1.ErrorResponse{
				Message: "missing email parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		professor, err := s.db.GetProfessor(ctx, email)

		if err != nil {
			logger.Errorf("failed to get professor with email %s: %v", email, err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to get professor",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if professor == nil {
			logger.Debugf("professor with email %s not found", email)
			errorResponse := v1.ErrorResponse{
				Message: "professor not found",
				Error:   http.StatusNotFound,
			}
			jsonutil.MarshalResponse(w, http.StatusNotFound, errorResponse)
			return
		}

		reviews, averageScore, sessions, reviewed, err := s.db.GetProfessorReviews(ctx, profile.SessionId, profile.UserId, professor.Email)

		if err != nil {
			logger.Errorf("failed to get reviews for professor with email %s: %v", email, err)
			errorResponse := v1.ErrorResponse{
				Message: "an error happened. try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		logger.Debugf("successfully retrieved reviews for professor with email %s", professor.Email)

		var similarProfessor []v1.SimilarProfessor

		if cached, ok := s.similarProfCache.Get(professor.Email); ok {
			logger.Debugf("returning cached similar professors for email: %s", professor.Email)
			similarProfessor = cached
		} else {
			similarProfessor, err = s.db.GetSimilarProfessors(ctx, *sessions, professor.Email, professor.University)
			if err != nil {
				logger.Errorf("failed to get similar professors for %s: %v", professor.Email, err)
				errorResponse := v1.ErrorResponse{
					Message: "an error happened. try again later.",
					Error:   http.StatusInternalServerError,
				}
				jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
				return
			}
			s.similarProfCache.Set(professor.Email, similarProfessor)
		}

		var courses []string

		if cached, ok := s.courseCache.Get(professor.Email); ok {
			logger.Debugf("returning cached courses for email: %s", professor.Email)
			courses = cached
		} else {
			courses, err = s.db.GetProfessorCourses(ctx, professor.Email)
			if err != nil {
				logger.Errorf("failed to get courses for professor %s: %v", email, err)
				courses = []string{}
			}
			s.courseCache.Set(professor.Email, courses)
		}

		response := v1.ProfessorResponse{
			Email:             professor.Email,
			Name:              professor.Name,
			University:        professor.University,
			College:           professor.College,
			Reviews:           *reviews,
			SimilarProfessors: similarProfessor,
			Score:             *averageScore,
			Reviewed:          *reviewed,
			Courses:           courses,
		}

		jsonutil.MarshalResponse(w, http.StatusOK, response)
	})
}
