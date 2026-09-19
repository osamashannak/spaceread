package admin

import (
	"errors"
	"net/http"
	"net/mail"
	"strings"

	admindb "github.com/osamashannak/uaeu-space/services/internal/admin/database"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

const (
	defaultProfessorRequestLimit = 50
	maxProfessorRequestLimit     = 100
)

var (
	errInvalidProfessorRequestDecision = errors.New("decision must be approve, reject, dismiss, or mark_duplicate")
	errProfessorNameRequired           = errors.New("professor_name is required for approval")
	errProfessorEmailRequired          = errors.New("professor_email is required for approval")
	errProfessorUniversityRequired     = errors.New("university is required for approval")
	errProfessorCollegeRequired        = errors.New("college is required for approval")
	errResolvedProfessorEmailRequired  = errors.New("resolved_professor_email is required when marking a duplicate")
	errInvalidProfessorEmail           = errors.New("professor_email must be a valid email address")
	errInvalidResolvedProfessorEmail   = errors.New("resolved_professor_email must be a valid email address")
)

func (s *Server) ListProfessorRequests() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limit := parseBoundedInt(r.URL.Query().Get("limit"), defaultProfessorRequestLimit, 1, maxProfessorRequestLimit)
		offset := parseBoundedInt(r.URL.Query().Get("offset"), 0, 0, 1_000_000)
		status := parseChoiceQuery(r, "status", "pending", "pending", "approved", "rejected", "dismissed", "all")
		duplicate := parseChoiceQuery(r, "duplicate", "all", "all", "likely", "not_likely")

		result, err := s.db.ListProfessorRequests(r.Context(), admindb.ListProfessorRequestOptions{
			Limit:     limit,
			Offset:    offset,
			Status:    status,
			Duplicate: duplicate,
			Search:    strings.TrimSpace(r.URL.Query().Get("search")),
		})
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to list professor requests: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to list professor requests")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminProfessorRequestListResponse{
			Requests:        result.Requests,
			Limit:           limit,
			Offset:          offset,
			Total:           result.Total,
			GroupTotal:      result.GroupTotal,
			StatusCounts:    result.StatusCounts,
			DuplicateCounts: result.DuplicateCounts,
		})
	})
}

func (s *Server) GetProfessorRequest() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID, ok := parsePathID(w, r, "requestID")
		if !ok {
			return
		}

		request, err := s.db.GetProfessorRequest(r.Context(), requestID)
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to get professor request %d: %v", requestID, err)
			writeError(w, http.StatusInternalServerError, "failed to get professor request")
			return
		}
		if request == nil {
			writeError(w, http.StatusNotFound, "professor request not found")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminProfessorRequestResponse{Request: *request})
	})
}

func (s *Server) DecideProfessorRequest() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID, ok := parsePathID(w, r, "requestID")
		if !ok {
			return
		}

		var request v1.AdminProfessorRequestDecisionRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		decision, err := normalizeProfessorRequestDecision(requestID, s.actorUserID(r.Context()), request)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		if !s.validReason(w, r, decision.ReasonCode) {
			return
		}

		result, err := s.db.DecideProfessorRequest(r.Context(), decision)
		if err != nil {
			s.writeProfessorRequestDecisionError(w, r, err)
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminProfessorRequestDecisionResponse{
			Success: true,
			Request: *result.Request,
			Action:  result.Action,
		})
	})
}

// DecideProfessorRequestGroup applies one moderation decision to every pending
// request related to requestID. The selected request remains the representative:
// on approval its edited professor fields create the canonical professor, while
// the other pending requests are resolved as duplicates of that professor.
func (s *Server) DecideProfessorRequestGroup() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID, ok := parsePathID(w, r, "requestID")
		if !ok {
			return
		}

		var request v1.AdminProfessorRequestDecisionRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		decision, err := normalizeProfessorRequestDecision(requestID, s.actorUserID(r.Context()), request)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		if !s.validReason(w, r, decision.ReasonCode) {
			return
		}

		result, err := s.db.DecideProfessorRequestGroup(r.Context(), decision)
		if err != nil {
			s.writeProfessorRequestDecisionError(w, r, err)
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminProfessorRequestGroupDecisionResponse{
			Success:       true,
			Request:       *result.Request,
			Action:        result.Action,
			AffectedCount: result.AffectedCount,
		})
	})
}

