package quasarsvm

import (
	"encoding/binary"
	"errors"
	"testing"

	"github.com/gagliardetto/solana-go"
)

func TestNewAndFree(t *testing.T) {
	t.Parallel()
	svm, err := NewWithoutPrograms()
	if err != nil {
		t.Fatalf("NewWithoutPrograms: %v", err)
	}
	defer svm.Free()

	// Free should be safe to call multiple times
	svm.Free()
	svm.Free()
}

func TestNewWithPrograms(t *testing.T) {
	t.Parallel()
	svm, err := New()
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer svm.Free()
}

func TestSetClock(t *testing.T) {
	t.Parallel()
	svm, err := NewWithoutPrograms()
	if err != nil {
		t.Fatalf("NewWithoutPrograms: %v", err)
	}
	defer svm.Free()

	err = svm.SetClock(Clock{
		Slot:                100,
		EpochStartTimestamp: 1000,
		Epoch:               1,
		LeaderScheduleEpoch: 2,
		UnixTimestamp:        1700000000,
	})
	if err != nil {
		t.Fatalf("SetClock: %v", err)
	}
}

func TestWarpToSlot(t *testing.T) {
	t.Parallel()
	svm, err := NewWithoutPrograms()
	if err != nil {
		t.Fatalf("NewWithoutPrograms: %v", err)
	}
	defer svm.Free()

	if err := svm.WarpToSlot(500); err != nil {
		t.Fatalf("WarpToSlot: %v", err)
	}
}

func TestSetComputeBudget(t *testing.T) {
	t.Parallel()
	svm, err := NewWithoutPrograms()
	if err != nil {
		t.Fatalf("NewWithoutPrograms: %v", err)
	}
	defer svm.Free()

	if err := svm.SetComputeBudget(1_400_000); err != nil {
		t.Fatalf("SetComputeBudget: %v", err)
	}
}

func TestProcessInstruction(t *testing.T) {
	t.Parallel()
	svm, err := New()
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer svm.Free()

	mintAuthority := solana.NewWallet().PublicKey()
	mintAddress := solana.NewWallet().PublicKey()

	mint := NewMintAccount(mintAddress, MintConfig{
		MintAuthority: &mintAuthority,
		Decimals:      6,
	})

	data := []byte{21} // GetAccountDataSize

	ix := Instruction{
		ProgramID: solana.TokenProgramID,
		Accounts: []AccountMeta{
			{PublicKey: mintAddress, IsSigner: false, IsWritable: false},
		},
		Data: data,
	}

	result, err := svm.ProcessInstruction(ix, []Account{mint})
	if err != nil {
		t.Fatalf("ProcessInstruction: %v", err)
	}

	if !result.OK() {
		t.Fatalf("expected success, got error: %v", result.Err())
	}

	if result.ComputeUnits == 0 {
		t.Error("expected non-zero compute units")
	}

	if len(result.Logs) == 0 {
		t.Error("expected logs")
	}

	t.Logf("Compute units: %d", result.ComputeUnits)
	t.Logf("Execution time: %d us", result.ExecutionTimeUs)
	t.Logf("Logs: %v", result.Logs)
}

func TestExecutionTrace(t *testing.T) {
	t.Parallel()
	svm, err := New()
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer svm.Free()

	mintAuthority := solana.NewWallet().PublicKey()
	mintAddress := solana.NewWallet().PublicKey()

	mint := NewMintAccount(mintAddress, MintConfig{
		MintAuthority: &mintAuthority,
		Decimals:      6,
	})

	data := []byte{21} // GetAccountDataSize
	ix := Instruction{
		ProgramID: solana.TokenProgramID,
		Accounts: []AccountMeta{
			{PublicKey: mintAddress, IsSigner: false, IsWritable: false},
		},
		Data: data,
	}

	result, err := svm.ProcessInstruction(ix, []Account{mint})
	if err != nil {
		t.Fatalf("ProcessInstruction: %v", err)
	}

	if len(result.ExecutionTrace.Instructions) == 0 {
		t.Fatal("expected at least one instruction in execution trace")
	}

	first := result.ExecutionTrace.Instructions[0]
	if first.StackDepth != 0 {
		t.Errorf("expected stack depth 0, got %d", first.StackDepth)
	}
	if first.Instruction.ProgramID != solana.TokenProgramID {
		t.Errorf("expected SPL Token program ID, got %s", first.Instruction.ProgramID)
	}

	t.Logf("Trace: %d instructions", len(result.ExecutionTrace.Instructions))
}

