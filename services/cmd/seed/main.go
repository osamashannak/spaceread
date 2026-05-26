package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
	"github.com/osamashannak/uaeu-space/services/pkg/authutil"
	"github.com/osamashannak/uaeu-space/services/pkg/database"
	"github.com/sethvargo/go-envconfig"
)

const (
	devAdminID       int64 = 100001
	devAdminIdentID  int64 = 100101
	devUserID        int64 = 100002
	devUserIdentID   int64 = 100102
	devAdminSession  int64 = 300001
	devUserSession   int64 = 300002
	devGuestSession  int64 = 300003
	devSeedAdvisory  int64 = 88372026001
	devAdminEmail          = "admin@spaceread.local"
	devUserEmail           = "user@spaceread.local"
	devAdminPassword       = "DevAdmin123!"
	devUserPassword        = "DevUser123!"
)

type config struct {
	Database       database.Config
	SeedsPath      string `env:"SEEDS_PATH, default=devdata/seeds"`
	SeedEnv        string `env:"SEED_ENV, default=development"`
	AllowDevSeed   bool   `env:"ALLOW_DEV_SEED, default=false"`
	PasswordPepper string `env:"PASSWORD_PEPPER"`
	LogMode        string `env:"LOG_MODE"`
}

func main() {
	_ = godotenv.Load()

	if err := realMain(context.Background(), os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func realMain(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("seed", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	allowDev := fs.Bool("allow-dev", false, "allow seeding a local development database")
	seedsPath := fs.String("path", "", "path to ordered SQL seed files")
	fs.Usage = func() {
		fmt.Fprintln(fs.Output(), "usage: go run ./cmd/seed [flags]")
		fmt.Fprintln(fs.Output(), "")
		fs.PrintDefaults()
	}

	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		fs.Usage()
		return fmt.Errorf("seed does not accept positional arguments")
	}

	cfg, err := loadConfig(ctx)
	if err != nil {
		return err
	}
	if *allowDev {
		cfg.AllowDevSeed = true
	}
	if *seedsPath != "" {
		cfg.SeedsPath = *seedsPath
	}
	if err := validateDevSeedConfig(cfg); err != nil {
		return err
	}

	db, err := database.NewDB(ctx, &cfg.Database)
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	defer db.Close(ctx)

	if err := ensureSeedHistory(ctx, db); err != nil {
		return err
	}
	if err := applySeed(ctx, db, "000_accounts", seedAccounts(cfg.PasswordPepper)); err != nil {
		return err
	}
	if err := applySQLSeeds(ctx, db, cfg.SeedsPath); err != nil {
		return err
	}

	fmt.Println("dev seed complete")
	fmt.Printf("dev admin: %s / %s\n", devAdminEmail, devAdminPassword)
	fmt.Printf("dev user:  %s / %s\n", devUserEmail, devUserPassword)
	return nil
}

func loadConfig(ctx context.Context) (*config, error) {
	var cfg config
	if err := envconfig.Process(ctx, &cfg); err != nil {
		return nil, fmt.Errorf("load seed config: %w", err)
	}
	return &cfg, nil
}

func validateDevSeedConfig(cfg *config) error {
	if !cfg.AllowDevSeed {
		return errors.New("refusing to seed without --allow-dev or ALLOW_DEV_SEED=true")
	}
	env := strings.ToLower(strings.TrimSpace(cfg.SeedEnv))
	if env != "development" && env != "local" {
		return fmt.Errorf("refusing to seed when SEED_ENV=%q; expected development or local", cfg.SeedEnv)
	}
	if strings.EqualFold(strings.TrimSpace(cfg.LogMode), "production") {
		return errors.New("refusing to seed when LOG_MODE=production")
	}
	if cfg.Database.Name == "" {
		return errors.New("DB_NAME is required")
	}
	if !strings.EqualFold(strings.TrimSpace(cfg.Database.SSLMode), "disable") {
		return errors.New("refusing to seed unless DB_SSLMODE=disable")
	}
	if !isLocalSeedHost(cfg.Database.Host) {
		return fmt.Errorf("refusing to seed non-local DB_HOST=%q", cfg.Database.Host)
	}
	if strings.TrimSpace(cfg.SeedsPath) == "" {
		return errors.New("SEEDS_PATH cannot be empty")
	}
	return nil
}

func isLocalSeedHost(host string) bool {
	switch strings.ToLower(strings.TrimSpace(host)) {
	case "", "localhost", "127.0.0.1", "::1", "postgres", "host.docker.internal":
		return true
	default:
		return false
	}
}

func ensureSeedHistory(ctx context.Context, db *database.DB) error {
	_, err := db.Pool.Exec(ctx, `
CREATE SCHEMA IF NOT EXISTS dev;

CREATE TABLE IF NOT EXISTS dev.seed_history (
    seed_name text PRIMARY KEY,
    applied_at timestamptz DEFAULT now() NOT NULL
)`)
	if err != nil {
		return fmt.Errorf("ensure seed history: %w", err)
	}
	return nil
}

func applySQLSeeds(ctx context.Context, db *database.DB, seedsPath string) error {
	files, err := filepath.Glob(filepath.Join(seedsPath, "*.sql"))
	if err != nil {
		return fmt.Errorf("list seed files: %w", err)
	}
	sort.Strings(files)

	for _, file := range files {
		name := filepath.Base(file)
		content, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("read seed %s: %w", name, err)
		}

		if err := applySeed(ctx, db, name, func(ctx context.Context, tx pgx.Tx) error {
			_, err := tx.Exec(ctx, string(content))
			return err
		}); err != nil {
			return err
		}
	}
	return nil
}

func applySeed(ctx context.Context, db *database.DB, name string, fn func(context.Context, pgx.Tx) error) error {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin seed %s: %w", name, err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, devSeedAdvisory); err != nil {
		return fmt.Errorf("lock seed %s: %w", name, err)
	}

	var applied bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM dev.seed_history WHERE seed_name = $1)`, name).Scan(&applied)
	if err != nil {
		return fmt.Errorf("check seed history for %s: %w", name, err)
	}
	if applied {
		fmt.Printf("skip seed: %s\n", name)
		return nil
	}

	if err := fn(ctx, tx); err != nil {
		return fmt.Errorf("apply seed %s: %w", name, err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO dev.seed_history (seed_name) VALUES ($1)`, name); err != nil {
		return fmt.Errorf("record seed %s: %w", name, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit seed %s: %w", name, err)
	}

	fmt.Printf("applied seed: %s\n", name)
	return nil
}

