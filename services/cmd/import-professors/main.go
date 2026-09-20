package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
	"github.com/osamashannak/uaeu-space/services/pkg/database"
	"github.com/sethvargo/go-envconfig"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, output io.Writer) error {
	fs := flag.NewFlagSet("import-professors", flag.ContinueOnError)
	file := fs.String("file", "", "reviewed faculty JSON manifest (required)")
	apply := fs.Bool("apply", false, "commit new professors; default is a read-only dry run")
	envFile := fs.String("env-file", "", "explicit dotenv file; existing environment variables take precedence")
	reportPath := fs.String("report", "", "write JSON report to this file instead of stdout")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 || *file == "" {
		return errors.New("usage: import-professors --file <manifest.json> [--env-file <file>] [--apply] [--report <report.json>]")
	}
	manifest, checksum, err := readManifest(*file)
	if err != nil {
		return err
	}
	if *envFile != "" {
		if err := godotenv.Load(*envFile); err != nil {
			return fmt.Errorf("load env file: %w", err)
		}
	}
	var cfg struct{ Database database.Config }
	if err := envconfig.Process(ctx, &cfg); err != nil {
		return fmt.Errorf("load database config: %w", err)
	}
	if cfg.Database.Name == "" {
		return errors.New("DB_NAME is required; use DB_* environment variables or --env-file")
	}
	// Open the report before mutating the database, so an invalid path cannot
	// cause an unreported successful import. Never overwrite the input manifest.
	if *reportPath != "" {
		if *envFile != "" {
			if err := distinctFiles(*envFile, *reportPath); err != nil {
				return errors.New("report must not overwrite the env file")
			}
		}
		if err := distinctFiles(*file, *reportPath); err != nil {
			return err
		}
		reportFile, err := os.OpenFile(*reportPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
		if err != nil {
			return fmt.Errorf("open report: %w", err)
		}
		defer reportFile.Close()
		output = reportFile
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	conn, err := pgx.Connect(ctx, cfg.Database.ConnectionURL())
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	defer conn.Close(context.Background())
	result, importErr := importFaculty(ctx, conn, manifest, checksum, *apply)
	encoder := json.NewEncoder(output)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("write report (database committed=%t, inserted=%d): %w", result.Applied, result.Counts.Inserted, err)
	}
	return importErr
}
