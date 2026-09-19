package recaptcha

import (
	"errors"
	"strings"
)

type Config struct {
	SiteKey        string  `env:"RECAPTCHA_SITE_KEY"`
	ProjectID      string  `env:"RECAPTCHA_PROJECT_ID"`
	ExpectedAction string  `env:"RECAPTCHA_EXPECTED_ACTION"`
	Threshold      float32 `env:"RECAPTCHA_THRESHOLD"`
	Bypass         bool    `env:"RECAPTCHA_BYPASS, default=false"`
}

// Validate checks the settings required to perform assessments. Bypass mode is
// intentionally exempt so local environments can run without Google secrets.
func (c Config) Validate() error {
	if c.Bypass {
		return nil
	}
	if strings.TrimSpace(c.SiteKey) == "" {
		return errors.New("RECAPTCHA_SITE_KEY is required")
	}
	if strings.TrimSpace(c.ProjectID) == "" {
		return errors.New("RECAPTCHA_PROJECT_ID is required")
	}
	if strings.TrimSpace(c.ExpectedAction) == "" {
		return errors.New("RECAPTCHA_EXPECTED_ACTION is required")
	}
	if c.Threshold < 0 || c.Threshold > 1 {
		return errors.New("RECAPTCHA_THRESHOLD must be between 0 and 1")
	}
	return nil
}
