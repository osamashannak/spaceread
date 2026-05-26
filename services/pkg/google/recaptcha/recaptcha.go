package recaptcha

import (
	recaptcha "cloud.google.com/go/recaptchaenterprise/v2/apiv1"
	recaptchapb "cloud.google.com/go/recaptchaenterprise/v2/apiv1/recaptchaenterprisepb"
	"context"
	"fmt"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
)

type Recaptcha struct {
	client *recaptcha.Client
	cfg    *Config
}

func New(client *recaptcha.Client, config *Config) *Recaptcha {
	return &Recaptcha{
		client: client,
		cfg:    config,
	}
}

func (r *Recaptcha) Verify(ctx context.Context, token, ip, userAgent string) (bool, error) {
	if r.cfg != nil && r.cfg.Bypass {
		logging.FromContext(ctx).Debug("recaptcha verification bypassed")
		return true, nil
	}

	event := &recaptchapb.Event{
		Token:         token,
		SiteKey:       r.cfg.SiteKey,
		UserAgent:     userAgent,
		UserIpAddress: ip,
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
		return false, err
	}

	if !response.TokenProperties.Valid {
		return false, fmt.Errorf("the CreateAssessment() call failed because the token was invalid for the following reasons: %v",
			response.TokenProperties.InvalidReason)
	}

	if response.TokenProperties.Action != r.cfg.ExpectedAction {
		return false, fmt.Errorf("the CreateAssessment() call failed because the action '%s' did not match the expected action '%s'",
			response.TokenProperties.Action, r.cfg.ExpectedAction)
	}

	logger := logging.FromContext(ctx)

	logger.Debugf("Recaptcha score: %f", response.RiskAnalysis.Score)

	for _, reason := range response.RiskAnalysis.Reasons {
		logger.Debugf(reason.String() + "\n")
	}

	return response.RiskAnalysis.Score > r.cfg.Threshold, nil

}