func seedAccounts(passwordPepper string) func(context.Context, pgx.Tx) error {
	return func(ctx context.Context, tx pgx.Tx) error {
		adminHash, err := authutil.HashPassword(devAdminPassword, passwordPepper)
		if err != nil {
			return err
		}
		userHash, err := authutil.HashPassword(devUserPassword, passwordPepper)
		if err != nil {
			return err
		}

		_, err = tx.Exec(ctx, `
INSERT INTO account."user" (id, username, primary_email, role, status, created_at)
VALUES
    ($1, 'dev_admin', $2, 'admin', 'active', now()),
    ($3, 'dev_user', $4, 'user', 'active', now())
ON CONFLICT (id) DO UPDATE
SET username = EXCLUDED.username,
    primary_email = EXCLUDED.primary_email,
    role = EXCLUDED.role,
    status = EXCLUDED.status`,
			devAdminID, devAdminEmail, devUserID, devUserEmail)
		if err != nil {
			return err
		}

		_, err = tx.Exec(ctx, `
INSERT INTO account.identity (id, user_id, provider, provider_subject, email, password_hash, email_verified, created_at)
VALUES
    ($1, $2, 'password', $3, $3, $4, true, now()),
    ($5, $6, 'password', $7, $7, $8, true, now())
ON CONFLICT (provider, provider_subject) DO UPDATE
SET email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    email_verified = EXCLUDED.email_verified`,
			devAdminIdentID, devAdminID, devAdminEmail, adminHash,
			devUserIdentID, devUserID, devUserEmail, userHash)
		if err != nil {
			return err
		}

		_, err = tx.Exec(ctx, `
INSERT INTO account.session (id, token, user_agent, ip_address, user_id, created_at)
VALUES
    ($1, 'dev-admin-session', 'SpaceRead dev seed', '127.0.0.1', $2, now()),
    ($3, 'dev-user-session', 'SpaceRead dev seed', '127.0.0.1', $4, now()),
    ($5, 'dev-guest-session', 'SpaceRead dev seed', '127.0.0.1', NULL, now())
ON CONFLICT (id) DO UPDATE
SET user_agent = EXCLUDED.user_agent,
    ip_address = EXCLUDED.ip_address,
    user_id = EXCLUDED.user_id`,
			devAdminSession, devAdminID, devUserSession, devUserID, devGuestSession)
		return err
	}
}
