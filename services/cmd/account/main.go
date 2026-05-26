package main

import (
	"context"
	"fmt"
	"os/signal"
	"syscall"

	"github.com/osamashannak/uaeu-space/services/internal/account"
	accountDB "github.com/osamashannak/uaeu-space/services/internal/account/database"
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

	logger.Info("setting up snowflake generator")

	sfGenerator := snowflake.New(1)
	accountStore := accountDB.New(db)

	logger.Info("setting up account server")

	gatewayClient := gateway.New(db, *sfGenerator, cfg.Gateway, accountStore)

	accountServer, err := account.NewServer(accountStore, sfGenerator, gatewayClient, *cfg)
	if err != nil {
		return fmt.Errorf("account.NewServer: %w", err)
	}

	srv, err := server.New(cfg.Port)
	if err != nil {
		return fmt.Errorf("server.New: %w", err)
	}

	logger.Infow("server listening", "port", cfg.Port)

	return srv.ServeHTTP(ctx, accountServer.Routes())
}
