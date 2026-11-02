package utils

import (
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

const maxFileNameBaseRunes = 150

// SanitizeFileName cleans a user-supplied display name. It keeps letters,
// numbers, accents and emoji from any language (Arabic included) and removes:
//   - control and invisible formatting characters, including right-to-left
//     overrides that can make "fdp.exe" display as "exe.pdf";
//   - characters that are invalid in Windows file names (replaced with "_").
//
// It also repairs names whose UTF-8 was mis-read as Latin-1 somewhere before
// upload (e.g. "Aya’s" arriving as "Aya" + "â" + two invisible control codes).
func SanitizeFileName(original string) string {
	name := norm.NFC.String(strings.ToValidUTF8(original, ""))
	name = repairLatin1Mojibake(name)

	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)

	var b strings.Builder
	for _, r := range base {
		switch {
		case r == '‌' || r == '‍':
			// Zero-width (non-)joiners shape Persian script and emoji sequences.
			b.WriteRune(r)
		case unicode.IsSpace(r):
			b.WriteRune(' ')
		case unicode.In(r, unicode.Cc, unicode.Cf, unicode.Co, unicode.Cs) || r == utf8.RuneError:
			// Dropped: control, invisible formatting, private-use and invalid characters.
		case strings.ContainsRune(`/\:*?"<>|`, r):
			b.WriteRune('_')
		default:
			b.WriteRune(r)
		}
	}

	base = strings.Join(strings.Fields(b.String()), " ")
	if runes := []rune(base); len(runes) > maxFileNameBaseRunes {
		base = string(runes[:maxFileNameBaseRunes])
	}
	// Windows drops trailing dots and spaces from file names.
	base = strings.TrimRight(base, ". ")
	if base == "" {
		base = "file"
	}

	ext = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			return r
		}
		return -1
	}, strings.ToLower(ext))
	if ext != "" {
		return base + "." + ext
	}
	return base
}

// repairLatin1Mojibake reverses UTF-8 text that was decoded as Latin-1. It only
// acts when the name contains C1 control codes (U+0080–U+009F), which never
// appear in real names but always appear in this kind of damage.
func repairLatin1Mojibake(s string) string {
	if !strings.ContainsFunc(s, func(r rune) bool { return r >= 0x80 && r <= 0x9f }) {
		return s
	}
	raw := make([]byte, 0, len(s))
	for _, r := range s {
		if r <= 0xff {
			raw = append(raw, byte(r))
		} else {
			raw = utf8.AppendRune(raw, r)
		}
	}
	if !utf8.Valid(raw) {
		return s
	}
	return norm.NFC.String(string(raw))
}
