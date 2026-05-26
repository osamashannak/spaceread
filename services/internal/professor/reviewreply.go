package professor

import (
	"context"
	"net/http"
	"strconv"
	"time"

	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/internal/professor/model"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/osamashannak/uaeu-space/services/pkg/utils"
)

func (s *Server) PostReply() http.Handler {
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

		logger.Debugf("received request to post reply by user: %d", profile.SessionId)

		var request v1.ReplyPostBody
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
				Message: "failed to get review",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if review == nil {
			logger.Errorf("review with ID %d does not exist", request.ReviewID)
			errorResponse := v1.ErrorResponse{
				Message: "review not found",
				Error:   http.StatusNotFound,
			}
			jsonutil.MarshalResponse(w, http.StatusNotFound, errorResponse)
			return
		}

		if request.Gif != nil {
			request.Comment = ""
		}

		request.Comment = utils.ReviewTextCleaner(request.Comment)

		if request.Comment == "" && request.Gif == nil {
			errorResponse := v1.ErrorResponse{
				Message: "comment or gif is required",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		author, err := s.db.GetReplySessionName(ctx, request.ReviewID, profile.SessionId)

		if err != nil {
			logger.Errorf("failed to get reply session name: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to get reply session name",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if author == "" {
			logger.Debugf("no author name found for session ID %d", profile.SessionId)
			errorResponse := v1.ErrorResponse{
				Message: "missing author name",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		var mention *string
		var mentionedReply *model.ReviewReply

		if request.ReplyID != nil {
			replyExists, err := s.db.GetReply(ctx, *request.ReplyID)

			if err != nil {
				logger.Errorf("failed to get reply: %v", err)
				errorResponse := v1.ErrorResponse{
					Message: "failed to get reply",
					Error:   http.StatusInternalServerError,
				}
				jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
				return
			}

			if replyExists == nil {
				logger.Errorf("reply with ID %d does not exist", *request.ReplyID)
				errorResponse := v1.ErrorResponse{
					Message: "reply not found",
					Error:   http.StatusNotFound,
				}
				jsonutil.MarshalResponse(w, http.StatusNotFound, errorResponse)
				return
			}
			mentionedReply = replyExists

			mentionName, err := s.db.GetReplySessionName(ctx, request.ReviewID, replyExists.SessionId)

			if err != nil {
				logger.Errorf("failed to get reply session name: %v", err)
			}

			mention = &mentionName
		}

		op := false
		if review.SessionId != nil {
			op = *review.SessionId == profile.SessionId
		}
		if !op && review.UserId != nil && profile.UserId != nil {
			op = *review.UserId == *profile.UserId
		}

		reply := model.ReviewReply{
			ID:        int64(s.generator.Next()),
			Content:   request.Comment,
			Gif:       request.Gif,
			Op:        op,
			ReviewId:  request.ReviewID,
			SessionId: profile.SessionId,
			UserId:    profile.UserId,
			MentionId: request.ReplyID,
			Visible:   true,
		}

		err = s.db.InsertReply(ctx, &reply)

		if err != nil {
			logger.Errorf("failed to insert reply: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		s.refreshReviewRank(ctx, request.ReviewID)

		s.createReplyNotifications(ctx, profile.SessionId, profile.UserId, review, mentionedReply, author, reply.ID)

		logger.Debugf("successfully posted reply with ID %d", reply.ID)

		jsonutil.MarshalResponse(w, http.StatusCreated, v1.Reply{
			ID:        reply.ID,
			Comment:   reply.Content,
			CreatedAt: time.Now(),
			Gif:       reply.Gif,
			Author:    author,
			Mention:   mention,
			Self:      true,
			Liked:     false,
			Op:        reply.Op,
		})

	})
}

func (s *Server) createReplyNotifications(ctx context.Context, actorSessionID int64, actorUserID *int64, review *model.Review, mentionedReply *model.ReviewReply, author string, replyID int64) {
	logger := logging.FromContext(ctx)
	href := "/professor/" + review.ProfessorEmail + "#" + strconv.FormatInt(review.ID, 10)
	notifiedUsers := map[int64]struct{}{}

	if (review.UserId != nil || review.SessionId != nil) && !sameUser(review.UserId, actorUserID) && !sameSession(review.SessionId, actorSessionID) {
		if err := s.db.InsertNotification(
			ctx,
			int64(s.generator.Next()),
			review.UserId,
			review.SessionId,
			actorUserID,
			"review_reply",
			"New reply on your review",
			author+" replied to your review.",
			href,
			review.ID,
			replyID,
		); err != nil {
			logger.Warnf("failed to create review reply notification: %v", err)
		} else {
			if review.UserId != nil {
				notifiedUsers[*review.UserId] = struct{}{}
			}
		}
	}

	if mentionedReply == nil || sameUser(mentionedReply.UserId, actorUserID) || mentionedReply.SessionId == actorSessionID {
		return
	}
	if mentionedReply.UserId != nil {
		if _, alreadyNotified := notifiedUsers[*mentionedReply.UserId]; alreadyNotified {
			return
		}
	}

	mentionedSessionID := mentionedReply.SessionId
	if mentionedReply.UserId == nil && mentionedSessionID == 0 {
		return
	}

	if err := s.db.InsertNotification(
		ctx,
		int64(s.generator.Next()),
		mentionedReply.UserId,
		&mentionedSessionID,
		actorUserID,
		"reply_mention",
		"New reply to your comment",
		author+" replied to you.",
		href,
		review.ID,
		replyID,
	); err != nil {
		logger.Warnf("failed to create reply mention notification: %v", err)
	}
}

func sameUser(a, b *int64) bool {
	return a != nil && b != nil && *a == *b
}

func sameSession(sessionID *int64, actorSessionID int64) bool {
	return sessionID != nil && *sessionID == actorSessionID
}

func (s *Server) DeleteReply() http.Handler {
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

		replyIdStr := r.URL.Query().Get("replyId")
		if replyIdStr == "" {
			errorResponse := v1.ErrorResponse{
				Message: "missing replyId parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		replyId, err := strconv.ParseInt(replyIdStr, 10, 64)
		if err != nil {
			errorResponse := v1.ErrorResponse{
				Message: "invalid replyId parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		reply, err := s.db.GetReply(ctx, replyId)
		if err != nil {
			logger.Errorf("failed to get reply: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if reply == nil {
			logger.Debugf("reply with ID %d not found", replyId)
			errorResponse := v1.ErrorResponse{
				Message: "reply not found",
				Error:   http.StatusNotFound,
			}
			jsonutil.MarshalResponse(w, http.StatusNotFound, errorResponse)
			return
		}

		ownedBySession := reply.SessionId == profile.SessionId
		ownedByUser := reply.UserId != nil && profile.UserId != nil && *reply.UserId == *profile.UserId
		if !ownedBySession && !ownedByUser {
			logger.Debugf("user %d is not authorized to delete reply %d", profile.SessionId, replyId)
			errorResponse := v1.ErrorResponse{
				Message: "not authorized to delete this reply",
				Error:   http.StatusForbidden,
			}
			jsonutil.MarshalResponse(w, http.StatusForbidden, errorResponse)
			return
		}

		err = s.db.SoftDeleteReply(ctx, replyId)
		if err != nil {
			logger.Errorf("failed to delete reply: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		s.refreshReviewRank(ctx, reply.ReviewId)

		logger.Debugf("successfully deleted reply with ID %d", replyId)
		jsonutil.MarshalResponse(w, http.StatusOK, v1.SuccessResponse{
			Message: "reply deleted successfully",
			Success: true,
		})
	})
}

func (s *Server) GetReplies() http.Handler {
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
				Message: "invalid reviewId parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		currentReplies := r.URL.Query().Get("current_replies")

		current, err := utils.ParseInt64List(currentReplies)

		logger.Debugf("current_replies %d parameter: %v", len(current), current)

		if err != nil {
			logger.Debugf("failed to parse current_replies: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "invalid current_replies parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		replies, err := s.db.GetRepliesIgnoreCurrent(ctx, reviewId, profile.SessionId, profile.UserId, current)

		if err != nil {
			logger.Errorf("failed to get replies: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if replies == nil {
			logger.Debugf("no replies found for review with ID %d", reviewId)
			jsonutil.MarshalResponse(w, http.StatusOK, v1.GetRepliesResponse{
				Replies: []v1.Reply{},
			})
			return
		}

		logger.Debugf("successfully retrieved %d replies for review with ID %d", len(replies), reviewId)

		jsonutil.MarshalResponse(w, http.StatusOK, v1.GetRepliesResponse{
			Replies: replies,
		})
	})
}

func (s *Server) LikeReply() http.Handler {
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

		replyIdStr := r.URL.Query().Get("replyId")
		if replyIdStr == "" {
			errorResponse := v1.ErrorResponse{
				Message: "missing replyId parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		replyId, err := strconv.ParseInt(replyIdStr, 10, 64)
		if err != nil {
			errorResponse := v1.ErrorResponse{
				Message: "invalid replyId parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		err = s.db.LikeReply(ctx, replyId, profile.SessionId, profile.UserId)

		if err != nil {
			logger.Errorf("failed to like reply: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		logger.Debugf("successfully liked reply with ID %d", replyId)
		jsonutil.MarshalResponse(w, http.StatusOK, v1.SuccessResponse{
			Message: "reply liked successfully",
			Success: true,
		})
	})
}

func (s *Server) UnlikeReply() http.Handler {
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

		replyIdStr := r.URL.Query().Get("replyId")
		if replyIdStr == "" {
			errorResponse := v1.ErrorResponse{
				Message: "missing replyId parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		replyId, err := strconv.ParseInt(replyIdStr, 10, 64)
		if err != nil {
			errorResponse := v1.ErrorResponse{
				Message: "invalid replyId parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		err = s.db.UnlikeReply(ctx, replyId, profile.SessionId, profile.UserId)

		if err != nil {
			logger.Errorf("failed to unlike reply: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		logger.Debugf("successfully unliked reply with ID %d", replyId)
		jsonutil.MarshalResponse(w, http.StatusOK, v1.SuccessResponse{
			Message: "reply unliked successfully",
			Success: true,
		})
	})
}

func (s *Server) GetReplyName() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		logger := logging.FromContext(ctx)

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
				Message: "invalid reviewId parameter",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		profile, ok := s.gateway.GetProfile(ctx)
		if !ok {
			errorResponse := v1.ErrorResponse{
				Message: "session missing",
				Error:   http.StatusUnauthorized,
			}
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, errorResponse)
			return
		}

		name, err := s.db.GetReplySessionName(ctx, reviewId, profile.SessionId)

		if err == nil && name != "" {
			jsonutil.MarshalResponse(w, http.StatusOK, v1.ReplyNameResponse{
				Name: name,
			})
			return
		}

		review, err := s.db.GetReview(ctx, reviewId)

		if err != nil {
			logger.Errorf("failed to get review: %v", err)
			errorResponse := v1.ErrorResponse{
				Message: "an error occurred. please try again later.",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if review == nil {
			logger.Debugf("review with ID %d not found", reviewId)
			errorResponse := v1.ErrorResponse{
				Message: "review not found",
				Error:   http.StatusNotFound,
			}
			jsonutil.MarshalResponse(w, http.StatusNotFound, errorResponse)
			return
		}

		name = utils.GenerateAuthorName()

		err = s.db.InsertReplyName(ctx, reviewId, profile.SessionId, profile.UserId, name)

		for err != nil {
			logger.Warnf("failed to insert reply name: %v, retrying...", err)
			name = utils.GenerateAuthorName()
			err = s.db.InsertReplyName(ctx, reviewId, profile.SessionId, profile.UserId, name)
		}

		logger.Debugf("generated name for review %d: %s", reviewId, name)

		jsonutil.MarshalResponse(w, http.StatusOK, v1.ReplyNameResponse{
			Name: name,
		})
	})
}
