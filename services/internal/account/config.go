package account

import (
	"context"

	"github.com/osamashannak/uaeu-space/services/pkg/database"
	"github.com/osamashannak/uaeu-space/services/pkg/gateway"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/sethvargo/go-envconfig"
)

type Config struct {
	Port           string `env:"PORT"`
	GoogleClientID string `env:"GOOGLE_CLIENT_ID"`
	PasswordPepper string `env:"PASSWORD_PEPPER"`
	Database       database.Config
	Gateway        gateway.Config
}

func Setup(ctx context.Context) (*Config, error) {
	logger := logging.FromContext(ctx)

	var cfg Config
	err := envconfig.Process(ctx, &cfg)
	if err != nil {
		return nil, err
	}
	if err := cfg.Gateway.Validate(); err != nil {
		return nil, err
	}

	logger.Infow("configuration loaded", "port", cfg.Port, "db_host", cfg.Database.Host, "db_name", cfg.Database.Name)

	return &cfg, nil
}
