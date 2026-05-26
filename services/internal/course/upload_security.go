package course

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
)

var allowedCourseMaterialTypes = map[string]struct {
	contentTypes map[string]struct{}
	canonical    string
}{
	".pdf": {
		contentTypes: setOf("application/pdf"),
		canonical:    "application/pdf",
	},
	".txt": {
		contentTypes: setOf("text/plain; charset=utf-8", "text/plain"),
		canonical:    "text/plain",
	},
	".jpg": {
		contentTypes: setOf("image/jpeg"),
		canonical:    "image/jpeg",
	},
	".jpeg": {
		contentTypes: setOf("image/jpeg"),
		canonical:    "image/jpeg",
	},
	".png": {
		contentTypes: setOf("image/png"),
		canonical:    "image/png",
	},
	".gif": {
		contentTypes: setOf("image/gif"),
		canonical:    "image/gif",
	},
	".webp": {
		contentTypes: setOf("image/webp"),
		canonical:    "image/webp",
	},
	".docx": {
		contentTypes: setOf("application/zip", "application/octet-stream"),
		canonical:    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	},
	".pptx": {
		contentTypes: setOf("application/zip", "application/octet-stream"),
		canonical:    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	},
	".xlsx": {
		contentTypes: setOf("application/zip", "application/octet-stream"),
		canonical:    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	},
}

func validateCourseMaterial(fileName string, contents []byte) (string, error) {
	if len(contents) == 0 {
		return "", fmt.Errorf("file must not be empty")
	}

	ext := strings.ToLower(filepath.Ext(fileName))
	allowed, ok := allowedCourseMaterialTypes[ext]
	if !ok {
		return "", fmt.Errorf("file type is not allowed")
	}

	detected := http.DetectContentType(contents)
	if _, ok := allowed.contentTypes[detected]; !ok {
		return "", fmt.Errorf("file contents do not match the file extension")
	}

	return allowed.canonical, nil
}

func setOf(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}
