package admin

import (
	"errors"
	"net/http"
	"strings"

	admindb "github.com/osamashannak/uaeu-space/services/internal/admin/database"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

const (
	defaultCourseFileLimit = 50
	maxCourseFileLimit     = 100
)

func (s *Server) ListCourseFiles() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limit := parseBoundedInt(r.URL.Query().Get("limit"), defaultCourseFileLimit, 1, maxCourseFileLimit)
		offset := parseBoundedInt(r.URL.Query().Get("offset"), 0, 0, 1_000_000)

		files, err := s.db.ListCourseFiles(r.Context(), admindb.ListCourseFileOptions{
			Limit:                limit,
			Offset:               offset,
			Sort:                 parseChoiceQuery(r, "sort", "newest", "newest", "oldest", "largest", "most_downloads", "most_signals"),
			NeedsAttention:       parseBoolQuery(r, "needs_attention", true),
			Visible:              parseBoolChoiceQuery(r, "visible", "visible", "hidden"),
			Reviewed:             parseBoolChoiceQuery(r, "reviewed", "reviewed", "not_reviewed"),
			Signals:              parseChoiceQuery(r, "signals", "any", "any", "has", "none"),
			HasSession:           parseChoiceQuery(r, "has_session", "any", "any", "has", "none"),
			HasUser:              parseChoiceQuery(r, "has_user", "any", "any", "has", "none"),
			Search:               strings.TrimSpace(r.URL.Query().Get("search")),
			FileID:               parseOptionalInt64(r.URL.Query().Get("file_id")),
			Name:                 strings.TrimSpace(r.URL.Query().Get("name")),
			CourseTag:            strings.TrimSpace(r.URL.Query().Get("course_tag")),
			CourseName:           strings.TrimSpace(r.URL.Query().Get("course_name")),
			FileType:             strings.TrimSpace(r.URL.Query().Get("file_type")),
			ModerationReasonCode: strings.TrimSpace(r.URL.Query().Get("moderation_reason_code")),
			ReviewerUserID:       parseOptionalInt64(r.URL.Query().Get("reviewer_user_id")),
			SessionID:            parseOptionalInt64(r.URL.Query().Get("session_id")),
			UserID:               parseOptionalInt64(r.URL.Query().Get("user_id")),
			SizeMin:              parseOptionalInt(r.URL.Query().Get("size_min")),
			SizeMax:              parseOptionalInt(r.URL.Query().Get("size_max")),
			DownloadMin:          parseOptionalInt(r.URL.Query().Get("download_min")),
			DownloadMax:          parseOptionalInt(r.URL.Query().Get("download_max")),
			CreatedFrom:          parseOptionalTime(r.URL.Query().Get("created_from")),
			CreatedTo:            parseOptionalEndTime(r.URL.Query().Get("created_to")),
			ReviewedFrom:         parseOptionalTime(r.URL.Query().Get("reviewed_from")),
			ReviewedTo:           parseOptionalEndTime(r.URL.Query().Get("reviewed_to")),
		})
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to list course files: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to list course files")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminCourseFileListResponse{
			Files:  files,
			Limit:  limit,
			Offset: offset,
		})
	})
}

func (s *Server) GetCourseFile() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fileID, ok := parsePathID(w, r, "fileID")
		if !ok {
			return
		}

		file, err := s.db.GetCourseFile(r.Context(), fileID)
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to get course file %d: %v", fileID, err)
			writeError(w, http.StatusInternalServerError, "failed to get course file")
			return
		}
		if file == nil {
			writeError(w, http.StatusNotFound, "course file not found")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminCourseFileResponse{File: *file})
	})
}

func (s *Server) SetCourseFileVisibility() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		fileID, ok := parsePathID(w, r, "fileID")
		if !ok {
			return
		}

		var request v1.AdminCourseFileVisibilityRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		reasonCode := cleanOptionalText(request.ReasonCode)
		if !s.validReason(w, r, reasonCode) {
			return
		}

		result, err := s.db.SetCourseFileVisibility(ctx, admindb.CourseFileVisibilityDecision{
			FileID:      fileID,
			Visible:     *request.Visible,
			ActorUserID: s.actorUserID(ctx),
			ReasonCode:  reasonCode,
			Note:        cleanOptionalText(request.Note),
		})
		if err != nil {
			s.writeCourseFileDecisionError(w, r, err, "failed to update course file visibility")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminCourseFileDecisionResponse{
			Success: true,
			File:    *result.File,
			Action:  result.Action,
		})
	})
}

func (s *Server) SaveCourseFileNote() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		fileID, ok := parsePathID(w, r, "fileID")
		if !ok {
			return
		}

		var request v1.AdminCourseFileNoteRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		result, err := s.db.SaveCourseFileNote(ctx, admindb.CourseFileNoteDecision{
			FileID:      fileID,
			ActorUserID: s.actorUserID(ctx),
			Note:        request.Note,
		})
		if err != nil {
			s.writeCourseFileDecisionError(w, r, err, "failed to save course file note")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminCourseFileDecisionResponse{
			Success: true,
			File:    *result.File,
			Action:  result.Action,
		})
	})
}

func (s *Server) writeCourseFileDecisionError(w http.ResponseWriter, r *http.Request, err error, message string) {
	if errors.Is(err, admindb.ErrNotFound) {
		writeError(w, http.StatusNotFound, "course file not found")
		return
	}

	logging.FromContext(r.Context()).Errorf("%s: %v", message, err)
	writeError(w, http.StatusInternalServerError, message)
}
