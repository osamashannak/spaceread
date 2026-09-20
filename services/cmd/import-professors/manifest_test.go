package main

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func fixtureManifest() facultyManifest {
	return facultyManifest{University: zayedUniversity, RetrievedAt: "2026-09-20T00:00:00Z", Faculty: []facultyRecord{{
		Name: "Alex Example", Email: "alex@zu.ac.ae", Colleges: []string{"College of Business"},
		SourceURLs: []string{"https://www.zu.ac.ae/main/en/colleges/business/faculty"},
	}}}
}

func TestManifestValidation(t *testing.T) {
	tests := []struct {
		name   string
		change func(*facultyManifest)
	}{
		{"wrong university", func(m *facultyManifest) { m.University = "Another University" }},
		{"missing date", func(m *facultyManifest) { m.RetrievedAt = "" }},
		{"non UTC date", func(m *facultyManifest) { m.RetrievedAt = "2026-09-20T00:00:00+04:00" }},
		{"empty faculty", func(m *facultyManifest) { m.Faculty = nil }},
		{"missing name", func(m *facultyManifest) { m.Faculty[0].Name = " \t" }},
		{"bad email", func(m *facultyManifest) { m.Faculty[0].Email = "not an email" }},
		{"external email", func(m *facultyManifest) { m.Faculty[0].Email = "alex@example.org" }},
		{"lookalike email", func(m *facultyManifest) { m.Faculty[0].Email = "alex@evilzu.ac.ae" }},
		{"display name email", func(m *facultyManifest) { m.Faculty[0].Email = "Alex <alex@zu.ac.ae>" }},
		{"missing college", func(m *facultyManifest) { m.Faculty[0].Colleges = nil }},
		{"blank college", func(m *facultyManifest) { m.Faculty[0].Colleges = []string{" "} }},
		{"missing source", func(m *facultyManifest) { m.Faculty[0].SourceURLs = nil }},
		{"external source", func(m *facultyManifest) { m.Faculty[0].SourceURLs = []string{"https://example.org/faculty"} }},
		{"lookalike source", func(m *facultyManifest) { m.Faculty[0].SourceURLs = []string{"https://zu.ac.ae.evil.org/faculty"} }},
		{"insecure source", func(m *facultyManifest) { m.Faculty[0].SourceURLs = []string{"http://zu.ac.ae/faculty"} }},
		{"URL credentials", func(m *facultyManifest) { m.Faculty[0].SourceURLs = []string{"https://user@zu.ac.ae/faculty"} }},
		{"duplicate email", func(m *facultyManifest) {
			f := m.Faculty[0]
			f.Email = "ALEX@zu.ac.ae"
			m.Faculty = append(m.Faculty, f)
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			m := fixtureManifest()
			test.change(&m)
			if err := validateManifest(&m); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestManifestNormalization(t *testing.T) {
	m := fixtureManifest()
	m.Faculty[0].Name = "  Alex  Example\n"
	m.Faculty[0].Email = " ALEX@ZU.AC.AE "
	m.Faculty[0].Colleges = []string{"College Z", " College A ", "College A"}
	if err := validateManifest(&m); err != nil {
		t.Fatal(err)
	}
	f := m.Faculty[0]
	if f.Name != "Alex Example" || f.Email != "alex@zu.ac.ae" || f.college() != "College A; College Z" {
		t.Fatalf("unexpected normalization: %+v", f)
	}
}

func TestFacultyClassification(t *testing.T) {
	tests := []struct {
		name                     string
		rows                     []existingProfessor
		new, existing, conflicts int
	}{
		{"new", nil, 1, 0, 0},
		{"same identity case insensitive", []existingProfessor{{"ALEX@ZU.AC.AE", " Alex  Example ", "College of Business", "Zayed University"}}, 0, 1, 0},
		{"different name", []existingProfessor{{"alex@zu.ac.ae", "Different Person", "College of Business", "Zayed University"}}, 0, 0, 1},
		{"different university", []existingProfessor{{"alex@zu.ac.ae", "Alex Example", "College of Business", "Other University"}}, 0, 0, 1},
		{"different college", []existingProfessor{{"alex@zu.ac.ae", "Alex Example", "College of Arts", "Zayed University"}}, 0, 0, 1},
		{"ambiguous legacy casing", []existingProfessor{{"alex@zu.ac.ae", "Alex Example", "College of Business", "Zayed University"}, {"ALEX@ZU.AC.AE", "Alex Example", "College of Business", "Zayed University"}}, 0, 0, 1},
		{"same name new email", []existingProfessor{{"old.alex@zu.ac.ae", "Alex Example", "College of Business", "Zayed University"}}, 0, 0, 1},
		{"same name other university", []existingProfessor{{"other@example.edu", "Alex Example", "College of Business", "Other University"}}, 1, 0, 0},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			m := fixtureManifest()
			report := newReport(m, "hash", false)
			before, _ := json.Marshal(test.rows)
			classifyFaculty(m, test.rows, &report)
			after, _ := json.Marshal(test.rows)
			if !bytes.Equal(before, after) {
				t.Fatal("classification mutated existing records")
			}
			if report.Counts.New != test.new || report.Counts.Existing != test.existing || report.Counts.Conflicts != test.conflicts {
				t.Fatalf("unexpected report: %+v", report)
			}
		})
	}
}

func TestSameNameManifestIsReportedForReview(t *testing.T) {
	m := fixtureManifest()
	f := m.Faculty[0]
	f.Email = "another.alex@zu.ac.ae"
	m.Faculty = append(m.Faculty, f)
	if err := validateManifest(&m); err != nil {
		t.Fatalf("same-name people may be distinct; validation must accept them: %v", err)
	}
	report := newReport(m, "hash", false)
	classifyFaculty(m, nil, &report)
	if report.Counts.Conflicts != 2 || report.Counts.New != 0 {
		t.Fatalf("expected identity review: %+v", report)
	}
}

func TestReadManifestKeepsEvidenceChecksum(t *testing.T) {
	path := filepath.Join(t.TempDir(), "faculty.json")
	data, _ := json.Marshal(fixtureManifest())
	data = append(data[:len(data)-1], []byte(`,"exclusions":[],"coverage":{"count":1}}`)...)
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	m, first, err := readManifest(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != 64 || !reflect.DeepEqual(m, fixtureManifest()) {
		t.Fatalf("invalid parsed manifest/checksum: %+v %q", m, first)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0600); err != nil {
		t.Fatal(err)
	}
	_, second, err := readManifest(path)
	if err != nil || first == second {
		t.Fatal("checksum must identify exact source file")
	}
	if err := distinctFiles(path, path); err == nil {
		t.Fatal("report must not overwrite manifest")
	}
}

func TestCLIRequiresManifestBeforeDatabaseAccess(t *testing.T) {
	if err := run(context.Background(), nil, &bytes.Buffer{}); err == nil || !strings.Contains(err.Error(), "--file") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestReportCannotOverwriteEnvFile(t *testing.T) {
	t.Setenv("DB_NAME", "unused")
	dir := t.TempDir()
	manifestPath := filepath.Join(dir, "faculty.json")
	envPath := filepath.Join(dir, ".env")
	data, _ := json.Marshal(fixtureManifest())
	if err := os.WriteFile(manifestPath, data, 0600); err != nil {
		t.Fatal(err)
	}
	const envText = "DB_NAME=unused\n"
	if err := os.WriteFile(envPath, []byte(envText), 0600); err != nil {
		t.Fatal(err)
	}
	err := run(context.Background(), []string{"--file", manifestPath, "--env-file", envPath, "--report", envPath}, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "report must not overwrite") {
		t.Fatalf("unexpected error: %v", err)
	}
	after, err := os.ReadFile(envPath)
	if err != nil || string(after) != envText {
		t.Fatalf("env file changed: %q, %v", after, err)
	}
}

func TestCommitOutcomeReporting(t *testing.T) {
	for _, test := range []struct {
		name               string
		commitErr          error
		status             string
		applied, reconcile bool
		inserted           int
	}{
		{"success", nil, "committed", true, false, 1},
		{"definite rollback", pgx.ErrTxCommitRollback, "rolled_back", false, false, 0},
		{"lost response", context.DeadlineExceeded, "unknown", false, true, 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			report := newReport(fixtureManifest(), "checksum", true)
			attempted := []string{"alex@zu.ac.ae"}
			err := finishCommit(&report, attempted, test.commitErr)
			if (err != nil) != (test.commitErr != nil) || report.CommitStatus != test.status || report.Applied != test.applied || report.NeedsReconciliation != test.reconcile || report.Counts.Inserted != test.inserted {
				t.Fatalf("unexpected commit report: %+v, %v", report, err)
			}
			if !reflect.DeepEqual(report.AttemptedEmails, attempted) || len(report.InsertedEmails) != test.inserted {
				t.Fatalf("email evidence lost: %+v", report)
			}
			if test.reconcile && !strings.Contains(err.Error(), "reconcile") {
				t.Fatal("uncertain commit must require reconciliation")
			}
		})
	}
}
