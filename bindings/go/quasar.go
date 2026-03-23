// Package quasarsvm provides Go bindings for the Quasar SVM — a lightweight
// Solana virtual machine that executes transactions locally without an RPC
// connection. It uses github.com/gagliardetto/solana-go for Solana types.
//
// Prebuilt static libraries are vendored under libquasar_svm_vendor/ for
// supported platforms. Consumers can simply `go get` without any native
// dependencies.
//
// For development builds (monorepo), set the quasar_dev build tag:
//
//	go test -tags quasar_dev ./...
//
// For dynamic linking against a system-installed libquasar_svm:
//
//	go build -tags dynamic ./...
package quasarsvm

/*
#include "select_quasar_svm.h"
*/
import "C"

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"unsafe"

	"github.com/gagliardetto/solana-go"
)

var (
	// ErrFreed is returned when a method is called on a freed QuasarSVM.
	ErrFreed = errors.New("quasar-svm: use after Free")
	// ErrEmptyELF is returned when an empty ELF byte slice is passed to AddProgram.
	ErrEmptyELF = errors.New("quasar-svm: empty ELF data")
)

// QuasarSVM is a lightweight Solana virtual machine for local transaction execution.
// It is safe to call Free concurrently with other methods; all methods acquire a
// read lock and Free acquires a write lock, so no use-after-free is possible.
type QuasarSVM struct {
	mu    sync.RWMutex
	ptr   *C.QuasarSvm
	freed bool
}

// New creates a new QuasarSVM instance with default SPL programs loaded
// (Token, Token-2022, Associated Token Account).
// Returns an error if the program ELF files cannot be found or loaded.
func New() (*QuasarSVM, error) {
	svm, err := NewWithoutPrograms()
	if err != nil {
		return nil, err
	}

	programsDir := findProgramsDir()

	programs := []struct {
		id      solana.PublicKey
		file    string
		loader  uint8
	}{
		{solana.TokenProgramID, "spl_token.so", LoaderV2},
		{solana.Token2022ProgramID, "spl_token_2022.so", LoaderV3},
		{solana.SPLAssociatedTokenAccountProgramID, "spl_associated_token.so", LoaderV2},
	}

	for _, p := range programs {
		elf, err := os.ReadFile(filepath.Join(programsDir, p.file))
		if err != nil {
			svm.Free()
			return nil, fmt.Errorf("reading %s: %w", p.file, err)
		}
		if err := svm.AddProgram(p.id, elf, p.loader); err != nil {
			svm.Free()
			return nil, fmt.Errorf("loading %s: %w", p.file, err)
		}
	}

	return svm, nil
}

// NewWithoutPrograms creates a new QuasarSVM instance without loading any SPL programs.
func NewWithoutPrograms() (*QuasarSVM, error) {
	ptr := C.quasar_svm_new()
	if ptr == nil {
		return nil, fmt.Errorf("failed to create QuasarSVM: %s", lastError())
	}

	svm := &QuasarSVM{ptr: ptr}
	runtime.SetFinalizer(svm, (*QuasarSVM).Free)
	return svm, nil
}

// Free releases the native SVM resources. Safe to call multiple times and
// from multiple goroutines.
func (s *QuasarSVM) Free() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.freed && s.ptr != nil {
		C.quasar_svm_free(s.ptr)
		s.freed = true
		runtime.SetFinalizer(s, nil)
	}
}

func (s *QuasarSVM) ensureAlive() error {
	if s.freed {
		return ErrFreed
	}
	return nil
}

// AddProgram loads a BPF program into the SVM.
func (s *QuasarSVM) AddProgram(programID solana.PublicKey, elf []byte, loaderVersion uint8) error {
	if len(elf) == 0 {
		return ErrEmptyELF
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	if err := s.ensureAlive(); err != nil {
		return err
	}
	id := programID
	code := C.quasar_svm_add_program(
		s.ptr,
		(*[32]C.uint8_t)(unsafe.Pointer(&id[0])),
		(*C.uint8_t)(unsafe.Pointer(&elf[0])),
		C.uint64_t(len(elf)),
		C.uint8_t(loaderVersion),
	)
	return s.check(code)
}

// SetClock configures the Clock sysvar.
func (s *QuasarSVM) SetClock(clock Clock) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if err := s.ensureAlive(); err != nil {
		return err
	}
	code := C.quasar_svm_set_clock(
		s.ptr,
		C.uint64_t(clock.Slot),
		C.int64_t(clock.EpochStartTimestamp),
		C.uint64_t(clock.Epoch),
		C.uint64_t(clock.LeaderScheduleEpoch),
		C.int64_t(clock.UnixTimestamp),
	)
	return s.check(code)
}

// WarpToSlot advances the SVM to a future slot.
func (s *QuasarSVM) WarpToSlot(slot uint64) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if err := s.ensureAlive(); err != nil {
		return err
	}
	return s.check(C.quasar_svm_warp_to_slot(s.ptr, C.uint64_t(slot)))
}

// SetRent configures the Rent sysvar.
func (s *QuasarSVM) SetRent(lamportsPerByteYear uint64) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if err := s.ensureAlive(); err != nil {
		return err
	}
	return s.check(C.quasar_svm_set_rent(s.ptr, C.uint64_t(lamportsPerByteYear)))
}

// SetEpochSchedule configures the EpochSchedule sysvar.
func (s *QuasarSVM) SetEpochSchedule(schedule EpochSchedule) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if err := s.ensureAlive(); err != nil {
		return err
	}
	code := C.quasar_svm_set_epoch_schedule(
		s.ptr,
		C.uint64_t(schedule.SlotsPerEpoch),
		C.uint64_t(schedule.LeaderScheduleSlotOffset),
		C.bool(schedule.Warmup),
		C.uint64_t(schedule.FirstNormalEpoch),
		C.uint64_t(schedule.FirstNormalSlot),
	)
	return s.check(code)
}

