package snowflake

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// DefaultAdvisoryLockNamespace isolates Snowflake worker locks from other
	// advisory-lock users in the same PostgreSQL database. It is the ASCII
	// representation of "UAEU" interpreted as a signed 32-bit integer.
	DefaultAdvisoryLockNamespace int32 = 0x55414555

	defaultHealthCheckInterval = time.Second
	defaultHealthCheckTimeout  = 2 * time.Second
	defaultReuseCooldown       = 5 * time.Second
	connectionCloseTimeout     = 5 * time.Second
	maxDuration                = time.Duration(1<<63 - 1)
)

var (
	ErrNoWorkerAvailable  = errors.New("no Snowflake worker ID is available")
	ErrWorkerLeaseLost    = errors.New("Snowflake worker lease lost")
	ErrWorkerLeaseClosed  = errors.New("Snowflake worker lease closed")
	ErrWorkerLeaseInvalid = errors.New("Snowflake worker lease is not initialized")
	ErrInvalidLeaseConfig = errors.New("invalid Snowflake worker lease configuration")
)

// WorkerLeaseConfig controls allocation and monitoring of a Snowflake worker
// ID. Zero duration values select the safe defaults documented below.
//
// Worker 1 is reserved by default so that a leasing deployment can safely run
// alongside an older deployment which is still hard-coded to worker 1. Set
// AllowLegacyWorkerOne only after every such deployment has drained.
//
// ReuseCooldown is the period a newly acquired worker remains idle before it
// can be used. It must be greater than HealthCheckInterval +
// HealthCheckTimeout. A lease-bound generator refuses to emit IDs when its
// last successful heartbeat is older than that sum. The extra cooldown gives
// a previous holder time to observe a lost database session and fail closed
// before the worker is reused. It should also exceed the maximum expected
// cross-host clock skew. The defaults are one-second health checks, a
// two-second check timeout, and a five-second reuse cooldown.
//
// Session advisory locks require a direct or session-pooled PostgreSQL
// connection. Transaction-pooled proxies are not supported.
type WorkerLeaseConfig struct {
	Owner                 string
	AdvisoryLockNamespace int32
	AllowLegacyWorkerOne  bool
	HealthCheckInterval   time.Duration
	HealthCheckTimeout    time.Duration
	ReuseCooldown         time.Duration
}

type normalizedWorkerLeaseConfig struct {
	owner                string
	namespace            int32
	allowLegacyWorkerOne bool
	healthCheckInterval  time.Duration
	healthCheckTimeout   time.Duration
	reuseCooldown        time.Duration
}

func (cfg WorkerLeaseConfig) normalize() (normalizedWorkerLeaseConfig, error) {
	if cfg.HealthCheckInterval < 0 || cfg.HealthCheckTimeout < 0 || cfg.ReuseCooldown < 0 {
		return normalizedWorkerLeaseConfig{}, fmt.Errorf("%w: durations cannot be negative", ErrInvalidLeaseConfig)
	}

	normalized := normalizedWorkerLeaseConfig{
		owner:                cfg.Owner,
		namespace:            cfg.AdvisoryLockNamespace,
		allowLegacyWorkerOne: cfg.AllowLegacyWorkerOne,
		healthCheckInterval:  cfg.HealthCheckInterval,
		healthCheckTimeout:   cfg.HealthCheckTimeout,
		reuseCooldown:        cfg.ReuseCooldown,
	}
	if normalized.namespace == 0 {
		normalized.namespace = DefaultAdvisoryLockNamespace
	}
	if normalized.healthCheckInterval == 0 {
		normalized.healthCheckInterval = defaultHealthCheckInterval
	}
	if normalized.healthCheckTimeout == 0 {
		normalized.healthCheckTimeout = defaultHealthCheckTimeout
	}
	if normalized.reuseCooldown == 0 {
		normalized.reuseCooldown = defaultReuseCooldown
	}

	if normalized.healthCheckInterval > maxDuration-normalized.healthCheckTimeout {
		return normalizedWorkerLeaseConfig{}, fmt.Errorf("%w: health interval plus timeout overflows time.Duration", ErrInvalidLeaseConfig)
	}
	maximumHeartbeatStaleness := normalized.healthCheckInterval + normalized.healthCheckTimeout
	if normalized.reuseCooldown <= maximumHeartbeatStaleness {
		return normalizedWorkerLeaseConfig{}, fmt.Errorf(
			"%w: reuse cooldown %s must be greater than health interval plus timeout (%s)",
			ErrInvalidLeaseConfig,
			normalized.reuseCooldown,
			maximumHeartbeatStaleness,
		)
	}

	return normalized, nil
}

