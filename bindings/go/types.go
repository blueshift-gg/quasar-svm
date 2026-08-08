package quasarsvm

import (
	"fmt"

	"github.com/gagliardetto/solana-go"
)

// LoaderV2 is the BPF Loader v2 version identifier.
const LoaderV2 uint8 = 2

// LoaderV3 is the BPF Loader v3 (Upgradeable) version identifier.
const LoaderV3 uint8 = 3

// LamportsPerSOL is the number of lamports in one SOL.
const LamportsPerSOL uint64 = 1_000_000_000

// Account represents a Solana account with its address and state.
type Account struct {
	Address    solana.PublicKey
	Owner      solana.PublicKey
	Lamports   uint64
	Data       []byte
	Executable bool
}

// AccountMeta describes an account's role in an instruction.
type AccountMeta struct {
	PublicKey  solana.PublicKey
	IsSigner   bool
	IsWritable bool
}

// Instruction represents a Solana instruction.
type Instruction struct {
	ProgramID solana.PublicKey
	Accounts  []AccountMeta
	Data      []byte
}

// TokenBalance represents a token balance at a point in time.
type TokenBalance struct {
	AccountIndex uint32
	Mint         string
	Owner        *string
	Decimals     uint8
	Amount       string
	UIAmount     *float64
}

// ExecutedInstruction represents a single instruction in the execution trace.
type ExecutedInstruction struct {
	StackDepth           uint8
	Instruction          Instruction
	ComputeUnitsConsumed uint64
	Result               uint64
}

// ExecutionTrace contains the full trace of executed instructions.
type ExecutionTrace struct {
	Instructions []ExecutedInstruction
}

// ExecutionResult holds the output of processing an instruction or transaction.
type ExecutionResult struct {
	Status            int32
	ComputeUnits      uint64
	ExecutionTimeUs   uint64
	ReturnData        []byte
	Accounts          []Account
	Logs              []string
	ErrorMessage      *string
	PreBalances       []uint64
	PostBalances      []uint64
	PreTokenBalances  []TokenBalance
	PostTokenBalances []TokenBalance
	ExecutionTrace    ExecutionTrace
}

// OK returns true if the execution succeeded.
func (r *ExecutionResult) OK() bool {
	return r.Status == 0
}

// Failed returns true if the execution failed.
func (r *ExecutionResult) Failed() bool {
	return r.Status != 0
}

// Err returns the error message as an error, or nil on success.
func (r *ExecutionResult) Err() error {
	if r.Status == 0 {
		return nil
	}
	if r.ErrorMessage != nil {
		return fmt.Errorf("program error (%d): %s", r.Status, *r.ErrorMessage)
	}
	return fmt.Errorf("program error (%d)", r.Status)
}

// FindAccount returns the resulting account for the given address, or nil if not found.
func (r *ExecutionResult) FindAccount(address solana.PublicKey) *Account {
	for i := range r.Accounts {
		if r.Accounts[i].Address == address {
			return &r.Accounts[i]
		}
	}
	return nil
}

// Clock configures the Clock sysvar.
type Clock struct {
	Slot                uint64
	EpochStartTimestamp int64
	Epoch               uint64
	LeaderScheduleEpoch uint64
	UnixTimestamp       int64
}

// EpochSchedule configures the EpochSchedule sysvar.
type EpochSchedule struct {
	SlotsPerEpoch            uint64
	LeaderScheduleSlotOffset uint64
	Warmup                   bool
	FirstNormalEpoch         uint64
	FirstNormalSlot          uint64
}
