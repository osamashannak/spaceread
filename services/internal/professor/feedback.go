package professor

import (
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/osamashannak/uaeu-space/services/pkg/utils"
	"net/http"
)

func (s *Server) NewFeedback() http.Handler {
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

		logger.Debugf("received request for feedback")

		feedback, err := s.db.GetFeedbackBySessionID(ctx, profile.SessionId)

		if err != nil {
			logger.Errorf("failed to get feedback for session %d: %v", profile.SessionId, err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to get feedback",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if feedback != nil {
			question := utils.QuestionsMap[feedback.CurrentQuestion]
			response := v1.NewFeedbackResponse{
				FeedbackID:     feedback.ID,
				Completed:      feedback.Completed,
				RemainingCount: utils.GetRemainingQuestionsCount(feedback.CurrentQuestion),
				Question: v1.FeedbackResponse{
					Text:    question.Text,
					Options: &question.Options,
					Type:    question.Type,
				},
			}
			jsonutil.MarshalResponse(w, http.StatusOK, response)
			return
		}

		id := int64(s.generator.Next())

		question := utils.GetFirstQuestion()

		err = s.db.InsertNewFeedback(ctx, id, profile.SessionId, profile.UserId, question.ID)

		jsonutil.MarshalResponse(w, http.StatusOK, v1.NewFeedbackResponse{
			FeedbackID:     id,
			Completed:      false,
			RemainingCount: utils.GetRemainingQuestionsCount(question.ID),
			Question: v1.FeedbackResponse{
				Text:    question.Text,
				Options: &question.Options,
				Type:    question.Type,
			},
		})
	})
}

func (s *Server) Feedback() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		logger := logging.FromContext(ctx)

		logger.Debugf("received request for answered feedback question")

		var request v1.FeedbackPostBody
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

		feedback, err := s.db.GetFeedback(ctx, request.ID)

		if err != nil {
			logger.Errorf("failed to get feedback for id %d: %v", request.ID, err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to get feedback",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if feedback == nil {
			logger.Debugf("invalid feedback id: %d", request.ID)
			errorResponse := v1.ErrorResponse{
				Message: "invalid feedback id",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		logger.Debugf("feedback: %+v", feedback)

		if feedback.Completed {
			logger.Debugf("feedback already completed for id: %d", request.ID)
			errorResponse := v1.ErrorResponse{
				Message: "feedback already completed",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		answeredQuestion := utils.QuestionsMap[feedback.CurrentQuestion]

		if !utils.IsValidAnswer(answeredQuestion, request.Answer) {
			logger.Debugf("invalid answer for question id: %s", feedback.CurrentQuestion)
			errorResponse := v1.ErrorResponse{
				Message: "invalid answer",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
			return
		}

		nextQuestion, remainingCount := utils.GetNextQuestion(feedback.CurrentQuestion, request.Answer)

		if nextQuestion == nil {
			logger.Debugf("no next question for question id: %s and answer: %s", feedback.CurrentQuestion, request.Answer)
			errorResponse := v1.ErrorResponse{
				Message: "no next question",
				Error:   http.StatusBadRequest,
			}
			jsonutil.MarshalResponse(w, http.StatusBadRequest, errorResponse)
		}

		err = s.db.InsertFeedbackEntry(ctx, request.ID, feedback.CurrentQuestion, request.Answer)

		if err != nil {
			logger.Errorf("failed to insert feedback answer for feedback %d: %v", request.ID, err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to insert feedback answer",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		if nextQuestion.ID == "finished" {
			err = s.db.CompleteFeedback(ctx, request.ID)
			if err != nil {
				logger.Errorf("failed to complete feedback %d: %v", request.ID, err)
				errorResponse := v1.ErrorResponse{
					Message: "failed to complete feedback",
					Error:   http.StatusInternalServerError,
				}
				jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
				return
			}
		}

		err = s.db.UpdateFeedbackCurrentQuestion(ctx, request.ID, nextQuestion.ID)

		if err != nil {
			logger.Errorf("failed to update current question for feedback %d: %v", request.ID, err)
			errorResponse := v1.ErrorResponse{
				Message: "failed to update current question",
				Error:   http.StatusInternalServerError,
			}
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, errorResponse)
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.FeedbackResponse{
			Text:           nextQuestion.Text,
			Options:        &nextQuestion.Options,
			Type:           nextQuestion.Type,
			RemainingCount: &remainingCount,
		})

	})
}