type workerLeaseConnection interface {
	tryAdvisoryLock(context.Context, int32, int) (bool, error)
	advisoryUnlock(context.Context, int32, int) (bool, error)
	heartbeat(context.Context) error
	release()
	destroy(context.Context) error
}

type pgxWorkerLeaseConnection struct {
	conn *pgxpool.Conn
}

func (c *pgxWorkerLeaseConnection) tryAdvisoryLock(ctx context.Context, namespace int32, workerID int) (bool, error) {
	var locked bool
	err := c.conn.QueryRow(
		ctx,
		`SELECT pg_try_advisory_lock($1::integer, $2::integer)`,
		namespace,
		workerID,
	).Scan(&locked)
	return locked, err
}

func (c *pgxWorkerLeaseConnection) advisoryUnlock(ctx context.Context, namespace int32, workerID int) (bool, error) {
	var unlocked bool
	err := c.conn.QueryRow(
		ctx,
		`SELECT pg_advisory_unlock($1::integer, $2::integer)`,
		namespace,
		workerID,
	).Scan(&unlocked)
	return unlocked, err
}

func (c *pgxWorkerLeaseConnection) heartbeat(ctx context.Context) error {
	var one int
	return c.conn.QueryRow(ctx, `SELECT 1`).Scan(&one)
}

func (c *pgxWorkerLeaseConnection) release() {
	c.conn.Release()
}

func (c *pgxWorkerLeaseConnection) destroy(ctx context.Context) error {
	return c.conn.Hijack().Close(ctx)
}

type workerLeaseState uint32

const (
	workerLeaseInvalid workerLeaseState = iota
	workerLeaseHealthy
	workerLeaseClosing
	workerLeaseLost
	workerLeaseClosed
)

// WorkerLease owns one PostgreSQL session-level advisory lock. The pinned
// connection and lock are never transferred or silently reacquired.
//
// A closed Lost channel means the lease is permanently unsafe. Callers must
// immediately stop generating IDs and shut down the process. Clean Close does
// not close Lost; it changes Healthy to false and makes Err return
// ErrWorkerLeaseClosed.
type WorkerLease struct {
	workerID  int
	namespace int32
	owner     string
	conn      workerLeaseConnection

	monitorCancel context.CancelFunc
	monitorDone   chan struct{}
	lost          chan struct{}

	state atomic.Uint32

	heartbeatMu             sync.RWMutex
	lastSuccessfulHeartbeat time.Time
	maximumHeartbeatAge     time.Duration

	errMu sync.RWMutex
	err   error

	closeOnce sync.Once
	closeDone chan struct{}
	closeErr  error

	connectionCleanupOnce sync.Once
	connectionCleanupErr  error
}

// AcquireWorkerLease pins a connection from pool, probes all eligible worker
// IDs, and holds the first advisory lock it obtains for the lease lifetime.
// It returns only after the reuse cooldown and a successful heartbeat.
func AcquireWorkerLease(ctx context.Context, pool *pgxpool.Pool, cfg WorkerLeaseConfig) (*WorkerLease, error) {
	if pool == nil {
		return nil, fmt.Errorf("%w: PostgreSQL pool is nil", ErrInvalidLeaseConfig)
	}
	if err := validateWorkerLeasePoolCapacity(pool.Config().MaxConns); err != nil {
		return nil, err
	}

	return acquireWorkerLease(
		ctx,
		cfg,
		func(ctx context.Context) (workerLeaseConnection, error) {
			conn, err := pool.Acquire(ctx)
			if err != nil {
				return nil, err
			}
			return &pgxWorkerLeaseConnection{conn: conn}, nil
		},
		waitForCooldown,
	)
}

func validateWorkerLeasePoolCapacity(maxConnections int32) error {
	if maxConnections < 2 {
		return fmt.Errorf(
			"%w: PostgreSQL pool_max_conns must be at least 2 because the Snowflake worker lease pins one connection (got %d)",
			ErrInvalidLeaseConfig,
			maxConnections,
		)
	}
	return nil
}

