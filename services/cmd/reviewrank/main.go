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
	Database    database.Config
	BatchSize   int           `env:"REVIEW_RANK_BATCH_SIZE, default=100"`
	ReviewDelay time.Duration `env:"REVIEW_RANK_REVIEW_DELAY, default=200ms"`
	BatchDelay  time.Duration `env:"REVIEW_RANK_BATCH_DELAY, default=0s"`
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
		cfg.BatchSize = 100
	}

	fs := flag.NewFlagSet("reviewrank "+command, flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	batchSize := fs.Int("batch-size", cfg.BatchSize, "number of reviews to recompute per batch")
	reviewDelay := fs.Duration("review-delay", cfg.ReviewDelay, "target delay per review, applied between bulk batches")
	batchDelay := fs.Duration("batch-delay", cfg.BatchDelay, "delay between batches")
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
	if *reviewDelay < 0 {
		return errors.New("review-delay cannot be negative")
	}
	if *batchDelay < 0 {
		return errors.New("batch-delay cannot be negative")
	}

	db, err := database.NewDB(ctx, &cfg.Database)
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	defer db.Close(ctx)

	logger := logging.FromContext(ctx)
	logger.Infow(
		"review ranking job starting",
		"command", command,
		"batch_size", *batchSize,
		"review_delay", reviewDelay.String(),
		"batch_delay", batchDelay.String(),
		"pool_max_conns", db.Pool.Config().MaxConns,
	)
	if db.Pool.Config().MaxConns < 2 {
		return fmt.Errorf("reviewrank requires DB_POOL_MAX_CONNS >= 2 when using a transaction advisory lock; current pool_max_conns=%d", db.Pool.Config().MaxConns)
	}

	reviews := profDB.New(db)
	unlock, locked, err := reviews.TryAcquireReviewRankingLock(ctx)
	if err != nil {
		return fmt.Errorf("acquire ranking lock: %w", err)
	}
	if !locked {
		logLockHolders(ctx, reviews)
		return nil
	}
	logger.Infow("review ranking lock acquired", "command", command)
	defer func() {
		if err := unlock(context.Background()); err != nil {
			logging.FromContext(ctx).Warnf("failed to release review ranking lock: %v", err)
		}
	}()

	switch command {
	case "refresh":
		return process(ctx, reviews, *batchSize, *reviewDelay, *batchDelay, reviews.ListReviewIDsForRankingRefresh)
	case "backfill":
		return process(ctx, reviews, *batchSize, *reviewDelay, *batchDelay, reviews.ListReviewIDsForRankingBackfill)
	default:
		return fmt.Errorf("unknown command %q", command)
	}
}

func logLockHolders(ctx context.Context, reviews *profDB.ProfessorDB) {
	logger := logging.FromContext(ctx)
	holders, err := reviews.GetReviewRankingLockHolders(ctx)
	if err != nil {
		logger.Warnw("another review ranking job is already running; failed to inspect advisory lock holder", "error", err)
		return
	}

	logger.Infow(
		"another review ranking job is already running",
		"lock_holder_count", len(holders),
		"lock_holders", holders,
	)
}

func process(
	ctx context.Context,
	reviews *profDB.ProfessorDB,
	batchSize int,
	reviewDelay time.Duration,
	batchDelay time.Duration,
	list func(context.Context, int64, int) ([]int64, error),
) error {
	logger := logging.FromContext(ctx)
	now := time.Now()
	total := 0
	lastID := int64(0)
	batchNumber := 0

	for {
		logger.Infow("review ranking list started", "after_id", lastID, "batch_size", batchSize)
		listStarted := time.Now()
		ids, err := list(ctx, lastID, batchSize)
		if err != nil {
			return fmt.Errorf("list reviews after %d: %w", lastID, err)
		}
		logger.Infow(
			"review ranking list complete",
			"after_id", lastID,
			"found", len(ids),
			"duration_ms", time.Since(listStarted).Milliseconds(),
		)
		if len(ids) == 0 {
			break
		}

		batchNumber++
		firstID := ids[0]
		nextLastID := ids[len(ids)-1]
		logger.Infow(
			"review ranking batch started",
			"batch", batchNumber,
			"count", len(ids),
			"first_id", firstID,
			"last_id", nextLastID,
		)
		batchStarted := time.Now()
		updated, err := reviews.RecomputeReviewSortIndexes(ctx, ids, now)
		if err != nil {
			return fmt.Errorf("recompute reviews after %d: %w", lastID, err)
		}

		total += updated
		lastID = nextLastID
		logger.Infow(
			"review ranking batch complete",
			"batch", batchNumber,
			"updated", updated,
			"total", total,
			"last_id", lastID,
			"duration_ms", time.Since(batchStarted).Milliseconds(),
		)
		if reviewDelay > 0 {
			delay := reviewDelay * time.Duration(len(ids))
			logger.Debugw("review ranking pacing delay started", "delay", delay.String())
			if err := sleep(ctx, delay); err != nil {
				return err
			}
		}
		if batchDelay > 0 {
			logger.Debugw("review ranking batch delay started", "delay", batchDelay.String())
			if err := sleep(ctx, batchDelay); err != nil {
				return err
			}
		}
	}

	logger.Infow("review ranking complete", "updated", total, "batches", batchNumber)
	return nil
}

func sleep(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
