package utils

import (
	"regexp"
	"strings"
)

func ReviewTextCleaner(text string) string {
	runes := []rune(text)
	if len(runes) > 350 {
		text = string(runes[:350])
	}

	trimmed := strings.TrimSpace(text)

	if trimmed == "" {
		return ""
	}

	newlineRegex := regexp.MustCompile(`(\n[ \t]*){3,}`)
	normalizedNewlines := newlineRegex.ReplaceAllString(trimmed, "\n\n")

	spaceRegex := regexp.MustCompile(`[ \t]{2,}`)
	normalizedSpaces := spaceRegex.ReplaceAllString(normalizedNewlines, " ")

	return normalizedSpaces
}

