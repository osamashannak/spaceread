package snowflake

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	defaultLeaseDuration       = 15 * time.Second
	defaultRenewInterval       = 5 * time.Second
	defaultOperationTimeout    = 2 * time.Second
	defaultReservationDuration = 30 * time.Second
	workerLeaseTokenBytes      = 32
)

var (
	ErrNoWorkerAvailable  = errors.New("no Snowflake worker ID is available")
	ErrWorkerLeaseLost    = errors.New("Snowflake worker lease lost")
	ErrWorkerLeaseClosed  = errors.New("Snowflake worker lease closed")
	ErrWorkerLeaseInvalid = errors.New("Snowflake worker lease is not initialized")
	ErrInvalidLeaseConfig = errors.New("invalid Snowflake worker lease configuration")
)

// WorkerLeaseConfig controls a transaction-pooler-safe PostgreSQL row lease.
// Zero durations use a 15-second lease, five-second renewal interval,
// two-second statement timeout, and timestamp ranges reserved 30 seconds at a
// time.
//
// Worker 1 is always excluded so new instances can coexist with an older
// revision hard-coded to worker 1. The lease uses only short statements; it
// does not pin a connection and supports pool_max_conns=1 and transaction
// pooling proxies.
type WorkerLeaseConfig struct {
	Owner               string
	LeaseDuration       time.Duration
	RenewInterval       time.Duration
	OperationTimeout    time.Duration
	ReservationDuration time.Duration
}

type normalizedWorkerLeaseConfig struct {
	owner               string
	leaseDuration       time.Duration
	renewInterval       time.Duration
	operationTimeout    time.Duration
	reservationDuration time.Duration
	leaseMillis         int64
	renewMillis         int64
	reservationMillis   int64
}

func (cfg WorkerLeaseConfig) normalize() (normalizedWorkerLeaseConfig, error) {
	if cfg.LeaseDuration < 0 || cfg.RenewInterval < 0 || cfg.OperationTimeout < 0 || cfg.ReservationDuration < 0 {
		return normalizedWorkerLeaseConfig{}, fmt.Errorf("%w: durations cannot be negative", ErrInvalidLeaseConfig)
	}

	normalized := normalizedWorkerLeaseConfig{
		owner:               cfg.Owner,
		leaseDuration:       cfg.LeaseDuration,
		renewInterval:       cfg.RenewInterval,
		operationTimeout:    cfg.OperationTimeout,
		reservationDuration: cfg.ReservationDuration,
	}
	if normalized.leaseDuration == 0 {
		normalized.leaseDuration = defaultLeaseDuration
	}
	if normalized.renewInterval == 0 {
		normalized.renewInterval = defaultRenewInterval
	}
	if normalized.operationTimeout == 0 {
		normalized.operationTimeout = defaultOperationTimeout
	}
	if normalized.reservationDuration == 0 {
		normalized.reservationDuration = defaultReservationDuration
	}

	if normalized.renewInterval >= normalized.leaseDuration {
		return normalizedWorkerLeaseConfig{}, fmt.Errorf(
			"%w: renew interval %s must be shorter than lease duration %s",
			ErrInvalidLeaseConfig,
			normalized.renewInterval,
			normalized.leaseDuration,
		)
	}
	if normalized.operationTimeout >= normalized.leaseDuration {
		return normalizedWorkerLeaseConfig{}, fmt.Errorf(
			"%w: operation timeout %s must be shorter than lease duration %s",
			ErrInvalidLeaseConfig,
			normalized.operationTimeout,
			normalized.leaseDuration,
		)
	}

	normalized.leaseMillis = normalized.leaseDuration.Milliseconds()
	normalized.renewMillis = normalized.renewInterval.Milliseconds()
	normalized.reservationMillis = normalized.reservationDuration.Milliseconds()
	if normalized.leaseMillis < 1 || normalized.renewMillis < 1 || normalized.reservationMillis < 1 || normalized.operationTimeout < time.Millisecond {
		return normalizedWorkerLeaseConfig{}, fmt.Errorf("%w: every duration must be at least one millisecond", ErrInvalidLeaseConfig)
	}
	return normalized, nil
}

