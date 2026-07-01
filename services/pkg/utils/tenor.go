package utils

import (
	"net/url"
	"strings"
)

func IsValidTenorURL(gifURL string) bool {
	if gifURL == "" {
		return false
	}

	if len(gifURL) < 5 || len(gifURL) > 2048 {
		return false
	}

	parsed, err := url.Parse(gifURL)
	if err != nil {
		return false
	}

	return parsed.Scheme == "https" && strings.ToLower(parsed.Hostname()) == "media.tenor.com" && isGIFPath(parsed.Path)
}

func IsValidGIFURL(gifURL string) bool {
	if gifURL == "" {
		return false
	}

	if len(gifURL) < 5 || len(gifURL) > 2048 {
		return false
	}

	parsed, err := url.Parse(gifURL)
	if err != nil {
		return false
	}

	if parsed.Scheme != "https" || !isGIFPath(parsed.Path) {
		return false
	}

	hostname := strings.ToLower(parsed.Hostname())
	return hostname == "media.tenor.com" || isKlipyMediaHost(hostname)
}

func isKlipyMediaHost(hostname string) bool {
	if hostname == "klipy.com" {
		return true
	}

	return strings.HasSuffix(hostname, ".klipy.com")
}

func isGIFPath(path string) bool {
	return strings.HasSuffix(strings.ToLower(path), ".gif")
}