type workerLeaseAcquireFunc func(context.Context) (workerLeaseConnection, error)
type workerLeaseWaitFunc func(context.Context, time.Duration) error

func acquireWorkerLease(
	ctx context.Context,
	cfg WorkerLeaseConfig,
	acquire workerLeaseAcquireFunc,
	wait workerLeaseWaitFunc,
) (*WorkerLease, error) {
	normalized, err := cfg.normalize()
	if err != nil {
		return nil, err
	}

	normalized.owner, err = resolveWorkerLeaseOwner(normalized.owner)
	if err != nil {
		return nil, fmt.Errorf("build Snowflake worker lease owner identity: %w", err)
	}

	conn, err := acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire dedicated PostgreSQL connection for Snowflake worker lease owner %q: %w", normalized.owner, err)
	}

	candidates, err := workerProbeOrder(normalized.owner, normalized.allowLegacyWorkerOne)
	if err != nil {
		conn.release()
		return nil, fmt.Errorf("choose Snowflake worker probe order: %w", err)
	}

	for _, workerID := range candidates {
		locked, lockErr := conn.tryAdvisoryLock(ctx, normalized.namespace, workerID)
		if lockErr != nil {
			// The result of a failed round trip is ambiguous: PostgreSQL may have
			// granted the lock before the client observed the error. Destroy the
			// physical session rather than returning it to the pool.
			destroyErr := destroyLeaseConnection(conn)
			return nil, errors.Join(
				fmt.Errorf("probe Snowflake worker %d: %w", workerID, lockErr),
				destroyErr,
			)
		}
		if !locked {
			continue
		}

		if err := wait(ctx, normalized.reuseCooldown); err != nil {
			cleanupErr := unlockOrDestroyLeaseConnection(conn, normalized.namespace, workerID)
			return nil, errors.Join(fmt.Errorf("wait for Snowflake worker %d reuse cooldown: %w", workerID, err), cleanupErr)
		}

		heartbeatCtx, heartbeatCancel := context.WithTimeout(ctx, normalized.healthCheckTimeout)
		heartbeatErr := conn.heartbeat(heartbeatCtx)
		heartbeatCancel()
		if heartbeatErr != nil {
			destroyErr := destroyLeaseConnection(conn)
			return nil, errors.Join(
				fmt.Errorf("verify Snowflake worker %d lease after cooldown: %w", workerID, heartbeatErr),
				destroyErr,
			)
		}

		lease := &WorkerLease{
			workerID:            workerID,
			namespace:           normalized.namespace,
			owner:               normalized.owner,
			conn:                conn,
			monitorDone:         make(chan struct{}),
			lost:                make(chan struct{}),
			closeDone:           make(chan struct{}),
			maximumHeartbeatAge: normalized.healthCheckInterval + normalized.healthCheckTimeout,
		}
		lease.recordSuccessfulHeartbeat(time.Now())
		lease.state.Store(uint32(workerLeaseHealthy))
		monitorCtx, monitorCancel := context.WithCancel(context.Background())
		lease.monitorCancel = monitorCancel
		go lease.monitor(monitorCtx, normalized.healthCheckInterval, normalized.healthCheckTimeout)
		return lease, nil
	}

	conn.release()
	return nil, fmt.Errorf("%w for owner %q", ErrNoWorkerAvailable, normalized.owner)
}

func resolveWorkerLeaseOwner(configured string) (string, error) {
	parts := make([]string, 0, 4)
	appendPart := func(label, value string) {
		value = strings.TrimSpace(value)
		if value != "" {
			parts = append(parts, label+"="+value)
		}
	}

	appendPart("name", configured)
	appendPart("service", os.Getenv("K_SERVICE"))
	appendPart("revision", os.Getenv("K_REVISION"))
	if hostname, err := os.Hostname(); err == nil {
		appendPart("host", hostname)
	}
	if len(parts) != 0 {
		return strings.Join(parts, ","), nil
	}

	var nonce [8]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return "", fmt.Errorf("generate fallback owner nonce: %w", err)
	}
	return "nonce=" + hex.EncodeToString(nonce[:]), nil
}

