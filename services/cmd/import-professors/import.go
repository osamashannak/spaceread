package main

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

type existingProfessor struct {
	Email      string `json:"email"`
	Name       string `json:"name"`
	College    string `json:"college"`
	University string `json:"university"`
}

type importConflict struct {
	Faculty  facultyRecord       `json:"faculty"`
	Reason   string              `json:"reason"`
	Existing []existingProfessor `json:"existing"`
}

type importCounts struct {
	Faculty   int `json:"faculty"`
	New       int `json:"new"`
	Existing  int `json:"existing"`
	Conflicts int `json:"conflicts"`
	Inserted  int `json:"inserted"`
}

type importReport struct {
	CommitStatus        string           `json:"commit_status"`
	NeedsReconciliation bool             `json:"needs_reconciliation"`
	AttemptedEmails     []string         `json:"attempted_emails"`
	University          string           `json:"university"`
	RetrievedAt         string           `json:"retrieved_at"`
	ManifestSHA256      string           `json:"manifest_sha256"`
	DryRun              bool             `json:"dry_run"`
	Applied             bool             `json:"applied"`
	Counts              importCounts     `json:"counts"`
	New                 []facultyRecord  `json:"new"`
	Existing            []facultyRecord  `json:"existing"`
	Conflicts           []importConflict `json:"conflicts"`
	InsertedEmails      []string         `json:"inserted_emails"`
	Error               string           `json:"error,omitempty"`
}

func newReport(m facultyManifest, checksum string, apply bool) importReport {
	return importReport{CommitStatus: "not_attempted", AttemptedEmails: []string{}, University: m.University, RetrievedAt: m.RetrievedAt, ManifestSHA256: checksum,
		DryRun: !apply, New: []facultyRecord{}, Existing: []facultyRecord{}, Conflicts: []importConflict{}, InsertedEmails: []string{},
		Counts: importCounts{Faculty: len(m.Faculty)}}
}

func classifyFaculty(m facultyManifest, existing []existingProfessor, report *importReport) {
	byEmail := make(map[string][]existingProfessor)
	byName := make(map[string][]existingProfessor)
	manifestNames := make(map[string]int)
	for _, f := range m.Faculty {
		manifestNames[identityKey(f.Name)]++
	}
	for _, p := range existing {
		key := strings.ToLower(strings.TrimSpace(p.Email))
		byEmail[key] = append(byEmail[key], p)
		if identityKey(p.University) == identityKey(m.University) {
			byName[identityKey(p.Name)] = append(byName[identityKey(p.Name)], p)
		}
	}
	for _, f := range m.Faculty {
		matches := byEmail[f.Email]
		switch {
		case len(matches) > 1:
			report.Conflicts = append(report.Conflicts, importConflict{f, "multiple existing rows share this email ignoring case", matches})
		case len(matches) == 1:
			p := matches[0]
			if identityKey(p.Name) == identityKey(f.Name) && identityKey(p.University) == identityKey(m.University) && identityKey(p.College) == identityKey(f.college()) {
				report.Existing = append(report.Existing, f)
			} else {
				report.Conflicts = append(report.Conflicts, importConflict{f, "existing email has different name, university, or college", matches})
			}
		case len(byName[identityKey(f.Name)]) > 0:
			report.Conflicts = append(report.Conflicts, importConflict{f, "same university and name already exist with a different email", byName[identityKey(f.Name)]})
		case manifestNames[identityKey(f.Name)] > 1:
			report.Conflicts = append(report.Conflicts, importConflict{f, "manifest contains this name with multiple emails; review identity", []existingProfessor{}})
		default:
			report.New = append(report.New, f)
		}
	}
	report.Counts.New = len(report.New)
	report.Counts.Existing = len(report.Existing)
	report.Counts.Conflicts = len(report.Conflicts)
}

func importFaculty(ctx context.Context, conn *pgx.Conn, m facultyManifest, checksum string, apply bool) (report importReport, resultErr error) {
	report = newReport(m, checksum, apply)
	defer func() {
		if resultErr != nil {
			report.Error = resultErr.Error()
		}
	}()
	options := pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly}
	if apply {
		options = pgx.TxOptions{}
	}
	tx, err := conn.BeginTx(ctx, options)
	if err != nil {
		return report, fmt.Errorf("begin import: %w", err)
	}
	defer tx.Rollback(context.Background())
	if apply {
		// The schema's email primary key is case-sensitive. Lock out concurrent
		// writes while checking and inserting to enforce lowercase identity.
		if _, err := tx.Exec(ctx, "SET LOCAL lock_timeout = '15s'"); err != nil {
			return report, err
		}
		if _, err := tx.Exec(ctx, "LOCK TABLE professor.professor IN SHARE ROW EXCLUSIVE MODE"); err != nil {
			return report, fmt.Errorf("lock professors: %w", err)
		}
	}
	emails := make([]string, len(m.Faculty))
	for i, f := range m.Faculty {
		emails[i] = f.Email
	}
	rows, err := tx.Query(ctx, `SELECT email, name, college, university FROM professor.professor
        WHERE lower(btrim(email)) = ANY($1::text[]) OR lower(regexp_replace(btrim(university), '\s+', ' ', 'g')) = lower($2)
        ORDER BY email`, emails, m.University)
	if err != nil {
		return report, fmt.Errorf("read existing professors: %w", err)
	}
	existing, err := pgx.CollectRows(rows, pgx.RowToStructByPos[existingProfessor])
	if err != nil {
		return report, fmt.Errorf("read existing professors: %w", err)
	}
	classifyFaculty(m, existing, &report)
	if !apply {
		return report, nil
	}
	insertedEmails := make([]string, 0, len(report.New))
	for _, f := range report.New {
		if _, err := tx.Exec(ctx, `INSERT INTO professor.professor (email, name, college, university) VALUES ($1, $2, $3, $4)`, f.Email, f.Name, f.college(), m.University); err != nil {
			return report, fmt.Errorf("insert %s (entire batch rolled back): %w", f.Email, err)
		}
		insertedEmails = append(insertedEmails, f.Email)
	}
	if err := finishCommit(&report, insertedEmails, tx.Commit(ctx)); err != nil {
		return report, err
	}
	return report, nil
}

// A lost COMMIT response is not proof of rollback. Keep confirmed inserts
// separate from attempted emails so operators can reconcile before retrying.
func finishCommit(report *importReport, attempted []string, commitErr error) error {
	report.AttemptedEmails = attempted
	if commitErr != nil {
		if errors.Is(commitErr, pgx.ErrTxCommitRollback) {
			report.CommitStatus = "rolled_back"
			return fmt.Errorf("commit rolled back: %w", commitErr)
		}
		report.CommitStatus = "unknown"
		report.NeedsReconciliation = true
		return fmt.Errorf("commit outcome unknown; reconcile attempted_emails against the database before retrying: %w", commitErr)
	}
	report.CommitStatus = "committed"
	report.Applied = true
	report.InsertedEmails = attempted
	report.Counts.Inserted = len(attempted)
	return nil
}
