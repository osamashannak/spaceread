package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const zayedUniversity = "Zayed University"

type facultyManifest struct {
	University  string          `json:"university"`
	RetrievedAt string          `json:"retrieved_at"`
	Faculty     []facultyRecord `json:"faculty"`
}

type facultyRecord struct {
	Name       string   `json:"name"`
	Email      string   `json:"email"`
	Colleges   []string `json:"colleges"`
	SourceURLs []string `json:"source_urls"`
}

func cleanText(value string) string     { return strings.Join(strings.Fields(value), " ") }
func identityKey(value string) string   { return strings.ToLower(cleanText(value)) }
func (f facultyRecord) college() string { return strings.Join(f.Colleges, "; ") }

func readManifest(path string) (facultyManifest, string, error) {
	var manifest facultyManifest
	data, err := os.ReadFile(path)
	if err != nil {
		return manifest, "", fmt.Errorf("read manifest: %w", err)
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return manifest, "", fmt.Errorf("decode manifest: %w", err)
	}
	if err := validateManifest(&manifest); err != nil {
		return manifest, "", err
	}
	digest := sha256.Sum256(data)
	return manifest, hex.EncodeToString(digest[:]), nil
}

func validateManifest(m *facultyManifest) error {
	if m.University != zayedUniversity {
		return fmt.Errorf("unsupported university %q; expected %q", m.University, zayedUniversity)
	}
	retrieved, err := time.Parse(time.RFC3339, m.RetrievedAt)
	if err != nil {
		return errors.New("retrieved_at must be an RFC3339 timestamp")
	}
	_, offset := retrieved.Zone()
	if offset != 0 {
		return errors.New("retrieved_at must use UTC")
	}
	if len(m.Faculty) == 0 {
		return errors.New("manifest has no faculty")
	}
	emails := make(map[string]bool)
	for i := range m.Faculty {
		f := &m.Faculty[i]
		f.Name = cleanText(f.Name)
		if f.Name == "" {
			return fmt.Errorf("faculty[%d]: name is required", i)
		}
		f.Email = strings.ToLower(strings.TrimSpace(f.Email))
		address, err := mail.ParseAddress(f.Email)
		if err != nil || address.Address != f.Email || !strings.HasSuffix(f.Email, "@zu.ac.ae") {
			return fmt.Errorf("faculty[%d]: email must be a published @zu.ac.ae address", i)
		}
		if emails[f.Email] {
			return fmt.Errorf("faculty[%d]: duplicate email %q", i, f.Email)
		}
		emails[f.Email] = true
		f.Colleges, err = normalizeValues(f.Colleges)
		if err != nil {
			return fmt.Errorf("faculty[%d]: colleges: %w", i, err)
		}
		f.SourceURLs, err = normalizeValues(f.SourceURLs)
		if err != nil {
			return fmt.Errorf("faculty[%d]: source_urls: %w", i, err)
		}
		for _, source := range f.SourceURLs {
			parsed, err := url.Parse(source)
			if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Port() != "" || !officialZUHost(parsed.Hostname()) {
				return fmt.Errorf("faculty[%d]: source URL must be HTTPS on zu.ac.ae", i)
			}
		}
	}
	sort.Slice(m.Faculty, func(i, j int) bool { return m.Faculty[i].Email < m.Faculty[j].Email })
	return nil
}

func normalizeValues(values []string) ([]string, error) {
	if len(values) == 0 {
		return nil, errors.New("at least one value is required")
	}
	unique := make(map[string]bool)
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		value = cleanText(value)
		if value == "" {
			return nil, errors.New("blank values are not allowed")
		}
		if !unique[value] {
			normalized = append(normalized, value)
			unique[value] = true
		}
	}
	sort.Strings(normalized)
	return normalized, nil
}

func officialZUHost(host string) bool {
	host = strings.ToLower(host)
	return host == "zu.ac.ae" || strings.HasSuffix(host, ".zu.ac.ae")
}

func distinctFiles(input, output string) error {
	inputAbs, err := filepath.Abs(input)
	if err != nil {
		return err
	}
	outputAbs, err := filepath.Abs(output)
	if err != nil {
		return err
	}
	if strings.EqualFold(inputAbs, outputAbs) {
		return errors.New("report must not overwrite the faculty manifest")
	}
	inputInfo, inputErr := os.Stat(input)
	outputInfo, outputErr := os.Stat(output)
	if inputErr == nil && outputErr == nil && os.SameFile(inputInfo, outputInfo) {
		return errors.New("report must not overwrite the faculty manifest")
	}
	return nil
}
