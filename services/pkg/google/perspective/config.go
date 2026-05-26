package perspective

type Config struct {
	Key      string `env:"PERSPECTIVE_KEY"`
	Endpoint string `env:"PERSPECTIVE_ENDPOINT" default:"https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze"`
	Bypass   bool   `env:"PERSPECTIVE_BYPASS, default=false"`
}
