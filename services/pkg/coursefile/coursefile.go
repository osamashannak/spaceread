// Package coursefile holds course-material rules shared by the public course
// service and the admin service.
package coursefile

import (
	"mime"
	"strings"
)

// previewTypes can be shown in the browser from a signed inline link.
// GIFs are excluded: course materials only preview static images.
var previewTypes = map[string]struct{}{
	"application/pdf": {},
	"image/jpeg":      {},
	"image/png":       {},
	"image/webp":      {},
	"video/mp4":       {},
	"video/webm":      {},
	"audio/mpeg":      {},
	"audio/mp4":       {},
	"audio/wav":       {},
}

// PreviewContentType returns the bare media type to serve a preview with, or
// false when the stored type can't be previewed.
func PreviewContentType(storedType string) (string, bool) {
	mediaType, _, err := mime.ParseMediaType(storedType)
	if err != nil {
		return "", false
	}
	_, ok := previewTypes[mediaType]
	return mediaType, ok
}

// IsMedia reports whether a content type is audio or video. Media is stored
// uncompressed so browsers can stream and seek with range requests.
func IsMedia(contentType string) bool {
	return strings.HasPrefix(contentType, "audio/") || strings.HasPrefix(contentType, "video/")
}
