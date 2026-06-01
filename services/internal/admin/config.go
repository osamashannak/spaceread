package admin

import (
	"context"

	"github.com/osamashannak/uaeu-space/services/pkg/azure/blobstorage"
	"github.com/osamashannak/uaeu-space/services/pkg/database"
	"github.com/osamashannak/uaeu-space/services/pkg/gateway"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/sethvargo/go-envconfig"
)

type Config struct {
	Port     string `env:"PORT"`
	Database database.Config
	Azure    blobstorage.Config
	Gateway  gateway.Config
}

func Setup(ctx context.Context) (*Config, error) {
	logger := logging.FromContext(ctx)

	var cfg Config
	if err := envconfig.Process(ctx, &cfg); err != nil {
		return nil, err
	}
	if err := cfg.Gateway.Validate(); err != nil {
		return nil, err
	}

	logger.Infow("configuration loaded", "port", cfg.Port, "db_host", cfg.Database.Host, "db_name", cfg.Database.Name)

	return &cfg, nil
}
