package utils

import (
	"fmt"
	"regexp"
)

func FormatBlobURL(accountClient, containerName, blobName, sasQuery string) string {
	if sasQuery == "" {
		return fmt.Sprintf("%s/%s/%s", accountClient, containerName, blobName)
	}
	return fmt.Sprintf("%s/%s/%s?%s", accountClient, containerName, blobName, sasQuery)
}

func IsValidGrade(grade string) bool {
	validGrades := map[string]bool{
		"A": true,
		"B": true,
		"C": true,
		"D": true,
		"F": true,
	}

	return validGrades[grade]
}

func IsValidCourseCode(code string) bool {
	pattern := `^[A-Z]{3,4}\d{3}$`

	matched, _ := regexp.MatchString(pattern, code)

	return matched
}
