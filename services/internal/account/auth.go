package account

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	accountdb "github.com/osamashannak/uaeu-space/services/internal/account/database"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/pkg/authutil"
	"github.com/osamashannak/uaeu-space/services/pkg/gateway"
	"github.com/osamashannak/uaeu-space/services/pkg/jsonutil"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/osamashannak/uaeu-space/services/pkg/utils"
	"google.golang.org/api/idtoken"
)

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{3,20}$`)

const (
	defaultAccountRole = "user"
	minPasswordLength  = 8
	maxPasswordLength  = 256
)

type googleProfile struct {
	Subject       string
	Email         string
	EmailVerified bool
}

func (s *Server) SignUp() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		logger := logging.FromContext(ctx)

		profile, ok := s.gateway.GetProfile(ctx)
		if !ok || profile.SessionId == 0 {
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "session missing",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		var request v1.AccountSignupRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Message: err.Error(), Error: code})
			return
		}

		username := strings.TrimSpace(request.Username)
		email := normalizeEmail(request.Email)
		if err := validateSignup(username, email, request.Password); err != nil {
			jsonutil.MarshalResponse(w, http.StatusBadRequest, v1.ErrorResponse{Message: err.Error(), Error: http.StatusBadRequest})
			return
		}

		conflictCode, err := s.db.SignupConflict(ctx, username, email)
		if err != nil {
			logger.Errorf("failed to check signup conflict: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}
		if conflictCode != "" {
			jsonutil.MarshalResponse(w, http.StatusConflict, accountConflictError(conflictCode))
			return
		}

		passwordHash, err := authutil.HashPassword(request.Password, s.config.PasswordPepper)
		if err != nil {
			logger.Errorf("failed to hash password: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		userID := int64(s.generator.Next())
		identityID := int64(s.generator.Next())
		if err := s.db.CreateUserWithPassword(ctx, userID, identityID, username, email, passwordHash); err != nil {
			if isUniqueViolation(err) {
				jsonutil.MarshalResponse(w, http.StatusConflict, s.accountConflictFromRequest(ctx, username, email))
				return
			}

			logger.Errorf("failed to create user: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		user := &accountdb.AccountUser{ID: userID, Username: username, PrimaryEmail: email, Role: defaultAccountRole}
		s.finishLogin(w, r, profile, user)
	})
}

func (s *Server) Login() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		logger := logging.FromContext(ctx)

		profile, ok := s.gateway.GetProfile(ctx)
		if !ok || profile.SessionId == 0 {
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "session missing",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		var request v1.AccountLoginRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Message: err.Error(), Error: code})
			return
		}

		id := strings.TrimSpace(request.ID)
		if id == "" || request.Password == "" || len(request.Password) > maxPasswordLength {
			jsonutil.MarshalResponse(w, http.StatusBadRequest, v1.ErrorResponse{
				Message: "sign-in name and password are required",
				Error:   http.StatusBadRequest,
			})
			return
		}

		user, err := s.db.GetPasswordUserForLogin(ctx, id)
		if err != nil {
			logger.Errorf("failed to get password user: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		if user == nil || !authutil.CheckPassword(user.PasswordHash, request.Password, s.config.PasswordPepper) {
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "invalid sign-in name or password",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		accountUser := &accountdb.AccountUser{
			ID:           user.ID,
			Username:     user.Username,
			PrimaryEmail: user.PrimaryEmail,
			Role:         user.Role,
			Status:       user.Status,
		}
		s.finishLogin(w, r, profile, accountUser)
	})
}

func (s *Server) GoogleLogin() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		logger := logging.FromContext(ctx)

		profile, ok := s.gateway.GetProfile(ctx)
		if !ok || profile.SessionId == 0 {
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "session missing",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		var request v1.GoogleLoginRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Message: err.Error(), Error: code})
			return
		}

		googleUser, err := s.verifyGoogleCredential(ctx, request.Credential)
		if err != nil {
			logger.Debugf("failed to verify Google credential: %v", err)
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "invalid Google credential",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		user, err := s.db.GetUserByGoogleSubject(ctx, googleUser.Subject)
		if err != nil {
			logger.Errorf("failed to find Google user: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		if user != nil {
			s.finishLogin(w, r, profile, user)
			return
		}

		existingUser, err := s.db.GetUserByEmail(ctx, googleUser.Email)
		if err != nil {
			logger.Errorf("failed to find user by Google email: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		if existingUser != nil {
			if err := s.db.AddGoogleIdentity(ctx, int64(s.generator.Next()), existingUser.ID, googleUser.Subject, googleUser.Email, googleUser.EmailVerified); err != nil {
				logger.Errorf("failed to link Google identity: %v", err)
				jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
				return
			}
			s.finishLogin(w, r, profile, existingUser)
			return
		}

		suggestedUsername, err := s.suggestUsername(ctx, googleUser.Email)
		if err != nil {
			logger.Errorf("failed to suggest username: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, v1.GoogleSignupPromptResponse{
			NeedsSignup:       true,
			Email:             googleUser.Email,
			SuggestedUsername: suggestedUsername,
		})
	})
}

func (s *Server) GoogleSignup() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		logger := logging.FromContext(ctx)

		profile, ok := s.gateway.GetProfile(ctx)
		if !ok || profile.SessionId == 0 {
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "session missing",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		var request v1.GoogleSignupRequest
		code, err := jsonutil.Unmarshal(w, r, &request)
		if err != nil {
			jsonutil.MarshalResponse(w, code, v1.ErrorResponse{Message: err.Error(), Error: code})
			return
		}

		username := strings.TrimSpace(request.Username)
		if err := validateUsername(username); err != nil {
			jsonutil.MarshalResponse(w, http.StatusBadRequest, v1.ErrorResponse{Message: err.Error(), Error: http.StatusBadRequest})
			return
		}

		googleUser, err := s.verifyGoogleCredential(ctx, request.Credential)
		if err != nil {
			logger.Debugf("failed to verify Google signup credential: %v", err)
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "invalid Google credential",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		existingGoogleUser, err := s.db.GetUserByGoogleSubject(ctx, googleUser.Subject)
		if err != nil {
			logger.Errorf("failed to get existing Google user: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		if existingGoogleUser != nil {
			s.finishLogin(w, r, profile, existingGoogleUser)
			return
		}

		conflictCode, err := s.db.SignupConflict(ctx, username, googleUser.Email)
		if err != nil {
			logger.Errorf("failed to check Google signup conflict: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}
		if conflictCode != "" {
			jsonutil.MarshalResponse(w, http.StatusConflict, accountConflictError(conflictCode))
			return
		}

		userID := int64(s.generator.Next())
		identityID := int64(s.generator.Next())
		user := &accountdb.AccountUser{
			ID:           userID,
			Username:     username,
			PrimaryEmail: googleUser.Email,
			Role:         defaultAccountRole,
			Status:       "active",
		}

		if err := s.db.CreateUserWithGoogle(ctx, userID, identityID, username, googleUser.Email, googleUser.Subject, googleUser.EmailVerified); err != nil {
			if isUniqueViolation(err) {
				jsonutil.MarshalResponse(w, http.StatusConflict, s.accountConflictFromRequest(ctx, username, googleUser.Email))
				return
			}

			logger.Errorf("failed to create Google user: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		s.finishLogin(w, r, profile, user)
	})
}

func (s *Server) AccountSettings() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		profile, ok := s.gateway.GetProfile(r.Context())
		if !ok || profile.UserId == nil {
			if cookie, err := r.Cookie(s.authCookieName()); err == nil && cookie != nil && cookie.Value != "" {
				s.clearAuthCookie(w)
			}

			jsonutil.MarshalResponse(w, http.StatusOK, v1.AuthResponse{
				Status: "guest",
			})
			return
		}

		jsonutil.MarshalResponse(w, http.StatusOK, authResponse(profile, "authenticated"))
	})
}

func (s *Server) Logout() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(s.authCookieName())
		if err == nil && cookie != nil && cookie.Value != "" {
			tokenHash, err := authutil.HashToken(cookie.Value)
			if err != nil {
				logging.FromContext(r.Context()).Errorf("failed to hash login session token: %v", err)
				jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
				return
			}
			if err := s.db.RevokeLoginSession(r.Context(), tokenHash); err != nil {
				logging.FromContext(r.Context()).Errorf("failed to revoke login session: %v", err)
				jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
				return
			}
		}

		s.clearAuthCookie(w)
		jsonutil.MarshalResponse(w, http.StatusOK, v1.SuccessResponse{
			Success: true,
			Message: "logged out",
		})
	})
}

func (s *Server) LogoutAll() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		profile, ok := s.gateway.GetProfile(r.Context())
		if !ok || profile.UserId == nil {
			jsonutil.MarshalResponse(w, http.StatusUnauthorized, v1.ErrorResponse{
				Message: "authentication required",
				Error:   http.StatusUnauthorized,
			})
			return
		}

		if err := s.db.RevokeAllLoginSessions(r.Context(), *profile.UserId); err != nil {
			logging.FromContext(r.Context()).Errorf("failed to revoke all login sessions: %v", err)
			jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
			return
		}

		s.clearAuthCookie(w)
		jsonutil.MarshalResponse(w, http.StatusOK, v1.SuccessResponse{
			Success: true,
			Message: "logged out from all devices",
		})
	})
}

func (s *Server) finishLogin(w http.ResponseWriter, r *http.Request, profile *gateway.Profile, user *accountdb.AccountUser) {
	ctx := r.Context()
	logger := logging.FromContext(ctx)

	token, err := authutil.GenerateOpaqueToken()
	if err != nil {
		logger.Errorf("failed to generate auth token: %v", err)
		jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
		return
	}

	authCookieMaxAge := s.config.Gateway.CookieMaxAgeDuration()
	expiresAt := time.Now().Add(authCookieMaxAge)
	tokenHash, err := authutil.HashToken(token)
	if err != nil {
		logger.Errorf("failed to hash auth token: %v", err)
		jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
		return
	}
	err = s.db.CreateLoginSession(ctx, int64(s.generator.Next()), user.ID, profile.SessionId, tokenHash, r.UserAgent(), utils.GetClientIP(r), expiresAt)
	if err != nil {
		logger.Errorf("failed to create login session: %v", err)
		jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
		return
	}

	if err := s.db.AttachUserToSessionAndContent(ctx, profile.SessionId, user.ID); err != nil {
		logger.Errorf("failed to attach user to anonymous session content: %v", err)
		jsonutil.MarshalResponse(w, http.StatusInternalServerError, serverError())
		return
	}

	if err := s.db.MarkUserLoggedIn(ctx, user.ID); err != nil {
		logger.Warnf("failed to mark user login time: %v", err)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     s.authCookieName(),
		Value:    token,
		Domain:   s.config.Gateway.CookieDomain,
		MaxAge:   int(authCookieMaxAge.Seconds()),
		Expires:  expiresAt,
		Secure:   s.config.Gateway.CookieSecure,
		HttpOnly: true,
		Path:     "/",
	})

	userID := user.ID
	username := user.Username
	responseProfile := &gateway.Profile{
		SessionId: profile.SessionId,
		UserId:    &userID,
		Username:  &username,
		Role:      user.Role,
	}

	response := authResponse(responseProfile, "authenticated")
	response.Redirect = "/professor"
	jsonutil.MarshalResponse(w, http.StatusOK, response)
}

func (s *Server) verifyGoogleCredential(ctx context.Context, credential string) (*googleProfile, error) {
	if strings.TrimSpace(s.config.GoogleClientID) == "" {
		return nil, fmt.Errorf("missing GOOGLE_CLIENT_ID")
	}

	payload, err := idtoken.Validate(ctx, credential, s.config.GoogleClientID)
	if err != nil {
		return nil, err
	}

	email, _ := payload.Claims["email"].(string)
	if email == "" {
		return nil, fmt.Errorf("Google credential has no email")
	}

	emailVerified := false
	if val, ok := payload.Claims["email_verified"].(bool); ok {
		emailVerified = val
	}
	if !emailVerified {
		return nil, fmt.Errorf("Google credential email is not verified")
	}

	return &googleProfile{
		Subject:       payload.Subject,
		Email:         normalizeEmail(email),
		EmailVerified: emailVerified,
	}, nil
}

func (s *Server) suggestUsername(ctx context.Context, email string) (string, error) {
	localPart := strings.Split(email, "@")[0]
	builder := strings.Builder{}
	for _, r := range localPart {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			builder.WriteRune(r)
		}
	}

	base := strings.ToLower(builder.String())
	if len(base) < 3 {
		base = "user"
	}
	if len(base) > 16 {
		base = base[:16]
	}

	for i := 0; i < 1000; i++ {
		candidate := base
		if i > 0 {
			suffix := strconv.Itoa(i)
			maxBase := 20 - len(suffix)
			if len(candidate) > maxBase {
				candidate = candidate[:maxBase]
			}
			candidate += suffix
		}

		exists, err := s.db.UsernameExists(ctx, candidate)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("could not generate username")
}

func (s *Server) clearAuthCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.authCookieName(),
		Value:    "",
		Domain:   s.config.Gateway.CookieDomain,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		Secure:   s.config.Gateway.CookieSecure,
		HttpOnly: true,
		Path:     "/",
	})
}

func authResponse(profile *gateway.Profile, status string) v1.AuthResponse {
	response := v1.AuthResponse{
		Status: status,
	}

	if profile.UserId != nil {
		response.ID = strconv.FormatInt(*profile.UserId, 10)
	}
	if profile.Username != nil {
		response.Username = *profile.Username
	}
	response.Role = profile.Role

	return response
}

func validateSignup(username, email, password string) error {
	if err := validateUsername(username); err != nil {
		return err
	}
	parsedEmail, err := mail.ParseAddress(email)
	if err != nil || parsedEmail.Address != email {
		return fmt.Errorf("invalid email")
	}
	if len(password) < minPasswordLength || len(password) > maxPasswordLength {
		return fmt.Errorf("password must be between 8 and 256 characters long")
	}
	return nil
}

func validateUsername(username string) error {
	if !usernamePattern.MatchString(username) {
		return fmt.Errorf("username must be 3-20 characters and use only letters, numbers, underscores, or hyphens")
	}
	return nil
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func (s *Server) accountConflictFromRequest(ctx context.Context, username, email string) v1.ErrorResponse {
	code, err := s.db.SignupConflict(ctx, username, email)
	if err != nil || code == "" {
		return accountConflictError("account_taken")
	}
	return accountConflictError(code)
}

func accountConflictError(code string) v1.ErrorResponse {
	message := "account detail is already in use"
	switch code {
	case "email_taken":
		message = "email is already in use"
	case "username_taken":
		message = "username is already in use"
	}

	return v1.ErrorResponse{
		Message: message,
		Error:   http.StatusConflict,
		Code:    code,
	}
}

func serverError() v1.ErrorResponse {
	return v1.ErrorResponse{
		Message: "an error occurred. please try again later.",
		Error:   http.StatusInternalServerError,
	}
}