func normalizeProfessorRequestDecision(requestID int64, actorUserID *int64, request v1.AdminProfessorRequestDecisionRequest) (admindb.ProfessorRequestDecision, error) {
	if request.Decision == nil {
		return admindb.ProfessorRequestDecision{}, errInvalidProfessorRequestDecision
	}
	decision := strings.TrimSpace(*request.Decision)
	if decision != "approve" && decision != "reject" && decision != "dismiss" && decision != "mark_duplicate" {
		return admindb.ProfessorRequestDecision{}, errInvalidProfessorRequestDecision
	}

	name, err := normalizeEditableProfessorRequestField(request.ProfessorName, "professor_name")
	if err != nil {
		return admindb.ProfessorRequestDecision{}, err
	}
	university, err := normalizeEditableProfessorRequestField(request.University, "university")
	if err != nil {
		return admindb.ProfessorRequestDecision{}, err
	}
	college, err := normalizeEditableProfessorRequestField(request.College, "college")
	if err != nil {
		return admindb.ProfessorRequestDecision{}, err
	}

	email, err := normalizeOptionalEmail(request.ProfessorEmail, errInvalidProfessorEmail)
	if err != nil {
		return admindb.ProfessorRequestDecision{}, err
	}
	resolvedEmail, err := normalizeOptionalEmail(request.ResolvedProfessorEmail, errInvalidResolvedProfessorEmail)
	if err != nil {
		return admindb.ProfessorRequestDecision{}, err
	}

	if decision == "approve" {
		switch {
		case name == nil:
			return admindb.ProfessorRequestDecision{}, errProfessorNameRequired
		case email == nil:
			return admindb.ProfessorRequestDecision{}, errProfessorEmailRequired
		case university == nil:
			return admindb.ProfessorRequestDecision{}, errProfessorUniversityRequired
		case college == nil:
			return admindb.ProfessorRequestDecision{}, errProfessorCollegeRequired
		}
	}
	if decision == "mark_duplicate" && resolvedEmail == nil {
		return admindb.ProfessorRequestDecision{}, errResolvedProfessorEmailRequired
	}

	return admindb.ProfessorRequestDecision{
		RequestID:              requestID,
		Decision:               decision,
		ActorUserID:            actorUserID,
		ProfessorName:          name,
		ProfessorEmail:         email,
		University:             university,
		College:                college,
		ResolvedProfessorEmail: resolvedEmail,
		ReasonCode:             cleanOptionalText(request.ReasonCode),
		Note:                   cleanOptionalText(request.Note),
	}, nil
}

func normalizeEditableProfessorRequestField(value *string, field string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, errors.New(field + " must not be empty")
	}
	return &trimmed, nil
}

func normalizeOptionalEmail(value *string, invalidError error) (*string, error) {
	if value == nil {
		return nil, nil
	}
	email := strings.ToLower(strings.TrimSpace(*value))
	if email == "" || strings.ContainsAny(email, "<>\r\n") {
		return nil, invalidError
	}
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Name != "" || parsed.Address != email {
		return nil, invalidError
	}
	at := strings.LastIndexByte(email, '@')
	if at <= 0 || at == len(email)-1 || !strings.Contains(email[at+1:], ".") {
		return nil, invalidError
	}
	return &email, nil
}

func (s *Server) writeProfessorRequestDecisionError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, admindb.ErrNotFound):
		writeError(w, http.StatusNotFound, "professor request not found")
	case errors.Is(err, admindb.ErrResolvedProfessorNotFound):
		writeError(w, http.StatusNotFound, "resolved professor not found")
	case errors.Is(err, admindb.ErrProfessorRequestAlreadyDecided):
		writeError(w, http.StatusConflict, "professor request has already been decided")
	case errors.Is(err, admindb.ErrProfessorAlreadyExists):
		writeError(w, http.StatusConflict, "a professor with that email already exists")
	case errors.Is(err, admindb.ErrInvalidProfessorRequestDecision):
		writeError(w, http.StatusBadRequest, "invalid professor request decision")
	default:
		logging.FromContext(r.Context()).Errorf("failed to decide professor request: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to decide professor request")
	}
}
