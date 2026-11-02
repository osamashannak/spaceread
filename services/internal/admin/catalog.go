package admin

import (
	"errors"
	"net/http"
	"net/mail"
	"sort"
	"strings"
	"time"

	admindb "github.com/osamashannak/uaeu-space/services/internal/admin/database"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

const (
	defaultCatalogLimit = 50
	maxCatalogLimit     = 200
	maxCatalogTextLen   = 200
	maxProfessorAliases = 20
	maxProfessorCourses = 200
)

func (s *Server) ListCatalogProfessors() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		result, err := s.db.ListCatalogProfessors(r.Context(), admindb.ListCatalogProfessorOptions{
			Limit:      parseBoundedInt(query.Get("limit"), defaultCatalogLimit, 1, maxCatalogLimit),
			Offset:     parseBoundedInt(query.Get("offset"), 0, 0, 1_000_000),
			Search:     strings.TrimSpace(query.Get("search")),
			Visible:    parseBoolChoiceQuery(r, "visible", "visible", "hidden"),
			University: strings.TrimSpace(query.Get("university")),
			Sort:       parseChoiceQuery(r, "sort", "reviews", "reviews", "views", "name", "fewest_reviews"),
		})
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to list professors: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to list professors")
			return
		}
		jsonutil.MarshalResponse(w, http.StatusOK, result)
	})
}

func (s *Server) GetCatalogProfessor() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		professor, err := s.db.GetCatalogProfessor(r.Context(), r.PathValue("email"))
		if err != nil {
			s.writeCatalogError(w, r, err, "failed to load professor")
			return
		}
		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminCatalogProfessorResponse{Professor: *professor})
	})
}

func (s *Server) UpdateCatalogProfessor() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request v1.AdminCatalogProfessorUpdateRequest
		if code, err := jsonutil.Unmarshal(w, r, &request); err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		name, nameOK := requiredCatalogText(*request.Name)
		college, collegeOK := requiredCatalogText(*request.College)
		university, universityOK := requiredCatalogText(*request.University)
		if !nameOK || !collegeOK || !universityOK {
			writeError(w, http.StatusBadRequest, "name, college and university are required (max 200 characters)")
			return
		}
		aliases := cleanList(request.Aliases, func(value string) string { return strings.Join(strings.Fields(value), " ") })
		courseTags := cleanList(request.CourseTags, func(value string) string { return strings.ToUpper(strings.TrimSpace(value)) })
		if len(aliases) > maxProfessorAliases || len(courseTags) > maxProfessorCourses {
			writeError(w, http.StatusBadRequest, "too many aliases or courses")
			return
		}

		reasonCode := cleanOptionalText(request.ReasonCode)
		if !s.validReason(w, r, reasonCode) {
			return
		}

		professor, err := s.db.UpdateCatalogProfessor(r.Context(), admindb.CatalogProfessorUpdate{
			Email:       r.PathValue("email"),
			Name:        name,
			College:     college,
			University:  university,
			Aliases:     aliases,
			Visible:     *request.Visible,
			CourseTags:  courseTags,
			ActorUserID: s.actorUserID(r.Context()),
			ReasonCode:  reasonCode,
			Note:        cleanOptionalText(request.Note),
		})
		if err != nil {
			s.writeCatalogError(w, r, err, "failed to update professor")
			return
		}
		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminCatalogProfessorResponse{Professor: *professor})
	})
}

func (s *Server) MergeCatalogProfessor() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		var request v1.AdminCatalogProfessorMergeRequest
		if code, err := jsonutil.Unmarshal(w, r, &request); err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}
		target := strings.TrimSpace(*request.TargetEmail)
		if _, err := mail.ParseAddress(target); err != nil {
			writeError(w, http.StatusBadRequest, "target_email must be a valid email address")
			return
		}

		professor, movedReviewIDs, err := s.db.MergeCatalogProfessors(ctx, admindb.CatalogProfessorMerge{
			SourceEmail: r.PathValue("email"),
			TargetEmail: target,
			ActorUserID: s.actorUserID(ctx),
			Note:        cleanOptionalText(request.Note),
		})
		if err != nil {
			s.writeCatalogError(w, r, err, "failed to merge professors")
			return
		}
		if _, err := s.db.RecomputeReviewRatingSortIndexes(ctx, movedReviewIDs, time.Now()); err != nil {
			logging.FromContext(ctx).Warnf("professors merged, but moved review ranks could not be refreshed: %v", err)
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminCatalogProfessorMergeResponse{
			Professor:        *professor,
			MovedReviewCount: int64(len(movedReviewIDs)),
		})
	})
}

func (s *Server) ListCatalogCourses() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		result, err := s.db.ListCatalogCourses(r.Context(), admindb.ListCatalogCourseOptions{
			Limit:  parseBoundedInt(query.Get("limit"), defaultCatalogLimit, 1, maxCatalogLimit),
			Offset: parseBoundedInt(query.Get("offset"), 0, 0, 1_000_000),
			Search: strings.TrimSpace(query.Get("search")),
			Sort:   parseChoiceQuery(r, "sort", "views", "views", "files", "tag"),
		})
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to list courses: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to list courses")
			return
		}
		jsonutil.MarshalResponse(w, http.StatusOK, result)
	})
}

func (s *Server) UpdateCatalogCourse() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request v1.AdminCatalogCourseUpdateRequest
		if code, err := jsonutil.Unmarshal(w, r, &request); err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}
		name, ok := requiredCatalogText(*request.Name)
		if !ok {
			writeError(w, http.StatusBadRequest, "name is required (max 200 characters)")
			return
		}

		course, err := s.db.UpdateCatalogCourse(r.Context(), admindb.CatalogCourseUpdate{
			Tag:         r.PathValue("tag"),
			Name:        name,
			ActorUserID: s.actorUserID(r.Context()),
			Note:        cleanOptionalText(request.Note),
		})
		if err != nil {
			s.writeCatalogError(w, r, err, "failed to update course")
			return
		}
		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminCatalogCourseResponse{Course: *course})
	})
}

func (s *Server) GetQueueCounts() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		counts, err := s.db.GetQueueCounts(r.Context())
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to load queue counts: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to load queue counts")
			return
		}
		jsonutil.MarshalResponse(w, http.StatusOK, counts)
	})
}

func (s *Server) writeCatalogError(w http.ResponseWriter, r *http.Request, err error, message string) {
	switch {
	case errors.Is(err, admindb.ErrNotFound):
		writeError(w, http.StatusNotFound, "not found")
	case errors.Is(err, admindb.ErrConflict):
		writeError(w, http.StatusBadRequest, "a professor cannot be merged into itself")
	case errors.Is(err, admindb.ErrInvalidCourse):
		writeError(w, http.StatusBadRequest, err.Error())
	default:
		logging.FromContext(r.Context()).Errorf("%s: %v", message, err)
		writeError(w, http.StatusInternalServerError, message)
	}
}

func requiredCatalogText(value string) (string, bool) {
	cleaned := strings.Join(strings.Fields(value), " ")
	return cleaned, cleaned != "" && len(cleaned) <= maxCatalogTextLen
}

// cleanList normalizes, drops empty and duplicate entries, and sorts.
func cleanList(values []string, normalize func(string) string) []string {
	seen := make(map[string]struct{}, len(values))
	cleaned := make([]string, 0, len(values))
	for _, value := range values {
		value = normalize(value)
		if value == "" || len(value) > maxCatalogTextLen {
			continue
		}
		key := strings.ToLower(value)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		cleaned = append(cleaned, value)
	}
	sort.Strings(cleaned)
	return cleaned
}