// leaseRecord contains elapsed milliseconds since the Snowflake epoch. The
// database supplies its clock value and the durable inclusive reservation.
type leaseRecord struct {
	workerID        int
	holderToken     []byte
	fencingToken    int64
	databaseNow     int64
	leaseMillis     int64
	rangeStart      int64
	reservedThrough int64
}

type workerLeaseStore interface {
	acquire(context.Context, []byte, string, int64, int64) (leaseRecord, error)
	lookup(context.Context, []byte, int64) (leaseRecord, error)
	renew(context.Context, int, []byte, int64, int64, int64, int64) (leaseRecord, error)
	release(context.Context, int, []byte, int64) (bool, error)
}

type pgxWorkerLeaseStore struct {
	pool *pgxpool.Pool
}

// Acquisition takes the database time once, locks one expired row without
// waiting, fences its previous holder, and publishes a non-overlapping
// inclusive timestamp range in one statement. The range is rejected before
// UPDATE if it would exceed the 42-bit Snowflake timestamp field.
const acquireWorkerLeaseSQL = `
WITH timing AS MATERIALIZED (
	SELECT clock.db_now,
		floor(extract(epoch FROM (clock.db_now - timestamptz '2017-04-09 00:00:00+00')) * 1000)::bigint AS db_elapsed
	FROM (SELECT clock_timestamp() AS db_now) AS clock
), candidate AS MATERIALIZED (
	SELECT lease.worker_id,
		greatest(lease.reserved_through + 1, timing.db_elapsed) AS range_start
	FROM snowflake_internal.snowflake_worker_lease AS lease
	CROSS JOIN timing
	WHERE lease.worker_id <> 1
	  AND (lease.lease_expires_at IS NULL OR lease.lease_expires_at <= timing.db_now)
	  AND lease.fencing_token < 9223372036854775807
	  AND greatest(lease.reserved_through + 1, timing.db_elapsed) <= 4398046511103 - ($4::bigint - 1)
	ORDER BY range_start, lease.worker_id
	FOR UPDATE OF lease SKIP LOCKED
	LIMIT 1
), claimed AS (
	UPDATE snowflake_internal.snowflake_worker_lease AS lease
	SET holder_token = $1::bytea,
		owner = $2,
		fencing_token = lease.fencing_token + 1,
		lease_expires_at = timing.db_now + $3::bigint * interval '1 millisecond',
		heartbeat_at = timing.db_now,
		reserved_through = candidate.range_start + $4::bigint - 1
	FROM candidate
	CROSS JOIN timing
	WHERE lease.worker_id = candidate.worker_id
	RETURNING lease.worker_id,
		lease.holder_token,
		lease.fencing_token,
		candidate.range_start,
		lease.reserved_through
)
SELECT claimed.worker_id,
	claimed.holder_token,
	claimed.fencing_token,
	timing.db_elapsed,
	$3::bigint,
	claimed.range_start,
	claimed.reserved_through
FROM claimed
CROSS JOIN timing`

func (s *pgxWorkerLeaseStore) acquire(
	ctx context.Context,
	holderToken []byte,
	owner string,
	leaseMillis int64,
	reservationMillis int64,
) (leaseRecord, error) {
	return scanLeaseRecord(s.pool.QueryRow(
		ctx,
		acquireWorkerLeaseSQL,
		holderToken,
		owner,
		leaseMillis,
		reservationMillis,
	), ErrNoWorkerAvailable)
}

