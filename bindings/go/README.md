# quasar-svm Go bindings

Go bindings for [QuasarSVM](../../README.md) — a lightweight Solana virtual machine that executes transactions locally without an RPC connection.

Uses [`gagliardetto/solana-go`](https://github.com/gagliardetto/solana-go) for Solana types (`PublicKey`, `Instruction`, etc.).

```bash
go get github.com/blueshift-gg/quasar-svm/bindings/go
```

## Quick Start

```go
package main

import (
	"fmt"
	"log"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/programs/token"
	quasar "github.com/blueshift-gg/quasar-svm/bindings/go"
)

func main() {
	svm, err := quasar.New() // SPL Token programs loaded by default
	if err != nil {
		log.Fatal(err)
	}
	defer svm.Free()

	authority := solana.NewWallet().PublicKey()
	mintAddr := solana.NewWallet().PublicKey()

	mint := quasar.NewMintAccount(mintAddr, quasar.MintConfig{
		MintAuthority: &authority,
		Decimals:      6,
		Supply:        10_000,
	})
	alice := quasar.NewTokenAccount(solana.NewWallet().PublicKey(), quasar.TokenAccountConfig{
		Mint: mintAddr, Owner: authority, Amount: 5_000,
	})
	bob := quasar.NewTokenAccount(solana.NewWallet().PublicKey(), quasar.TokenAccountConfig{
		Mint: mintAddr, Owner: solana.NewWallet().PublicKey(), Amount: 0,
	})

	// Transfer 1000 tokens using solana-go's SPL Token instruction builder
	ix := token.NewTransferInstruction(
		1_000,
		alice.Address,
		bob.Address,
		authority,
		nil, // no multisig signers
	).Build()

	result, err := svm.ProcessSolanaInstruction(ix, []quasar.Account{mint, alice, bob})
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Success:", result.OK())
	fmt.Println("Compute units:", result.ComputeUnits)
}
```

## API

### Creating the SVM

| Function | Description |
|----------|-------------|
| `New()` | Creates a new SVM with SPL Token, Token-2022, and Associated Token programs loaded |
| `NewWithoutPrograms()` | Creates a bare SVM with no programs loaded |

Both return `(*QuasarSVM, error)`. Call `defer svm.Free()` to release native resources. A finalizer also runs on GC if `Free()` is not called explicitly.

### Configuration

```go
svm.SetClock(quasarsvm.Clock{Slot: 100, Epoch: 1, UnixTimestamp: 1700000000, ...})
svm.WarpToSlot(500)
svm.SetComputeBudget(1_400_000)
svm.SetRent(lamportsPerByteYear)
svm.SetEpochSchedule(quasarsvm.EpochSchedule{SlotsPerEpoch: 432000, ...})
```

### Loading Programs

```go
elf, _ := os.ReadFile("my_program.so")
svm.AddProgram(programID, elf, quasarsvm.LoaderV3)
```

Loader constants: `LoaderV2` (BPF Loader v2), `LoaderV3` (Upgradeable Loader v3).

### Executing Instructions

```go
// Single instruction
result, err := svm.ProcessInstruction(ix, accounts)

// Multiple instructions (atomic)
result, err := svm.ProcessInstructionChain(ixs, accounts)

// Using solana-go Instruction interface
result, err := svm.ProcessSolanaInstruction(solanaIx, accounts)
result, err := svm.ProcessSolanaInstructionChain(solanaIxs, accounts)
```

### Execution Result

```go
result.OK()             // true if succeeded
result.Failed()         // true if failed
result.Err()            // error with message, or nil
result.ComputeUnits     // compute units consumed
result.ExecutionTimeUs  // wall-clock execution time (microseconds)
result.Logs             // program log lines
result.ReturnData       // program return data
result.Accounts         // resulting account states
result.FindAccount(pk)  // find account by public key
result.PreBalances      // lamport balances before execution
result.PostBalances     // lamport balances after execution
result.PreTokenBalances // token balances before execution
result.PostTokenBalances// token balances after execution
result.ExecutionTrace   // full instruction trace with stack depth and CU per instruction
```

### Account Factories

```go
// System account
quasarsvm.NewSystemAccount(address, lamports)

// SPL Token mint
quasarsvm.NewMintAccount(address, quasarsvm.MintConfig{
    MintAuthority:   &authority,
    Decimals:        6,
    Supply:          1_000_000,
    FreezeAuthority: nil,
})

// SPL Token account
quasarsvm.NewTokenAccount(address, quasarsvm.TokenAccountConfig{
    Mint:   mintAddress,
    Owner:  ownerAddress,
    Amount: 5_000,
})

// Token-2022 variants
quasarsvm.NewMintAccount2022(address, cfg)
quasarsvm.NewTokenAccount2022(address, cfg)
```

## Linking Modes

| Mode | Build tag | Description |
|------|-----------|-------------|
| **Vendored static** | *(default)* | Links against prebuilt `.a` files in `libquasar_svm_vendor/` |
| **Dev dynamic** | `quasar_dev` | Links against `../../target/release/libquasar_svm` (monorepo development) |
| **System dynamic** | `dynamic` | Links against system-installed `libquasar_svm` |

```bash
# Default (vendored static — consumers use this)
go test ./...

# Development (monorepo — requires cargo build --release -p quasar-svm-ffi)
go test -tags quasar_dev ./...

# Dynamic (system library)
go build -tags dynamic ./...
```

## Concurrency

`QuasarSVM` is safe for concurrent use. All methods acquire a read lock; `Free()` acquires a write lock. Calling `Free()` multiple times is safe (idempotent).

## Supported Platforms

| OS | Architecture | Library |
|----|-------------|---------|
| Linux | amd64, arm64 | `libquasar_svm.a` / `.so` |
| macOS | amd64, arm64 | `libquasar_svm.a` / `.dylib` |
| Windows | amd64 | `quasar_svm.lib` / `.dll` |
