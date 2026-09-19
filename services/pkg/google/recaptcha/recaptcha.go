package recaptcha

import (
	"context"
	"errors"
	"fmt"

	recaptcha "cloud.google.com/go/recaptchaenterprise/v2/apiv1"
	recaptchapb "cloud.google.com/go/recaptchaenterprise/v2/apiv1/recaptchaenterprisepb"
	"github.com/googleapis/gax-go/v2"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

// AssessmentClient is the subset of the reCAPTCHA Enterprise client used to
// verify tokens. Keeping this boundary small makes verification behavior
// testable without making calls to Google.
type AssessmentClient interface {
	CreateAssessment(context.Context, *recaptchapb.CreateAssessmentRequest, ...gax.CallOption) (*recaptchapb.Assessment, error)
}

type Recaptcha struct {
	client AssessmentClient
	cfg    *Config
}

// Assert that Google's generated client continues to implement the boundary
// used by this package.
var _ AssessmentClient = (*recaptcha.Client)(nil)

// InvalidTokenError represents a successful assessment whose token verdict
// was invalid. It is intentionally separate from transport and configuration
// errors so callers can handle retryable browser failures without bypassing
// verification.
type InvalidTokenError struct {
	Reason recaptchapb.TokenProperties_InvalidReason
}

func (e *InvalidTokenError) Error() string {
	return fmt.Sprintf("recaptcha token is invalid: %s", e.Reason.String())
}

// Retryable reports whether a fresh browser-generated token may succeed.
// The rejected token itself must never be reused.
func (e *InvalidTokenError) Retryable() bool {
	return e != nil && e.Reason == recaptchapb.TokenProperties_BROWSER_ERROR
}

func New(client AssessmentClient, config *Config) *Recaptcha {
	return &Recaptcha{
		client: client,
		cfg:    config,
	}
}

func (r *Recaptcha) Verify(ctx context.Context, token, ip, userAgent string) (bool, error) {
	if r.cfg == nil {
		return false, errors.New("recaptcha configuration is missing")
	}

	if r.cfg.Bypass {
		logging.FromContext(ctx).Debug("recaptcha verification bypassed")
		return true, nil
	}
	if r.client == nil {
		return false, errors.New("recaptcha assessment client is missing")
	}

	event := &recaptchapb.Event{
		Token:          token,
		SiteKey:        r.cfg.SiteKey,
		ExpectedAction: r.cfg.ExpectedAction,
		UserAgent:      userAgent,
		UserIpAddress:  ip,
	}

	assessment := &recaptchapb.Assessment{
		Event: event,
	}

	request := &recaptchapb.CreateAssessmentRequest{
		Assessment: assessment,
		Parent:     fmt.Sprintf("projects/%s", r.cfg.ProjectID),
	}

	response, err := r.client.CreateAssessment(ctx, request)

	if err != nil {
		return false, fmt.Errorf("create recaptcha assessment: %w", err)
	}
	if response == nil || response.TokenProperties == nil {
		return false, errors.New("recaptcha assessment response is missing token properties")
	}

	if !response.TokenProperties.Valid {
		return false, &InvalidTokenError{Reason: response.TokenProperties.InvalidReason}
	}

	if response.TokenProperties.Action != r.cfg.ExpectedAction {
		return false, fmt.Errorf("recaptcha action %q did not match the expected action %q",
			response.TokenProperties.Action, r.cfg.ExpectedAction)
	}

	if response.RiskAnalysis == nil {
		return false, errors.New("recaptcha assessment response is missing risk analysis")
	}

	logger := logging.FromContext(ctx)
	logger.Debugf("Recaptcha score: %f", response.RiskAnalysis.Score)

	for _, reason := range response.RiskAnalysis.Reasons {
		logger.Debugf(reason.String() + "\n")
	}

	return response.RiskAnalysis.Score > r.cfg.Threshold, nil

}
