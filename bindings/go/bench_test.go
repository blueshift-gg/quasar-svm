package quasarsvm

import (
	"runtime"
	"testing"

	"github.com/gagliardetto/solana-go"
)

// BenchmarkProcessInstruction measures the full hot path:
// serialize → CGo call → deserialize.
func BenchmarkProcessInstruction(b *testing.B) {
	svm, err := New()
	if err != nil {
		b.Fatalf("New: %v", err)
	}
	defer svm.Free()

	mintAuthority := solana.NewWallet().PublicKey()
	mintAddress := solana.NewWallet().PublicKey()
	mint := NewMintAccount(mintAddress, MintConfig{
		MintAuthority: &mintAuthority,
		Decimals:      6,
	})

	ix := Instruction{
		ProgramID: solana.TokenProgramID,
		Accounts:  []AccountMeta{{PublicKey: mintAddress}},
		Data:      []byte{21}, // GetAccountDataSize
	}
	accounts := []Account{mint}

	b.ResetTimer()
	b.ReportAllocs()

	for range b.N {
		result, err := svm.ProcessInstruction(ix, accounts)
		if err != nil {
			b.Fatal(err)
		}
		runtime.KeepAlive(result)
	}
}

// BenchmarkSerializeInstructions measures serialization overhead in isolation.
func BenchmarkSerializeInstructions(b *testing.B) {
	ixs := []Instruction{
		{
			ProgramID: solana.TokenProgramID,
			Accounts: []AccountMeta{
				{PublicKey: solana.NewWallet().PublicKey(), IsSigner: true, IsWritable: true},
				{PublicKey: solana.NewWallet().PublicKey(), IsWritable: true},
				{PublicKey: solana.NewWallet().PublicKey()},
			},
			Data: make([]byte, 9), // typical transfer data
		},
	}

	b.ResetTimer()
	b.ReportAllocs()

	for range b.N {
		buf := serializeInstructions(ixs)
		runtime.KeepAlive(buf)
	}
}

// BenchmarkSerializeAccounts measures account serialization overhead.
func BenchmarkSerializeAccounts(b *testing.B) {
	accounts := []Account{
		NewMintAccount(solana.NewWallet().PublicKey(), MintConfig{Decimals: 6}),
		NewTokenAccount(solana.NewWallet().PublicKey(), TokenAccountConfig{
			Mint: solana.NewWallet().PublicKey(), Owner: solana.NewWallet().PublicKey(), Amount: 1000,
		}),
		NewTokenAccount(solana.NewWallet().PublicKey(), TokenAccountConfig{
			Mint: solana.NewWallet().PublicKey(), Owner: solana.NewWallet().PublicKey(), Amount: 0,
		}),
	}

	b.ResetTimer()
	b.ReportAllocs()

	for range b.N {
		buf := serializeAccounts(accounts)
		runtime.KeepAlive(buf)
	}
}

// BenchmarkNewMintAccount measures factory allocation overhead.
func BenchmarkNewMintAccount(b *testing.B) {
	authority := solana.NewWallet().PublicKey()
	address := solana.NewWallet().PublicKey()
	cfg := MintConfig{MintAuthority: &authority, Decimals: 6, Supply: 1000}

	b.ResetTimer()
	b.ReportAllocs()

	for range b.N {
		acct := NewMintAccount(address, cfg)
		runtime.KeepAlive(acct)
	}
}