func workerProbeOrder(owner string, allowLegacyWorkerOne bool) ([]int, error) {
	candidates := make([]int, 0, serverMax+1)
	for workerID := 0; workerID <= serverMax; workerID++ {
		if workerID == 1 && !allowLegacyWorkerOne {
			continue
		}
		candidates = append(candidates, workerID)
	}

	var seed uint64
	if owner == "" {
		var randomSeed [8]byte
		if _, err := rand.Read(randomSeed[:]); err != nil {
			return nil, err
		}
		seed = binary.BigEndian.Uint64(randomSeed[:])
	} else {
		digest := sha256.Sum256([]byte(owner))
		seed = binary.BigEndian.Uint64(digest[:8])
	}

	start := int(seed % uint64(len(candidates)))
	ordered := make([]int, 0, len(candidates))
	ordered = append(ordered, candidates[start:]...)
	ordered = append(ordered, candidates[:start]...)
	return ordered, nil
}

func waitForCooldown(ctx context.Context, cooldown time.Duration) error {
	timer := time.NewTimer(cooldown)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return context.Cause(ctx)
	case <-timer.C:
		return nil
	}
}

func (l *WorkerLease) monitor(ctx context.Context, interval, timeout time.Duration) {
	defer close(l.monitorDone)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			heartbeatCtx, heartbeatCancel := context.WithTimeout(ctx, timeout)
			err := l.conn.heartbeat(heartbeatCtx)
			heartbeatCancel()
			if err == nil {
				switch workerLeaseState(l.state.Load()) {
				case workerLeaseHealthy:
					l.recordSuccessfulHeartbeat(time.Now())
					continue
				case workerLeaseLost:
					if destroyErr := l.destroyPinnedConnection(); destroyErr != nil {
						l.appendError(destroyErr)
					}
					return
				default:
					return
				}
			}
			if ctx.Err() != nil {
				return
			}

			l.markLost(fmt.Errorf("%w: PostgreSQL lease heartbeat failed: %w", ErrWorkerLeaseLost, err))
			if destroyErr := l.destroyPinnedConnection(); destroyErr != nil {
				l.appendError(destroyErr)
			}
			return
		}
	}
}

// WorkerID returns the leased Snowflake worker ID. The value remains available
// after loss or Close for diagnostics. Production callers must use
// NewLeasedGenerator rather than passing this value to New, otherwise lease
// loss cannot stop ID generation.
func (l *WorkerLease) WorkerID() int {
	return l.workerID
}

// Owner returns the diagnostic identity used to distribute worker-ID probes.
func (l *WorkerLease) Owner() string {
	return l.owner
}

// Healthy reports whether the lease may currently be used for ID generation.
func (l *WorkerLease) Healthy() bool {
	return workerLeaseState(l.state.Load()) == workerLeaseHealthy && l.heartbeatIsFresh(time.Now())
}

func (l *WorkerLease) assertHealthy() {
	if workerLeaseState(l.state.Load()) == workerLeaseHealthy {
		if l.heartbeatIsFresh(time.Now()) {
			return
		}
		l.markLost(fmt.Errorf(
			"%w: last successful PostgreSQL heartbeat is older than %s",
			ErrWorkerLeaseLost,
			l.maximumHeartbeatAge,
		))
	}
	if err := l.Err(); err != nil {
		panic(fmt.Errorf("snowflake: refusing to generate an ID without a healthy worker lease: %w", err))
	}
	panic(ErrWorkerLeaseLost)
}

func (l *WorkerLease) recordSuccessfulHeartbeat(at time.Time) {
	l.heartbeatMu.Lock()
	l.lastSuccessfulHeartbeat = at
	l.heartbeatMu.Unlock()
}

func (l *WorkerLease) heartbeatIsFresh(now time.Time) bool {
	l.heartbeatMu.RLock()
	lastSuccessfulHeartbeat := l.lastSuccessfulHeartbeat
	maximumHeartbeatAge := l.maximumHeartbeatAge
	l.heartbeatMu.RUnlock()
	return !lastSuccessfulHeartbeat.IsZero() && maximumHeartbeatAge > 0 && now.Sub(lastSuccessfulHeartbeat) <= maximumHeartbeatAge
}

// Lost is closed exactly once when the lease becomes unsafe. It is not closed
// by a clean Close.
func (l *WorkerLease) Lost() <-chan struct{} {
	return l.lost
}

