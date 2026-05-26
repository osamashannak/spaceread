package perspective

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/osamashannak/uaeu-space/services/pkg/logging"
	"io"
	"net/http"
	"time"
)

const (
	threshold = 0.5
)

type Perspective struct {
	config *Config
	client *http.Client
}

func New(config *Config) *Perspective {
	return &Perspective{
		config: config,
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (p *Perspective) Analyze(commentText string) *AnalysisResult {
	result := &AnalysisResult{
		Language: "en",
	}

	if p.config != nil && p.config.Bypass {
		logging.DefaultLogger().Debug("perspective analysis bypassed")
		return result
	}

	request := RequestBody{
		Comment:         Comment{Text: commentText},
		SpanAnnotations: true,
		RequestedAttributes: map[string]Attribute{
			"TOXICITY":        {ScoreThreshold: threshold},
			"SEVERE_TOXICITY": {ScoreThreshold: threshold},
			"IDENTITY_ATTACK": {ScoreThreshold: threshold},
			"INSULT":          {ScoreThreshold: threshold},
			"PROFANITY":       {ScoreThreshold: threshold},
			"THREAT":          {ScoreThreshold: threshold},
		},
	}

	body, err := json.Marshal(request)
	if err != nil {
		fmt.Println("Error marshaling request body:", err)
		return result
	}

	url := fmt.Sprintf("%s?key=%s", p.config.Endpoint, p.config.Key)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		fmt.Println("Error creating HTTP request:", err)
		return result
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		fmt.Println("Error making HTTP request:", err)
		return result
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Println("Error reading response body:", err)
		return result
	}

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Perspective API returned non-200 status: %d: %s\n", resp.StatusCode, string(raw))
		return result
	}

	var parsed ResponseBody
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return result
	}

	for attr, score := range parsed.AttributeScores {
		val := score.SummaryScore.Value
		if val >= threshold {
			switch attr {
			case "TOXICITY":
				result.Toxicity = &val
			case "SEVERE_TOXICITY":
				result.SevereToxicity = &val
			case "IDENTITY_ATTACK":
				result.IdentityAttack = &val
			case "INSULT":
				result.Insult = &val
			case "PROFANITY":
				result.Profanity = &val
			case "THREAT":
				result.Threat = &val
			}
		}
	}

	for _, lang := range parsed.DetectedLanguages {
		if lang == "ar" {
			result.Language = lang
			break
		}
	}

	return result

}

func (r *AnalysisResult) Flagged() bool {
	return r.Toxicity != nil || r.SevereToxicity != nil ||
		r.IdentityAttack != nil || r.Insult != nil ||
		r.Profanity != nil || r.Threat != nil
}
