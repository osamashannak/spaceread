package snowflake

import (
	"fmt"
	"sync/atomic"
	"time"
)

const (
	epoch        = 1491696000000
	serverBits   = 10
	sequenceBits = 12
	timeBits     = 42
	serverShift  = sequenceBits
	timeShift    = sequenceBits + serverBits
	serverMax    = ^(-1 << serverBits)
	sequenceMask = ^(-1 << sequenceBits)
	timeMask     = ^(-1 << timeBits)
)

type Generator struct {
	// state contains only the timestamp and sequence portions of an ID. The
	// machine portion is added after a successful state transition, so a
	// sequence rollover can never carry into it. Keeping the atomic behind a
	// pointer makes Generator value copies share one sequence stream.
	state     *atomic.Uint64
	machine   uint64
	nowMillis func() int64
	lease     *WorkerLease
}

func New(machineID int) *Generator {
	if machineID < 0 || machineID > serverMax {
		panic(fmt.Errorf("invalid machine id; must be 0 ≤ id ≤ %d", serverMax))
	}
	return &Generator{
		machine: uint64(machineID << serverShift),
		state:   &atomic.Uint64{},
	}
}

// NewLeasedGenerator returns a generator which fails closed when lease is lost
// or closed. Callers should use this constructor for every production
// generator backed by a dynamically allocated worker ID.
func NewLeasedGenerator(lease *WorkerLease) *Generator {
	if lease == nil {
		panic("snowflake: worker lease is nil")
	}
	lease.assertHealthy()
	generator := New(lease.WorkerID())
	generator.lease = lease
	// A lease owns one sequence stream. Multiple constructors and accidental
	// Generator value copies all share this atomic state rather than restarting
	// the sequence at zero for the same worker and timestamp range.
	generator.state = lease.sharedGeneratorState()
	return generator
}

func (g *Generator) MachineID() int {
	return int(g.machine >> serverShift)
}

func (g *Generator) Next() uint64 {
	for {
		if g.lease != nil {
			g.lease.assertHealthy()
		}

		t := g.now()
		current := g.state.Load()
		currentTime := current >> timeShift & timeMask
		currentSeq := current & sequenceMask
		var next uint64

		switch {
		// The wall clock has advanced, so start its sequence at zero.
		case t > currentTime:
			next = t << timeShift

		// When a millisecond's sequence is exhausted, advance the logical
		// clock. This also keeps IDs monotonic if the wall clock moves
		// backwards.
		case currentSeq == sequenceMask:
			if currentTime == timeMask {
				panic("snowflake: timestamp range exhausted")
			}
			next = (currentTime + 1) << timeShift

		// Reconstruct the state rather than incrementing the packed integer.
		// In particular, the reserved machine-bit region remains zero.
		default:
			next = currentTime<<timeShift | currentSeq + 1
		}
		if g.lease != nil {
			g.lease.authorizeTimestamp(next >> timeShift & timeMask)
		}

		if g.state.CompareAndSwap(current, next) {
			// Recheck after claiming the state transition. If lease shutdown or
			// loss raced with allocation, consume the state but never expose the
			// resulting ID.
			if g.lease != nil {
				g.lease.assertHealthy()
			}
			return next | g.machine
		}
	}
}

func (g *Generator) NextString() string {
	var s [11]byte
	encode(&s, g.Next())
	return string(s[:])
}

func (g *Generator) AppendNext(s *[11]byte) {
	encode(s, g.Next())
}

func (g *Generator) now() uint64 {
	if g.lease != nil {
		return g.lease.nowElapsed()
	}
	nowMillis := time.Now().UnixMilli()
	if g.nowMillis != nil {
		nowMillis = g.nowMillis()
	}

	// Before the custom epoch, use the first representable millisecond. This
	// avoids unsigned underflow if the clock is badly misconfigured.
	if nowMillis <= epoch {
		return 0
	}

	elapsed := uint64(nowMillis - epoch)
	if elapsed > timeMask {
		panic("snowflake: current time exceeds timestamp range")
	}
	return elapsed
}

var digits = [...]byte{
	'0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
	'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
	'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
	'U', 'V', 'W', 'X', 'Y', 'Z', '_', 'a', 'b', 'c',
	'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
	'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w',
	'x', 'y', 'z', '~'}

func encode(s *[11]byte, n uint64) {
	s[10], n = digits[n&0x3f], n>>6
	s[9], n = digits[n&0x3f], n>>6
	s[8], n = digits[n&0x3f], n>>6
	s[7], n = digits[n&0x3f], n>>6
	s[6], n = digits[n&0x3f], n>>6
	s[5], n = digits[n&0x3f], n>>6
	s[4], n = digits[n&0x3f], n>>6
	s[3], n = digits[n&0x3f], n>>6
	s[2], n = digits[n&0x3f], n>>6
	s[1], n = digits[n&0x3f], n>>6
	s[0] = digits[n&0x3f]
}
