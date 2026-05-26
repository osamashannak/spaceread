package main

import (
	"context"
	accountDB "github.com/osamashannak/uaeu-space/services/internal/account/database"
	"github.com/osamashannak/uaeu-space/services/internal/course"
	courseDB "github.com/osamashannak/uaeu-space/services/internal/course/database"
	"github.com/osamashannak/uaeu-space/services/pkg/azure/blobstorage"
	"github.com/osamashannak/uaeu-space/services/pkg/database"
	"github.com/osamashannak/uaeu-space/services/pkg/gateway"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/osamashannak/uaeu-space/services/pkg/server"
	"github.com/osamashannak/uaeu-space/services/pkg/snowflake"

	"fmt"
	"os/signal"
	"syscall"
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

	cfg, err := course.Setup(ctx)
	if err != nil {
		return fmt.Errorf("setup.Setup: %w", err)
	}

	logger.Info("configuring database")

	db, err := database.NewDB(ctx, &cfg.Database)
	if err != nil {
		return fmt.Errorf("unable to connect to database: %w", err)
	}
	defer db.Close(ctx)

	courseDb := courseDB.New(db)
	accountStore := accountDB.New(db)

	logger.Info("setting up snowflake generator")

	sfGenerator := snowflake.New(1)

	logger.Info("setting up blob storage")

	blobStorage, err := blobstorage.New(cfg.Azure.MaterialsContainer)

	if err != nil {
		return fmt.Errorf("blobstorage.New: %w", err)
	}

	logger.Info("setting up course server")

	gatewayClient := gateway.New(db, *sfGenerator, cfg.Gateway, accountStore)

	courseServer, err := course.NewServer(courseDb, sfGenerator, blobStorage, gatewayClient)
	if err != nil {
		return fmt.Errorf("publish.NewServer: %w", err)
	}

	srv, err := server.New(cfg.Port)
	if err != nil {
		return fmt.Errorf("server.New: %w", err)
	}

	logger.Infow("server listening", "port", cfg.Port)

	return srv.ServeHTTP(ctx, courseServer.Routes())
}