// A unique holder token lets a caller recover an acquisition whose success
// was ambiguous because the response was lost after PostgreSQL committed it.
const lookupWorkerLeaseSQL = `
WITH timing AS MATERIALIZED (
	SELECT clock.db_now,
		floor(extract(epoch FROM (clock.db_now - timestamptz '2017-04-09 00:00:00+00')) * 1000)::bigint AS db_elapsed
	FROM (SELECT clock_timestamp() AS db_now) AS clock
)
SELECT lease.worker_id,
	lease.holder_token,
	lease.fencing_token,
	timing.db_elapsed,
	floor(extract(epoch FROM (lease.lease_expires_at - timing.db_now)) * 1000)::bigint,
	lease.reserved_through - $2::bigint + 1,
	lease.reserved_through
FROM snowflake_internal.snowflake_worker_lease AS lease
CROSS JOIN timing
WHERE lease.holder_token = $1::bytea
  AND lease.lease_expires_at > timing.db_now`

func (s *pgxWorkerLeaseStore) lookup(ctx context.Context, holderToken []byte, reservationMillis int64) (leaseRecord, error) {
	return scanLeaseRecord(s.pool.QueryRow(ctx, lookupWorkerLeaseSQL, holderToken, reservationMillis), ErrNoWorkerAvailable)
}

// Renewal is conditional on worker, holder token, and fencing token. It may
// renew an expired same-token row: PostgreSQL serializes its row update with a
// competing acquisition, so either renewal extends the lease first or the
// acquirer changes token/fence first and renewal returns no row.
const renewWorkerLeaseSQL = `
WITH timing AS MATERIALIZED (
	SELECT clock.db_now,
		floor(extract(epoch FROM (clock.db_now - timestamptz '2017-04-09 00:00:00+00')) * 1000)::bigint AS db_elapsed
	FROM (SELECT clock_timestamp() AS db_now) AS clock
), renewed AS (
	UPDATE snowflake_internal.snowflake_worker_lease AS lease
	SET lease_expires_at = timing.db_now + $4::bigint * interval '1 millisecond',
		heartbeat_at = timing.db_now,
		reserved_through = greatest(
			lease.reserved_through,
			greatest(timing.db_elapsed, $6::bigint) + $5::bigint - 1
		)
	FROM timing
	WHERE lease.worker_id = $1
	  AND lease.holder_token = $2::bytea
	  AND lease.fencing_token = $3
	  AND greatest(
		lease.reserved_through,
		greatest(timing.db_elapsed, $6::bigint) + $5::bigint - 1
	  ) <= 4398046511103
	RETURNING lease.worker_id,
		lease.holder_token,
		lease.fencing_token,
		lease.reserved_through
)
SELECT renewed.worker_id,
	renewed.holder_token,
	renewed.fencing_token,
	timing.db_elapsed,
	$4::bigint,
	0::bigint,
	renewed.reserved_through
FROM renewed
CROSS JOIN timing`

func (s *pgxWorkerLeaseStore) renew(
	ctx context.Context,
	workerID int,
	holderToken []byte,
	fencingToken int64,
	leaseMillis int64,
	reservationMillis int64,
	minimumThrough int64,
) (leaseRecord, error) {
	return scanLeaseRecord(s.pool.QueryRow(
		ctx,
		renewWorkerLeaseSQL,
		workerID,
		holderToken,
		fencingToken,
		leaseMillis,
		reservationMillis,
		minimumThrough,
	), ErrWorkerLeaseLost)
}

const releaseWorkerLeaseSQL = `
UPDATE snowflake_internal.snowflake_worker_lease
SET holder_token = NULL,
	owner = NULL,
	lease_expires_at = NULL,
	heartbeat_at = NULL
WHERE worker_id = $1
  AND holder_token = $2::bytea
  AND fencing_token = $3
RETURNING true`

func (s *pgxWorkerLeaseStore) release(ctx context.Context, workerID int, holderToken []byte, fencingToken int64) (bool, error) {
	var released bool
	err := s.pool.QueryRow(ctx, releaseWorkerLeaseSQL, workerID, holderToken, fencingToken).Scan(&released)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return released, err
}

type rowScanner interface {
	Scan(...any) error
}

