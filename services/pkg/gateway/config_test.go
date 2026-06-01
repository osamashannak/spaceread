package gateway

import "testing"

func validConfig() Config {
	return Config{
		SessionCookieName: "gid",
		AuthCookieName:    "aid",
		CSRFCookieName:    "sr_c",
		CookieDomain:      ".spaceread.net",
		CookieSecure:      true,
		CookieMaxAgeDays:  365,
		JWTSecret:         "jwt-secret",
		CSRFSecret:        "csrf-secret",
	}
}

func TestValidateRequiresCookieDomainForSecureCookies(t *testing.T) {
	cfg := validConfig()
	cfg.CookieDomain = ""

	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted secure cookies without COOKIE_DOMAIN")
	}
}

func TestValidateAllowsHostOnlyCookieDomainForInsecureLocalDev(t *testing.T) {
	cfg := validConfig()
	cfg.CookieDomain = ""
	cfg.CookieSecure = false

	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate rejected local dev cookie config: %v", err)
	}
}