func TestWireRoundtrip(t *testing.T) {
	t.Parallel()
	// Test instruction serialization
	ix := Instruction{
		ProgramID: solana.TokenProgramID,
		Accounts: []AccountMeta{
			{PublicKey: solana.NewWallet().PublicKey(), IsSigner: true, IsWritable: true},
			{PublicKey: solana.NewWallet().PublicKey(), IsSigner: false, IsWritable: false},
		},
		Data: []byte{1, 2, 3, 4},
	}

	buf := serializeInstructions([]Instruction{ix})

	// Verify count prefix
	count := binary.LittleEndian.Uint32(buf[:4])
	if count != 1 {
		t.Errorf("expected count=1, got %d", count)
	}

	// Test account serialization
	acct := Account{
		Address:    solana.NewWallet().PublicKey(),
		Owner:      solana.SystemProgramID,
		Lamports:   1_000_000,
		Data:       []byte{10, 20, 30},
		Executable: false,
	}

	abuf := serializeAccounts([]Account{acct})
	acount := binary.LittleEndian.Uint32(abuf[:4])
	if acount != 1 {
		t.Errorf("expected account count=1, got %d", acount)
	}
}

func TestUseAfterFree(t *testing.T) {
	t.Parallel()
	svm, err := NewWithoutPrograms()
	if err != nil {
		t.Fatalf("NewWithoutPrograms: %v", err)
	}
	svm.Free()

	if err := svm.WarpToSlot(100); !errors.Is(err, ErrFreed) {
		t.Fatalf("expected ErrFreed, got %v", err)
	}
}

func TestAddProgramEmptyELF(t *testing.T) {
	t.Parallel()
	svm, err := NewWithoutPrograms()
	if err != nil {
		t.Fatalf("NewWithoutPrograms: %v", err)
	}
	defer svm.Free()

	err = svm.AddProgram(solana.NewWallet().PublicKey(), []byte{}, LoaderV3)
	if !errors.Is(err, ErrEmptyELF) {
		t.Fatalf("expected ErrEmptyELF, got %v", err)
	}
}

func TestNewMintAccount(t *testing.T) {
	t.Parallel()
	authority := solana.NewWallet().PublicKey()
	address := solana.NewWallet().PublicKey()

	mint := NewMintAccount(address, MintConfig{
		MintAuthority: &authority,
		Decimals:      9,
		Supply:        1_000_000_000,
	})

	if mint.Address != address {
		t.Error("address mismatch")
	}
	if mint.Owner != solana.TokenProgramID {
		t.Error("owner should be SPL Token program")
	}
	if len(mint.Data) != 82 {
		t.Errorf("expected 82 bytes, got %d", len(mint.Data))
	}
	if mint.Lamports == 0 {
		t.Error("expected non-zero lamports for rent exemption")
	}
}

func TestNewTokenAccount(t *testing.T) {
	t.Parallel()
	mintAddr := solana.NewWallet().PublicKey()
	owner := solana.NewWallet().PublicKey()
	address := solana.NewWallet().PublicKey()

	token := NewTokenAccount(address, TokenAccountConfig{
		Mint:   mintAddr,
		Owner:  owner,
		Amount: 500_000,
	})

	if token.Address != address {
		t.Error("address mismatch")
	}
	if token.Owner != solana.TokenProgramID {
		t.Error("owner should be SPL Token program")
	}
	if len(token.Data) != 165 {
		t.Errorf("expected 165 bytes, got %d", len(token.Data))
	}
}