func scanLeaseRecord(row rowScanner, noRowsError error) (leaseRecord, error) {
	var record leaseRecord
	err := row.Scan(
		&record.workerID,
		&record.holderToken,
		&record.fencingToken,
		&record.databaseNow,
		&record.leaseMillis,
		&record.rangeStart,
		&record.reservedThrough,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return leaseRecord{}, noRowsError
	}
	return record, err
}

type workerLeaseState uint32

const (
	workerLeaseInvalid workerLeaseState = iota
	workerLeaseHealthy
	workerLeaseClosing
	workerLeaseLost
	workerLeaseClosed
)

// WorkerLease owns one fenced database row and an inclusive range of
// Snowflake timestamp values. The persisted high-water mark means a new
// holder always starts beyond every timestamp the previous holder could emit.
type WorkerLease struct {
	workerID     int
	owner        string
	holderToken  []byte
	fencingToken int64
	store        workerLeaseStore
	config       normalizedWorkerLeaseConfig

	state atomic.Uint32
	lost  chan struct{}

	metadataMu      sync.RWMutex
	databaseAnchor  int64
	localAnchor     time.Time
	leaseDeadline   time.Time
	rangeStart      int64
	reservedThrough int64

	operationMu    sync.Mutex
	now            func() time.Time
	generatorState atomic.Pointer[atomic.Uint64]

	monitorCancel context.CancelFunc
	monitorDone   chan struct{}

	errMu sync.RWMutex
	err   error

	closeOnce sync.Once
	closeDone chan struct{}
	closeErr  error
}

// AcquireWorkerLease immediately claims an expired row. It does not sleep or
// retain a database connection.
func AcquireWorkerLease(ctx context.Context, pool *pgxpool.Pool, cfg WorkerLeaseConfig) (*WorkerLease, error) {
	if pool == nil {
		return nil, fmt.Errorf("%w: PostgreSQL pool is nil", ErrInvalidLeaseConfig)
	}
	return acquireWorkerLease(ctx, &pgxWorkerLeaseStore{pool: pool}, cfg, newHolderToken)
}

type holderTokenFunc func() ([]byte, error)

func acquireWorkerLease(ctx context.Context, store workerLeaseStore, cfg WorkerLeaseConfig, makeToken holderTokenFunc) (*WorkerLease, error) {
	normalized, err := cfg.normalize()
	if err != nil {
		return nil, err
	}
	normalized.owner, err = resolveWorkerLeaseOwner(normalized.owner)
	if err != nil {
		return nil, fmt.Errorf("build Snowflake worker lease owner identity: %w", err)
	}

	token, err := makeToken()
	if err != nil {
		return nil, fmt.Errorf("generate Snowflake worker holder token: %w", err)
	}
	if len(token) != workerLeaseTokenBytes {
		return nil, fmt.Errorf("generate Snowflake worker holder token: got %d bytes, want %d", len(token), workerLeaseTokenBytes)
	}
	token = bytes.Clone(token)

	queryStarted := time.Now()
	operationCtx, cancel := context.WithTimeout(ctx, normalized.operationTimeout)
	record, acquireErr := store.acquire(
		operationCtx,
		token,
		normalized.owner,
		normalized.leaseMillis,
		normalized.reservationMillis,
	)
	cancel()
	if acquireErr != nil && !errors.Is(acquireErr, ErrNoWorkerAvailable) && ctx.Err() == nil {
		// The acquisition statement may have committed before its response was
		// lost. Recover only this unique token; never issue another claim.
		lookupStarted := time.Now()
		lookupCtx, lookupCancel := context.WithTimeout(ctx, normalized.operationTimeout)
		lookedUp, lookupErr := store.lookup(lookupCtx, token, normalized.reservationMillis)
		lookupCancel()
		if lookupErr == nil {
			record = lookedUp
			queryStarted = lookupStarted
			acquireErr = nil
		}
	}
	if acquireErr != nil {
		return nil, fmt.Errorf("acquire Snowflake worker lease for owner %q: %w", normalized.owner, acquireErr)
	}
	if err := validateLeaseRecord(record, token, true); err != nil {
		releaseCtx, releaseCancel := context.WithTimeout(context.Background(), normalized.operationTimeout)
		_, releaseErr := store.release(releaseCtx, record.workerID, token, record.fencingToken)
		releaseCancel()
		return nil, errors.Join(err, releaseErr)
	}

	lease := &WorkerLease{
		workerID:     record.workerID,
		owner:        normalized.owner,
		holderToken:  token,
		fencingToken: record.fencingToken,
		store:        store,
		config:       normalized,
		lost:         make(chan struct{}),
		now:          time.Now,
		monitorDone:  make(chan struct{}),
		closeDone:    make(chan struct{}),
	}
	// Initialize this before returning the lease so even an accidental
	// pre-construction value copy still points at the same sequence stream.
	lease.generatorState.Store(&atomic.Uint64{})
	lease.applyRecord(record, queryStarted, true)
	lease.state.Store(uint32(workerLeaseHealthy))
	monitorCtx, monitorCancel := context.WithCancel(context.Background())
	lease.monitorCancel = monitorCancel
	go lease.monitor(monitorCtx)
	return lease, nil
}

