package course

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/osamashannak/uaeu-space/services/pkg/utils"
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
		canonical: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	},
	".pptx": {
		canonical: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	},
	".xlsx": {
		canonical: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	},
}

func validateCourseMaterial(fileName string, contents []byte) (string, error) {
	if len(contents) == 0 {
		return "", fmt.Errorf("file must not be empty")
	}

	ext, err := courseMaterialExtension(fileName)
	if err != nil {
		return "", err
	}
	allowed, ok := allowedCourseMaterialTypes[ext]
	if !ok {
		return "", fmt.Errorf("file type is not allowed")
	}
	if format, ok := officeMaterialFormats[ext]; ok {
		if err := validateOfficeMaterial(contents, format); err != nil {
			return "", err
		}
		return allowed.canonical, nil
	}

	detected := http.DetectContentType(contents)
	if _, ok := allowed.contentTypes[detected]; !ok {
		return "", fmt.Errorf("file contents do not match the file extension")
	}

	return allowed.canonical, nil
}

// The multipart filename determines the format, never the editable display name.
// Both are untrusted: filename validation still has to be followed by content validation.
func courseMaterialExtension(fileName string) (string, error) {
	if fileName == "" || strings.ContainsAny(fileName, `/\\:`) ||
		strings.IndexFunc(fileName, unicode.IsControl) >= 0 ||
		strings.TrimSpace(fileName) != fileName || strings.HasSuffix(fileName, ".") {
		return "", fmt.Errorf("invalid uploaded file name")
	}
	ext := strings.ToLower(filepath.Ext(fileName))
	if _, ok := allowedCourseMaterialTypes[ext]; !ok {
		return "", fmt.Errorf("file type is not allowed")
	}
	return ext, nil
}

func courseMaterialDisplayName(originalName, displayName string) (string, error) {
	ext, err := courseMaterialExtension(originalName)
	if err != nil {
		return "", err
	}
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		displayName = originalName
	}
	// Keep compatibility with clients that send the full display filename.
	// A different suffix remains part of the title; it never changes the true extension.
	if strings.EqualFold(filepath.Ext(displayName), ext) {
		displayName = displayName[:len(displayName)-len(ext)]
	}
	return utils.SanitizeFileName(displayName + ext), nil
}

func setOf(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}
