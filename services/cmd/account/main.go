package main

import (
	"context"
	"errors"
	"fmt"
	"os/signal"
	"syscall"
	"time"

	"github.com/osamashannak/uaeu-space/services/internal/account"
	accountDB "github.com/osamashannak/uaeu-space/services/internal/account/database"
	authsessionstore "github.com/osamashannak/uaeu-space/services/pkg/authsession/postgres"
	"github.com/osamashannak/uaeu-space/services/pkg/database"
	"github.com/osamashannak/uaeu-space/services/pkg/gateway"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/osamashannak/uaeu-space/services/pkg/server"
	"github.com/osamashannak/uaeu-space/services/pkg/snowflake"
)

func main() {
	ctx, done := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)

	logger := logging.NewLoggerFromEnv()
	ctx = logging.WithLogger(ctx, logger)

	defer func() {
		done()
		if r := recover(); r != nil {
			logger.Fatalw("application panic", "panic", r)
		}
	}()

	err := realMain(ctx)
	done()

	if err != nil {
		logger.Fatal(err)
	}
	logger.Info("successful shutdown")
}

func realMain(ctx context.Context) error {
	logger := logging.FromContext(ctx)

	cfg, err := account.Setup(ctx)
	if err != nil {
		return fmt.Errorf("account.Setup: %w", err)
	}

	logger.Info("configuring database")

	db, err := database.NewDB(ctx, &cfg.Database)
	if err != nil {
		return fmt.Errorf("unable to connect to database: %w", err)
	}
	defer db.Close(ctx)

	logger.Info("acquiring snowflake worker lease")

	workerLease, err := snowflake.AcquireWorkerLease(ctx, db.Pool, snowflake.WorkerLeaseConfig{
		Owner: "account",
	})
	if err != nil {
		return fmt.Errorf("acquire snowflake worker lease: %w", err)
	}
	defer func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := workerLease.Close(closeCtx); err != nil {
			logger.Errorw("failed to close snowflake worker lease", "worker_id", workerLease.WorkerID(), "error", err)
		}
	}()

	serviceCtx, cancelService := context.WithCancelCause(ctx)
	defer cancelService(nil)
	go func() {
		select {
		case <-workerLease.Lost():
			leaseErr := workerLease.Err()
			if leaseErr == nil {
				leaseErr = snowflake.ErrWorkerLeaseLost
			}
			logger.Errorw("snowflake worker lease lost", "worker_id", workerLease.WorkerID(), "error", leaseErr)
			cancelService(leaseErr)
		case <-serviceCtx.Done():
		}
	}()

	sfGenerator := snowflake.NewLeasedGenerator(workerLease)
	logger.Infow("snowflake worker lease acquired", "worker_id", workerLease.WorkerID(), "owner", workerLease.Owner())
	accountStore := accountDB.New(db)
	authSessionStore := authsessionstore.New(db)

	logger.Info("setting up account server")

	gatewayClient := gateway.New(authSessionStore, sfGenerator, cfg.Gateway, authSessionStore)

	accountServer, err := account.NewServer(accountStore, sfGenerator, gatewayClient, *cfg)
	if err != nil {
		return fmt.Errorf("account.NewServer: %w", err)
	}

	srv, err := server.New(cfg.Port)
	if err != nil {
		return fmt.Errorf("server.New: %w", err)
	}

	logger.Infow("server listening", "port", cfg.Port)

	serveErr := srv.ServeHTTP(serviceCtx, accountServer.Routes())
	if cause := context.Cause(serviceCtx); errors.Is(cause, snowflake.ErrWorkerLeaseLost) {
		return errors.Join(serveErr, cause)
	}
	return serveErr
}