func validateLeaseRecord(record leaseRecord, token []byte, acquisition bool) error {
	if record.workerID < 0 || record.workerID > serverMax || record.workerID == 1 {
		return fmt.Errorf("%w: database returned reserved or invalid worker ID %d", ErrWorkerLeaseLost, record.workerID)
	}
	if !bytes.Equal(record.holderToken, token) || record.fencingToken <= 0 {
		return fmt.Errorf("%w: database returned a mismatched holder token or fencing token", ErrWorkerLeaseLost)
	}
	if record.databaseNow < 0 || record.leaseMillis < 1 {
		return fmt.Errorf("%w: database returned an invalid clock or lease lifetime", ErrWorkerLeaseLost)
	}
	if record.reservedThrough < record.databaseNow || record.reservedThrough > int64(timeMask) {
		return fmt.Errorf("%w: database returned an invalid timestamp reservation", ErrWorkerLeaseLost)
	}
	if acquisition && (record.rangeStart < 0 || record.rangeStart > record.reservedThrough) {
		return fmt.Errorf("%w: database returned an invalid timestamp range", ErrWorkerLeaseLost)
	}
	return nil
}

func newHolderToken() ([]byte, error) {
	token := make([]byte, workerLeaseTokenBytes)
	if _, err := rand.Read(token); err != nil {
		return nil, err
	}
	return token, nil
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
	if len(parts) == 0 {
		token, err := newHolderToken()
		if err != nil {
			return "", err
		}
		parts = append(parts, fmt.Sprintf("nonce=%x", token[:8]))
	}
	owner := strings.Join(parts, ",")
	for utf8.RuneCountInString(owner) > 255 {
		_, size := utf8.DecodeLastRuneInString(owner)
		owner = owner[:len(owner)-size]
	}
	return owner, nil
}

func (l *WorkerLease) localNow() time.Time {
	if l.now != nil {
		return l.now()
	}
	return time.Now()
}

// queryStarted is deliberately used instead of response time. The database
// creates the deadline after queryStarted, so queryStarted+TTL is a
// conservative local deadline even when the response is slow.
func (l *WorkerLease) applyRecord(record leaseRecord, queryStarted time.Time, acquisition bool) {
	l.metadataMu.Lock()
	defer l.metadataMu.Unlock()
	l.databaseAnchor = record.databaseNow
	l.localAnchor = queryStarted
	l.leaseDeadline = queryStarted.Add(time.Duration(record.leaseMillis) * time.Millisecond)
	if acquisition {
		l.rangeStart = record.rangeStart
	}
	l.reservedThrough = record.reservedThrough
}

func (l *WorkerLease) estimatedDatabaseNow() int64 {
	l.metadataMu.RLock()
	anchor := l.databaseAnchor
	localAnchor := l.localAnchor
	l.metadataMu.RUnlock()
	if localAnchor.IsZero() {
		return 0
	}
	elapsed := l.localNow().Sub(localAnchor).Milliseconds()
	if elapsed < 0 {
		elapsed = 0
	}
	return anchor + elapsed
}

