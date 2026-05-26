package professor

import (
	"context"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/osamashannak/uaeu-space/services/pkg/azure/blobstorage"
	"github.com/osamashannak/uaeu-space/services/pkg/azure/vision"
	"github.com/osamashannak/uaeu-space/services/pkg/database"
	"github.com/osamashannak/uaeu-space/services/pkg/gateway"
	"github.com/osamashannak/uaeu-space/services/pkg/google/perspective"
	"github.com/osamashannak/uaeu-space/services/pkg/google/recaptcha"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"github.com/sethvargo/go-envconfig"
)

type Config struct {
	Port        string `env:"PORT"`
	Database    database.Config
	Azure       blobstorage.Config
	AWS         aws.Config
	Vision      vision.Config
	Recaptcha   recaptcha.Config
	Perspective perspective.Config
	Gateway     gateway.Config
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