// Err returns nil for a healthy lease, ErrWorkerLeaseClosed after a clean
// Close, or a wrapped ErrWorkerLeaseLost after an unsafe loss.
func (l *WorkerLease) Err() error {
	l.errMu.RLock()
	err := l.err
	l.errMu.RUnlock()
	if err != nil {
		return err
	}
	if workerLeaseState(l.state.Load()) == workerLeaseInvalid {
		return ErrWorkerLeaseInvalid
	}
	return nil
}

func (l *WorkerLease) markLost(err error) {
	l.errMu.Lock()
	defer l.errMu.Unlock()

	for {
		state := workerLeaseState(l.state.Load())
		if state == workerLeaseInvalid || state == workerLeaseLost || state == workerLeaseClosed {
			return
		}
		if l.state.CompareAndSwap(uint32(state), uint32(workerLeaseLost)) {
			l.err = err
			close(l.lost)
			return
		}
	}
}

func (l *WorkerLease) appendError(err error) {
	l.errMu.Lock()
	l.err = errors.Join(l.err, err)
	l.errMu.Unlock()
}

// Close stops monitoring, explicitly unlocks the worker, and returns the
// pinned connection to the pool. If unlock is ambiguous, it destroys the
// physical connection so PostgreSQL releases every session lock.
func (l *WorkerLease) Close(ctx context.Context) error {
	if l == nil || workerLeaseState(l.state.Load()) == workerLeaseInvalid {
		return ErrWorkerLeaseInvalid
	}
	if ctx == nil {
		ctx = context.Background()
	}
	l.closeOnce.Do(func() {
		defer close(l.closeDone)
		l.errMu.Lock()
		if l.state.CompareAndSwap(uint32(workerLeaseHealthy), uint32(workerLeaseClosing)) {
			l.err = ErrWorkerLeaseClosed
		}
		l.errMu.Unlock()

		l.monitorCancel()
		<-l.monitorDone

		if workerLeaseState(l.state.Load()) == workerLeaseLost {
			if destroyErr := l.destroyPinnedConnection(); destroyErr != nil {
				l.appendError(destroyErr)
			}
			l.closeErr = l.Err()
			return
		}

		unlockCtx, unlockCancel := context.WithTimeout(ctx, connectionCloseTimeout)
		unlocked, err := l.conn.advisoryUnlock(unlockCtx, l.namespace, l.workerID)
		unlockCancel()
		if err != nil || !unlocked {
			unlockErr := err
			if unlockErr == nil {
				unlockErr = errors.New("PostgreSQL reported that the advisory lock was not held")
			}
			l.markLost(fmt.Errorf("%w: release worker %d: %w", ErrWorkerLeaseLost, l.workerID, unlockErr))
			destroyErr := l.destroyPinnedConnection()
			if destroyErr != nil {
				l.appendError(destroyErr)
			}
			l.closeErr = l.Err()
			return
		}

		l.releasePinnedConnection()
		l.state.Store(uint32(workerLeaseClosed))
	})

	<-l.closeDone
	return l.closeErr
}

func (l *WorkerLease) destroyPinnedConnection() error {
	l.connectionCleanupOnce.Do(func() {
		l.connectionCleanupErr = destroyLeaseConnection(l.conn)
	})
	return l.connectionCleanupErr
}

func (l *WorkerLease) releasePinnedConnection() {
	l.connectionCleanupOnce.Do(func() {
		l.conn.release()
	})
}

func unlockOrDestroyLeaseConnection(conn workerLeaseConnection, namespace int32, workerID int) error {
	cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), connectionCloseTimeout)
	defer cleanupCancel()

	unlocked, err := conn.advisoryUnlock(cleanupCtx, namespace, workerID)
	if err == nil && unlocked {
		conn.release()
		return nil
	}
	if err == nil {
		err = errors.New("PostgreSQL reported that the advisory lock was not held")
	}
	return errors.Join(
		fmt.Errorf("release Snowflake worker %d after failed acquisition: %w", workerID, err),
		destroyLeaseConnection(conn),
	)
}

func destroyLeaseConnection(conn workerLeaseConnection) error {
	closeCtx, closeCancel := context.WithTimeout(context.Background(), connectionCloseTimeout)
	defer closeCancel()
	if err := conn.destroy(closeCtx); err != nil {
		return fmt.Errorf("destroy Snowflake worker lease connection: %w", err)
	}
	return nil
}