func (l *WorkerLease) renewalDue() bool {
	l.metadataMu.RLock()
	anchor := l.databaseAnchor
	l.metadataMu.RUnlock()
	return l.estimatedDatabaseNow() >= anchor+l.config.renewMillis
}

func (l *WorkerLease) leaseDeadlineValid() bool {
	l.metadataMu.RLock()
	deadline := l.leaseDeadline
	l.metadataMu.RUnlock()
	return !deadline.IsZero() && l.localNow().Before(deadline)
}

func (l *WorkerLease) monitor(ctx context.Context) {
	defer close(l.monitorDone)
	ticker := time.NewTicker(l.config.renewInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := l.renew(0, true); err != nil {
				return
			}
		}
	}
}

func (l *WorkerLease) renew(minimumThrough int64, force bool) error {
	l.operationMu.Lock()
	defer l.operationMu.Unlock()
	if workerLeaseState(l.state.Load()) != workerLeaseHealthy {
		return l.Err()
	}
	if !force && minimumThrough == 0 && !l.renewalDue() && l.leaseDeadlineValid() {
		return nil
	}

	queryStarted := l.localNow()
	ctx, cancel := context.WithTimeout(context.Background(), l.config.operationTimeout)
	record, err := l.store.renew(
		ctx,
		l.workerID,
		l.holderToken,
		l.fencingToken,
		l.config.leaseMillis,
		l.config.reservationMillis,
		minimumThrough,
	)
	cancel()
	if err != nil {
		l.markLost(fmt.Errorf("%w: renew worker %d fence %d: %w", ErrWorkerLeaseLost, l.workerID, l.fencingToken, err))
		return l.Err()
	}
	if err := validateLeaseRecord(record, l.holderToken, false); err != nil || record.workerID != l.workerID || record.fencingToken != l.fencingToken {
		if err == nil {
			err = fmt.Errorf("%w: renewal returned a different worker or fence", ErrWorkerLeaseLost)
		}
		l.markLost(err)
		return l.Err()
	}
	l.applyRecord(record, queryStarted, false)
	return nil
}

// WorkerID returns the leased worker ID for diagnostics.
func (l *WorkerLease) WorkerID() int {
	if l == nil {
		return 0
	}
	return l.workerID
}

// Owner returns the diagnostic owner string stored in PostgreSQL.
func (l *WorkerLease) Owner() string {
	if l == nil {
		return ""
	}
	return l.owner
}

// Healthy reports whether the lease is locally known to be usable. A
// generation attempt can synchronously renew an expired same-token row if no
// replacement acquired it.
func (l *WorkerLease) Healthy() bool {
	return l != nil && workerLeaseState(l.state.Load()) == workerLeaseHealthy && l.leaseDeadlineValid()
}

func (l *WorkerLease) assertHealthy() {
	if l == nil {
		panic(ErrWorkerLeaseInvalid)
	}
	if workerLeaseState(l.state.Load()) == workerLeaseHealthy {
		if err := l.renew(0, false); err == nil && l.leaseDeadlineValid() {
			return
		}
	}
	if err := l.Err(); err != nil {
		panic(fmt.Errorf("snowflake: refusing to generate an ID without a healthy worker lease: %w", err))
	}
	panic(ErrWorkerLeaseLost)
}

func (l *WorkerLease) nowElapsed() uint64 {
	l.assertHealthy()
	now := l.estimatedDatabaseNow()
	l.metadataMu.RLock()
	if now < l.rangeStart {
		now = l.rangeStart
	}
	l.metadataMu.RUnlock()
	if now < 0 {
		return 0
	}
	if now > int64(timeMask) {
		panic("snowflake: database time exceeds timestamp range")
	}
	return uint64(now)
}

