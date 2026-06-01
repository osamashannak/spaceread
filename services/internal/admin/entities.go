package admin

import (
	"net/http"
	"net/netip"
	"strings"

	admindb "github.com/osamashannak/uaeu-space/services/internal/admin/database"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

func (s *Server) GetReviewReply() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		replyID, ok := parsePathID(w, r, "replyID")
		if !ok {
			return
		}

		reply, err := s.db.GetReviewReplyDetail(r.Context(), replyID)
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to get review reply %d: %v", replyID, err)
			writeError(w, http.StatusInternalServerError, "failed to get review reply")
			return
		}
		if reply == nil {
			writeError(w, http.StatusNotFound, "reply not found")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, reply)
	})
}

func (s *Server) GetSessionDetail() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sessionID, ok := parsePathID(w, r, "sessionID")
		if !ok {
			return
		}

		session, err := s.db.GetSessionDetail(r.Context(), sessionID)
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to get session %d: %v", sessionID, err)
			writeError(w, http.StatusInternalServerError, "failed to get session")
			return
		}
		if session == nil {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, session)
	})
}

func (s *Server) GetUserDetail() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := parsePathID(w, r, "userID")
		if !ok {
			return
		}

		user, err := s.db.GetUserDetail(r.Context(), userID)
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to get user %d: %v", userID, err)
			writeError(w, http.StatusInternalServerError, "failed to get user")
			return
		}
		if user == nil {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, user)
	})
}

func (s *Server) GetIPDetail() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		address := strings.TrimSpace(r.URL.Query().Get("address"))
		if address == "" {
			writeError(w, http.StatusBadRequest, "ip address is required")
			return
		}
		parsed, ok := parseIPAddress(address)
		if !ok {
			writeError(w, http.StatusBadRequest, "invalid ip address")
			return
		}

		detail, err := s.db.GetIPDetail(r.Context(), parsed)
		if err != nil {
			logging.FromContext(r.Context()).Errorf("failed to get ip address %s: %v", parsed, err)
			writeError(w, http.StatusInternalServerError, "failed to get ip address")
			return
		}
		if detail == nil {
			writeError(w, http.StatusNotFound, "ip address not found")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, detail)
	})
}

func parseIPAddress(value string) (string, bool) {
	if parsed, err := netip.ParseAddr(value); err == nil {
		return parsed.String(), true
	}
	if parsed, err := netip.ParsePrefix(value); err == nil {
		return parsed.String(), true
	}
	return "", false
}

func (s *Server) SetReviewReplyVisibility() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		replyID, ok := parsePathID(w, r, "replyID")
		if !ok {
			return
		}

		var request v1.AdminReviewReplyVisibilityRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		reasonCode := cleanOptionalText(request.ReasonCode)
		if !s.validReason(w, r, reasonCode) {
			return
		}

		result, err := s.db.SetReviewReplyVisibility(r.Context(), admindb.ReviewReplyVisibilityDecision{
			ReplyID:     replyID,
			Visible:     *request.Visible,
			ActorUserID: s.actorUserID(r.Context()),
			ReasonCode:  reasonCode,
			Note:        cleanOptionalText(request.Note),
		})
		if err != nil {
			s.writeDecisionError(w, r, err, "failed to update reply visibility")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminReplyDecisionResponse{
			Success: true,
			Review:  *result.Review,
			Reply:   *result.Reply,
			Action:  result.Action,
		})
	})
}

func (s *Server) MarkReviewReplyReviewed() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		replyID, ok := parsePathID(w, r, "replyID")
		if !ok {
			return
		}

		var request v1.AdminReviewReplyReviewRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		reasonCode := cleanOptionalText(request.ReasonCode)
		if !s.validReason(w, r, reasonCode) {
			return
		}

		result, err := s.db.MarkReviewReplyReviewed(r.Context(), admindb.ReviewReplyReviewDecision{
			ReplyID:     replyID,
			ActorUserID: s.actorUserID(r.Context()),
			ReasonCode:  reasonCode,
			Note:        cleanOptionalText(request.Note),
		})
		if err != nil {
			s.writeDecisionError(w, r, err, "failed to mark reply reviewed")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminReplyDecisionResponse{
			Success: true,
			Review:  *result.Review,
			Reply:   *result.Reply,
			Action:  result.Action,
		})
	})
}

func (s *Server) SaveReviewReplyNote() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		replyID, ok := parsePathID(w, r, "replyID")
		if !ok {
			return
		}

		var request v1.AdminReviewReplyNoteRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Error: code, Message: err.Error()})
			return
		}

		result, err := s.db.SaveReviewReplyNote(r.Context(), admindb.ReviewReplyNoteDecision{
			ReplyID:     replyID,
			ActorUserID: s.actorUserID(r.Context()),
			Note:        request.Note,
		})
		if err != nil {
			s.writeDecisionError(w, r, err, "failed to save reply note")
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.AdminReplyDecisionResponse{
			Success: true,
			Review:  *result.Review,
			Reply:   *result.Reply,
			Action:  result.Action,
		})
	})
}
