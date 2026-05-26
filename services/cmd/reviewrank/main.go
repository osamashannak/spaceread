package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	profDB "github.com/osamashannak/uaeu-space/services/internal/professor/database"
	"github.com/osamashannak/uaeu-space/services/pkg/database"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/sethvargo/go-envconfig"
)

type config struct {
	Database  database.Config
	BatchSize int `env:"REVIEW_RANK_BATCH_SIZE, default=500"`
}

func main() {
	_ = godotenv.Load()

	ctx, done := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer done()

	logger := logging.DefaultLogger()
	ctx = logging.WithLogger(ctx, logger)

	if err := realMain(ctx, os.Args[1:]); err != nil {
		logger.Fatal(err)
	}
}

func realMain(ctx context.Context, args []string) error {
	command := "refresh"
	if len(args) > 0 && args[0] != "" && args[0][0] != '-' {
		command = args[0]
		args = args[1:]
	}

	var cfg config
	if err := envconfig.Process(ctx, &cfg); err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 500
	}

	fs := flag.NewFlagSet("reviewrank "+command, flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	batchSize := fs.Int("batch-size", cfg.BatchSize, "number of reviews to recompute per batch")
	fs.Usage = func() {
		fmt.Fprintln(fs.Output(), "usage: reviewrank [refresh|backfill] [flags]")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return errors.New("reviewrank does not accept positional arguments after the command")
	}
	if *batchSize <= 0 {
		return errors.New("batch-size must be positive")
	}

	db, err := database.NewDB(ctx, &cfg.Database)
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	defer db.Close(ctx)

	reviews := profDB.New(db)
	unlock, locked, err := reviews.TryAcquireReviewRankingLock(ctx)
	if err != nil {
		return fmt.Errorf("acquire ranking lock: %w", err)
	}
	if !locked {
		logging.FromContext(ctx).Info("another review ranking job is already running")
		return nil
	}
	defer func() {
		if err := unlock(context.Background()); err != nil {
			logging.FromContext(ctx).Warnf("failed to release review ranking lock: %v", err)
		}
	}()

	switch command {
	case "refresh":
		return process(ctx, reviews, *batchSize, reviews.ListReviewIDsForRankingRefresh)
	case "backfill":
		return process(ctx, reviews, *batchSize, reviews.ListReviewIDsForRankingBackfill)
	default:
		return fmt.Errorf("unknown command %q", command)
	}
}

func process(
	ctx context.Context,
	reviews *profDB.ProfessorDB,
	batchSize int,
	list func(context.Context, int64, int) ([]int64, error),
) error {
	logger := logging.FromContext(ctx)
	now := time.Now()
	total := 0
	lastID := int64(0)

	for {
		ids, err := list(ctx, lastID, batchSize)
		if err != nil {
			return fmt.Errorf("list reviews after %d: %w", lastID, err)
		}
		if len(ids) == 0 {
			break
		}

		updated, err := reviews.RecomputeReviewSortIndexes(ctx, ids, now)
		if err != nil {
			return fmt.Errorf("recompute reviews after %d: %w", lastID, err)
		}

		total += updated
		lastID = ids[len(ids)-1]
		logger.Infow("review ranking batch complete", "updated", updated, "total", total, "last_id", lastID)
	}

	logger.Infow("review ranking complete", "updated", total)
	return nil
}