// authorizeTimestamp runs before Generator publishes a state transition. If
// sequence rollover moves the logical clock beyond the current reservation,
// it extends the durable high-water mark synchronously first.
func (l *WorkerLease) authorizeTimestamp(elapsed uint64) {
	if elapsed > uint64(timeMask) {
		panic("snowflake: timestamp range exhausted")
	}
	l.metadataMu.RLock()
	reservedThrough := l.reservedThrough
	l.metadataMu.RUnlock()
	if int64(elapsed) <= reservedThrough {
		return
	}
	if err := l.renew(int64(elapsed), true); err != nil {
		l.assertHealthy()
	}
	l.metadataMu.RLock()
	reservedThrough = l.reservedThrough
	l.metadataMu.RUnlock()
	if int64(elapsed) > reservedThrough {
		l.markLost(fmt.Errorf("%w: PostgreSQL did not reserve timestamp %d", ErrWorkerLeaseLost, elapsed))
		l.assertHealthy()
	}
}

func (l *WorkerLease) sharedGeneratorState() *atomic.Uint64 {
	if state := l.generatorState.Load(); state != nil {
		return state
	}
	state := &atomic.Uint64{}
	if l.generatorState.CompareAndSwap(nil, state) {
		return state
	}
	return l.generatorState.Load()
}

// Lost closes exactly once when ownership becomes unsafe. Clean Close does
// not close it.
func (l *WorkerLease) Lost() <-chan struct{} {
	if l == nil {
		return nil
	}
	return l.lost
}

// Err returns nil while healthy, ErrWorkerLeaseClosed after clean Close, or a
// wrapped ErrWorkerLeaseLost after unsafe loss.
func (l *WorkerLease) Err() error {
	if l == nil {
		return ErrWorkerLeaseInvalid
	}
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
		if state != workerLeaseHealthy {
			return
		}
		if l.state.CompareAndSwap(uint32(state), uint32(workerLeaseLost)) {
			l.err = err
			close(l.lost)
			return
		}
	}
}

// Close conditionally releases this token/fence while preserving the durable
// timestamp high-water mark.
func (l *WorkerLease) Close(ctx context.Context) error {
	if l == nil || workerLeaseState(l.state.Load()) == workerLeaseInvalid {
		return ErrWorkerLeaseInvalid
	}
	if ctx == nil {
		ctx = context.Background()
	}
	l.closeOnce.Do(func() {
		defer close(l.closeDone)
		wasLost := false
		for {
			state := workerLeaseState(l.state.Load())
			switch state {
			case workerLeaseHealthy:
				if !l.state.CompareAndSwap(uint32(state), uint32(workerLeaseClosing)) {
					continue
				}
			case workerLeaseLost:
				wasLost = true
			case workerLeaseClosed:
				return
			}
			break
		}

		l.monitorCancel()
		<-l.monitorDone

		l.operationMu.Lock()
		releaseCtx, cancel := context.WithTimeout(ctx, l.config.operationTimeout)
		released, releaseErr := l.store.release(releaseCtx, l.workerID, l.holderToken, l.fencingToken)
		cancel()
		l.operationMu.Unlock()
		if releaseErr != nil || !released {
			if releaseErr == nil {
				releaseErr = errors.New("lease row no longer has this holder token and fence")
			}
			releaseErr = fmt.Errorf("release worker %d fence %d: %w", l.workerID, l.fencingToken, releaseErr)
			if wasLost {
				l.closeErr = errors.Join(l.Err(), releaseErr)
				return
			}
			l.errMu.Lock()
			l.err = errors.Join(ErrWorkerLeaseClosed, releaseErr)
			l.errMu.Unlock()
			l.state.Store(uint32(workerLeaseClosed))
			l.closeErr = releaseErr
			return
		}
		if wasLost {
			l.closeErr = l.Err()
			return
		}
		l.errMu.Lock()
		l.err = ErrWorkerLeaseClosed
		l.errMu.Unlock()
		l.state.Store(uint32(workerLeaseClosed))
	})
	<-l.closeDone
	return l.closeErr
}