// SetComputeBudget sets the maximum compute units for execution.
func (s *QuasarSVM) SetComputeBudget(maxUnits uint64) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if err := s.ensureAlive(); err != nil {
		return err
	}
	return s.check(C.quasar_svm_set_compute_budget(s.ptr, C.uint64_t(maxUnits)))
}

// ProcessInstruction executes a single instruction.
func (s *QuasarSVM) ProcessInstruction(ix Instruction, accounts []Account) (*ExecutionResult, error) {
	// Use a stack-allocated array to avoid heap escaping a 1-element slice.
	ixs := [1]Instruction{ix}
	return s.ProcessInstructionChain(ixs[:], accounts)
}

// ProcessInstructionChain executes multiple instructions atomically.
func (s *QuasarSVM) ProcessInstructionChain(ixs []Instruction, accounts []Account) (*ExecutionResult, error) {
	// Serialize into pooled buffers to avoid per-call allocations.
	ixBufp := getBuf(instructionsSize(ixs))
	*ixBufp = appendInstructions(*ixBufp, ixs)

	acctBufp := getBuf(accountsSize(accounts))
	*acctBufp = appendAccounts(*acctBufp, accounts)

	s.mu.RLock()
	if err := s.ensureAlive(); err != nil {
		s.mu.RUnlock()
		putBuf(ixBufp)
		putBuf(acctBufp)
		return nil, err
	}

	var resultPtr *C.uint8_t
	var resultLen C.uint64_t

	ixBuf := *ixBufp
	acctBuf := *acctBufp
	code := C.quasar_svm_process_transaction(
		s.ptr,
		(*C.uint8_t)(unsafe.Pointer(&ixBuf[0])),
		C.uint64_t(len(ixBuf)),
		(*C.uint8_t)(unsafe.Pointer(&acctBuf[0])),
		C.uint64_t(len(acctBuf)),
		&resultPtr,
		&resultLen,
	)

	// Read error while still holding the lock — lastError() reads FFI
	// thread-local state that another goroutine could clobber after unlock.
	var ffiErr error
	if code != 0 {
		ffiErr = fmt.Errorf("quasar-svm error (%d): %s", code, lastError())
	}
	s.mu.RUnlock()

	// Return pooled buffers now that CGo is done with them.
	putBuf(ixBufp)
	putBuf(acctBufp)

	if ffiErr != nil {
		return nil, ffiErr
	}

	// Copy the result data before freeing the FFI buffer.
	// Use unsafe.Slice instead of C.GoBytes to avoid truncating uint64 to int.
	goBytes := make([]byte, resultLen)
	copy(goBytes, unsafe.Slice((*byte)(unsafe.Pointer(resultPtr)), resultLen))
	C.quasar_result_free(resultPtr, resultLen)

	return deserializeResult(goBytes)
}

// ProcessSolanaInstruction executes a solana-go instruction interface.
func (s *QuasarSVM) ProcessSolanaInstruction(ix solana.Instruction, accounts []Account) (*ExecutionResult, error) {
	converted, err := fromSolanaInstruction(ix)
	if err != nil {
		return nil, fmt.Errorf("converting instruction: %w", err)
	}
	return s.ProcessInstruction(converted, accounts)
}

// ProcessSolanaInstructionChain executes multiple solana-go instructions atomically.
func (s *QuasarSVM) ProcessSolanaInstructionChain(ixs []solana.Instruction, accounts []Account) (*ExecutionResult, error) {
	converted := make([]Instruction, len(ixs))
	for i, ix := range ixs {
		var err error
		converted[i], err = fromSolanaInstruction(ix)
		if err != nil {
			return nil, fmt.Errorf("converting instruction %d: %w", i, err)
		}
	}
	return s.ProcessInstructionChain(converted, accounts)
}

func (s *QuasarSVM) check(code C.int32_t) error {
	if code != 0 {
		return fmt.Errorf("quasar-svm error (%d): %s", code, lastError())
	}
	return nil
}

func lastError() string {
	cstr := C.quasar_last_error()
	if cstr == nil {
		return "unknown"
	}
	return C.GoString(cstr)
}

// fromSolanaInstruction converts a solana-go Instruction to our Instruction type.
func fromSolanaInstruction(ix solana.Instruction) (Instruction, error) {
	data, err := ix.Data()
	if err != nil {
		return Instruction{}, fmt.Errorf("serializing instruction data: %w", err)
	}
	solAccounts := ix.Accounts()
	metas := make([]AccountMeta, len(solAccounts))
	for i, a := range solAccounts {
		metas[i] = AccountMeta{
			PublicKey:  a.PublicKey,
			IsSigner:  a.IsSigner,
			IsWritable: a.IsWritable,
		}
	}
	return Instruction{
		ProgramID: ix.ProgramID(),
		Accounts:  metas,
		Data:      data,
	}, nil
}

// findProgramsDir locates the bundled SPL program ELF files.
func findProgramsDir() string {
	// 1. QUASAR_SVM_PROGRAMS_DIR environment variable
	if dir := os.Getenv("QUASAR_SVM_PROGRAMS_DIR"); dir != "" {
		return dir
	}

	// 2. Relative to this source file (works during `go test` in the monorepo).
	// After compilation this path won't exist, so we check with Stat.
	_, thisFile, _, ok := runtime.Caller(0)
	if ok && thisFile != "" {
		dir := filepath.Join(filepath.Dir(thisFile), "..", "..", "svm", "programs")
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			return dir
		}
	}

	// 3. Current working directory fallback
	return "programs"
}
