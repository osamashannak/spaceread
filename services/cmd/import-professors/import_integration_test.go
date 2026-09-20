package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// TEST_DATABASE_URL identifies an administrative connection with CREATEDB.
// Changes only affect a new random database, never the configured database.
func newImportTestDatabase(t *testing.T) *pgx.Conn {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to run disposable PostgreSQL import tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	admin, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	random := make([]byte, 8)
	if _, err := rand.Read(random); err != nil {
		t.Fatal(err)
	}
	name := "professor_import_test_" + hex.EncodeToString(random)
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize()); err != nil {
		admin.Close(ctx)
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanupCtx, done := context.WithTimeout(context.Background(), time.Minute)
		defer done()
		if _, err := admin.Exec(cleanupCtx, "DROP DATABASE "+pgx.Identifier{name}.Sanitize()+" WITH (FORCE)"); err != nil {
			t.Errorf("drop test database: %v", err)
		}
		admin.Close(cleanupCtx)
	})
	cfg, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	cfg.Database = name
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close(context.Background()) })
	// Apply the real schema through moderation, including the review FK and
	// metadata fields that an import must preserve.
	migrations := []string{"000001_baseline", "000002_account_auth_and_course_moderation", "000003_notifications", "000004_review_sort_index", "000005_my_space_indexes", "000006_professor_requests", "000007_moderation_foundation"}
	for _, migration := range migrations {
		sql, err := os.ReadFile(filepath.Join("..", "..", "migrations", migration+".up.sql"))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(ctx, string(sql)); err != nil {
			t.Fatalf("apply %s: %v", migration, err)
		}
	}
	return conn
}

func TestImportPostgresDryRunIdempotencyPreservation(t *testing.T) {
	conn := newImportTestDatabase(t)
	ctx := context.Background()
	m := fixtureManifest()
	m.Faculty[0].Email = "ALEX@ZU.AC.AE"
	if err := validateManifest(&m); err != nil {
		t.Fatal(err)
	}
	report, err := importFaculty(ctx, conn, m, "checksum", false)
	if err != nil || !report.DryRun || report.Applied || report.Counts.New != 1 || report.Counts.Inserted != 0 {
		t.Fatalf("dry run: %+v, %v", report, err)
	}
	assertProfessorCount(t, conn, 0)
	report, err = importFaculty(ctx, conn, m, "checksum", true)
	if err != nil || !report.Applied || report.Counts.Inserted != 1 || len(report.InsertedEmails) != 1 || report.InsertedEmails[0] != "alex@zu.ac.ae" {
		t.Fatalf("apply: %+v, %v", report, err)
	}
	execImportTestSQL(t, conn, `UPDATE professor.professor SET views=42, visible=false, aliases=ARRAY['A. Example'], moderation_note='keep this' WHERE email='alex@zu.ac.ae';
        INSERT INTO professor.review(id, score, positive, professor_email) VALUES (1, 4, true, 'alex@zu.ac.ae');`)
	report, err = importFaculty(ctx, conn, m, "checksum", true)
	if err != nil || !report.Applied || report.Counts.Existing != 1 || report.Counts.Inserted != 0 {
		t.Fatalf("repeat: %+v, %v", report, err)
	}
	var preserved bool
	if err := conn.QueryRow(ctx, `SELECT views=42 AND NOT visible AND aliases=ARRAY['A. Example'] AND moderation_note='keep this' AND EXISTS (SELECT 1 FROM professor.review WHERE professor_email=p.email) FROM professor.professor p WHERE email='alex@zu.ac.ae'`).Scan(&preserved); err != nil || !preserved {
		t.Fatalf("existing data changed: %t, %v", preserved, err)
	}
	assertProfessorCount(t, conn, 1)
}

func TestImportPostgresCaseInsensitiveConflicts(t *testing.T) {
	conn := newImportTestDatabase(t)
	ctx := context.Background()
	execImportTestSQL(t, conn, `INSERT INTO professor.professor(email,name,college,university) VALUES
        ('ALEX@ZU.AC.AE','Another Person','College of Business','Another University'),
        ('old.jordan@zu.ac.ae','Jordan Example','College of Business','Zayed University');`)
	m := fixtureManifest()
	jordan := m.Faculty[0]
	jordan.Email = "jordan@zu.ac.ae"
	jordan.Name = "Jordan Example"
	newFaculty := m.Faculty[0]
	newFaculty.Email = "new@zu.ac.ae"
	newFaculty.Name = "New Person"
	m.Faculty = append(m.Faculty, jordan, newFaculty)
	if err := validateManifest(&m); err != nil {
		t.Fatal(err)
	}
	report, err := importFaculty(ctx, conn, m, "checksum", true)
	if err != nil || report.Counts.Conflicts != 2 || report.Counts.Inserted != 1 || report.InsertedEmails[0] != "new@zu.ac.ae" {
		t.Fatalf("conflicts: %+v, %v", report, err)
	}
	assertProfessorCount(t, conn, 3)
	var unchanged bool
	if err := conn.QueryRow(ctx, `SELECT name='Another Person' AND university='Another University' FROM professor.professor WHERE email='ALEX@ZU.AC.AE'`).Scan(&unchanged); err != nil || !unchanged {
		t.Fatalf("conflicting row changed: %v", err)
	}
}

func TestImportPostgresAtomicFailure(t *testing.T) {
	conn := newImportTestDatabase(t)
	ctx := context.Background()
	execImportTestSQL(t, conn, `CREATE FUNCTION professor.fail_import_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.email='zfail@zu.ac.ae' THEN RAISE EXCEPTION 'injected import failure'; END IF; RETURN NEW; END; $$;
        CREATE TRIGGER import_test_failure BEFORE INSERT ON professor.professor FOR EACH ROW EXECUTE FUNCTION professor.fail_import_test();`)
	m := fixtureManifest()
	f := m.Faculty[0]
	f.Email = "zfail@zu.ac.ae"
	f.Name = "Zed Example"
	m.Faculty = append(m.Faculty, f)
	if err := validateManifest(&m); err != nil {
		t.Fatal(err)
	}
	report, err := importFaculty(ctx, conn, m, "checksum", true)
	if err == nil || report.Error == "" || report.Applied || report.Counts.Inserted != 0 || len(report.InsertedEmails) != 0 {
		t.Fatalf("failure report: %+v, %v", report, err)
	}
	assertProfessorCount(t, conn, 0)
}

func execImportTestSQL(t *testing.T, conn *pgx.Conn, sql string) {
	t.Helper()
	if _, err := conn.Exec(context.Background(), sql); err != nil {
		t.Fatal(err)
	}
}

func assertProfessorCount(t *testing.T, conn *pgx.Conn, want int) {
	t.Helper()
	var count int
	if err := conn.QueryRow(context.Background(), "SELECT count(*) FROM professor.professor").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != want {
		t.Fatalf("professor count=%d, want %d", count, want)
	}
}
