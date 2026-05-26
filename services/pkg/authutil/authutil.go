package authutil

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	argon2idMemory      uint32 = 64 * 1024
	argon2idIterations  uint32 = 3
	argon2idParallelism uint8  = 1
	argon2idSaltLength         = 16
	argon2idKeyLength   uint32 = 32
)

func GenerateOpaqueToken() (string, error) {
	bytes := make([]byte, 48)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func HashToken(token string) (string, error) {
	if token == "" {
		return "", fmt.Errorf("authutil: token must not be empty")
	}
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:]), nil
}

func HashPassword(password, pepper string) (string, error) {
	salt := make([]byte, argon2idSaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	input := applyPepper(password, pepper)
	key := argon2.IDKey(input, salt, argon2idIterations, argon2idMemory, argon2idParallelism, argon2idKeyLength)

	return fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		argon2idMemory,
		argon2idIterations,
		argon2idParallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

func CheckPassword(hash, password, pepper string) bool {
	iterations, memory, parallelism, salt, key, err := parseArgon2idHash(hash)
	if err != nil {
		return false
	}

	input := applyPepper(password, pepper)
	comparisonKey := argon2.IDKey(input, salt, iterations, memory, parallelism, uint32(len(key)))
	return subtle.ConstantTimeCompare(key, comparisonKey) == 1
}

func applyPepper(password, pepper string) []byte {
	if pepper == "" {
		return []byte(password)
	}
	mac := hmac.New(sha256.New, []byte(pepper))
	mac.Write([]byte(password))
	return mac.Sum(nil)
}

func parseArgon2idHash(encoded string) (iterations uint32, memory uint32, parallelism uint8, salt []byte, key []byte, err error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return 0, 0, 0, nil, nil, fmt.Errorf("invalid password hash format")
	}
	if parts[2] != fmt.Sprintf("v=%d", argon2.Version) {
		return 0, 0, 0, nil, nil, fmt.Errorf("unsupported argon2id version")
	}

	params := strings.Split(parts[3], ",")
	if len(params) != 3 {
		return 0, 0, 0, nil, nil, fmt.Errorf("invalid argon2id parameters")
	}

	for _, param := range params {
		keyValue := strings.SplitN(param, "=", 2)
		if len(keyValue) != 2 {
			return 0, 0, 0, nil, nil, fmt.Errorf("invalid argon2id parameter")
		}

		value, parseErr := strconv.ParseUint(keyValue[1], 10, 32)
		if parseErr != nil {
			return 0, 0, 0, nil, nil, parseErr
		}

		switch keyValue[0] {
		case "m":
			memory = uint32(value)
		case "t":
			iterations = uint32(value)
		case "p":
			if value > 255 {
				return 0, 0, 0, nil, nil, fmt.Errorf("invalid argon2id parallelism")
			}
			parallelism = uint8(value)
		default:
			return 0, 0, 0, nil, nil, fmt.Errorf("unknown argon2id parameter: %q", keyValue[0])
		}
	}

	if iterations == 0 || memory == 0 || parallelism == 0 {
		return 0, 0, 0, nil, nil, fmt.Errorf("missing argon2id parameter")
	}

	salt, err = base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return 0, 0, 0, nil, nil, err
	}

	key, err = base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return 0, 0, 0, nil, nil, err
	}

	// Enforce minimum lengths, not just non-empty, to reject truncated/corrupt hashes.
	if len(salt) < argon2idSaltLength {
		return 0, 0, 0, nil, nil, fmt.Errorf("argon2id salt too short: got %d bytes, want %d", len(salt), argon2idSaltLength)
	}
	if uint32(len(key)) < argon2idKeyLength {
		return 0, 0, 0, nil, nil, fmt.Errorf("argon2id key too short: got %d bytes, want %d", len(key), argon2idKeyLength)
	}

	return iterations, memory, parallelism, salt, key, nil
}