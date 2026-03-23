<h1 align="center">
  <code>quasar-svm</code>
</h1>
<p align="center">
  In-process Solana execution for Rust, Node.js, Python, and Go.
</p>

## Overview

QuasarSVM is a lightweight Solana virtual machine that executes transactions locally without an RPC connection or validator. Provide program ELFs, account state, and instructions — get back logs, compute units, return data, byte-level account diffs, and resulting accounts.

`Account` is the universal account type across all layers.

```toml
[dependencies]
quasar-svm = "0.1"
```

```bash
npm install @blueshift-gg/quasar-svm
```

```bash
pip install quasar-svm
```

```bash
go get github.com/blueshift-gg/quasar-svm/bindings/go
```

## Quick Start

### Rust

```rust
use quasar_svm::{QuasarSvm, Pubkey, SPL_TOKEN_PROGRAM_ID};
use quasar_svm::token::*;
use spl_token::state::Account as SplTokenAccount;
use solana_program_pack::Pack;

let authority = Pubkey::new_unique();

let mint = create_keyed_mint_account(&Pubkey::new_unique(), &Mint { decimals: 6, supply: 10_000, ..Default::default() });
let alice = create_keyed_associated_token_account(&authority, &mint.address, 5_000);
let bob   = create_keyed_associated_token_account(&Pubkey::new_unique(), &mint.address, 0);

let ix = spl_token::instruction::transfer(
    &SPL_TOKEN_PROGRAM_ID,
    &alice.address,
    &bob.address,
    &authority,
    &[],
    1_000,
).unwrap();

let mut svm = QuasarSvm::new(); // Token program loaded by default

let result = svm.process_instruction(&ix, &[mint, alice, bob]);

result.assert_success();

// Verify by unpacking account data
let bob_account = result.account(&bob.address).unwrap();
let bob_token = SplTokenAccount::unpack(&bob_account.data).unwrap();
assert_eq!(bob_token.amount, 1_000);
```

### TypeScript (web3.js)

```ts
import { QuasarSvm, createKeyedMintAccount, createKeyedAssociatedTokenAccount } from "@blueshift-gg/quasar-svm/web3.js";
import { Address } from "@solana/web3.js";
import { getTransferInstruction } from "@solana/spl-token";
import { getTokenDecoder } from "@solana-program/token";

const vm = new QuasarSvm(); // Token program loaded by default

const authority = new Address("11111111111111111111111111111112"); // Example address
const recipient = new Address("11111111111111111111111111111113");

const mint = createKeyedMintAccount(new Address("TokenMint111111111111111111111111111"), { decimals: 6, supply: 10_000n });
const alice = createKeyedAssociatedTokenAccount(authority, mint.accountId, 5_000n);
const bob = createKeyedAssociatedTokenAccount(recipient, mint.accountId, 0n);

const ix = getTransferInstruction({
  source: alice.accountId,
  destination: bob.accountId,
  owner: authority,
  amount: 1_000n,
});

const result = vm.processInstruction(ix, [mint, alice, bob]);

result.assertSuccess();
console.log(result.account(bob.accountId, getTokenDecoder())?.amount); // 1000n
```

### TypeScript (kit)

```ts
import { QuasarSvm, createKeyedMintAccount, createKeyedAssociatedTokenAccount } from "@blueshift-gg/quasar-svm/kit";
import { address } from "@solana/addresses";
import { getTransferInstruction, getTokenDecoder } from "@solana-program/token";

const vm = new QuasarSvm(); // Token program loaded by default

const authority = address("11111111111111111111111111111112"); // Example address
const recipient = address("11111111111111111111111111111113");

const mint = createKeyedMintAccount(address("TokenMint111111111111111111111111111"), { decimals: 6, supply: 10_000n });
const alice = await createKeyedAssociatedTokenAccount(authority, mint.address, 5_000n);
const bob = await createKeyedAssociatedTokenAccount(recipient, mint.address, 0n);

const ix = getTransferInstruction({
  source: alice.address,
  destination: bob.address,
  owner: authority,
  amount: 1_000n,
});

const result = vm.processInstruction(ix, [mint, alice, bob]);

result.assertSuccess();
console.log(result.account(bob.address, getTokenDecoder())?.amount); // 1000n
```

### Python

```python
from quasar_svm import QuasarSvm, create_keyed_mint_account, create_keyed_associated_token_account
from solders.pubkey import Pubkey
from spl.token.instructions import transfer, TransferParams

# Token program loaded by default
with QuasarSvm() as svm:
    authority = Pubkey.new_unique()
    recipient = Pubkey.new_unique()

    # Create mint and token accounts
    mint = create_keyed_mint_account(
        Pubkey.new_unique(),
        mint_authority=authority,
        decimals=6,
        supply=10_000,
    )
    alice = create_keyed_associated_token_account(authority, mint.address, 5_000)
    bob = create_keyed_associated_token_account(recipient, mint.address, 0)

    # Transfer tokens
    ix = transfer(
        TransferParams(
            program_id=mint.owner,
            source=alice.address,
            dest=bob.address,
            owner=authority,
            amount=1_000,
        )
    )

    result = svm.process_instruction(ix, [mint, alice, bob])
    result.assert_success()

    # Verify transfer
    bob_account = result.account(bob.address)
    print(f"Bob's balance: {bob_account.data[64:72]}")  # Token amount at offset 64
```

### Go

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
	svm, _ := quasar.New() // Token program loaded by default
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
		nil,
	).Build()

	result, err := svm.ProcessSolanaInstruction(ix, []quasar.Account{mint, alice, bob})
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Compute units:", result.ComputeUnits)
	for _, l := range result.Logs {
		fmt.Println(l)
	}
}
```

> **TypeScript:** Native memory is freed automatically by the GC. For deterministic cleanup in tight loops, use `using vm = new QuasarSvm()` or call `vm.free()`.
>
> **Python:** Use context manager (`with QuasarSvm() as svm:`) for automatic cleanup.
>
> **Go:** Use `defer svm.Free()` for cleanup. The finalizer also handles it if `Free()` is not called explicitly.

## Documentation

| Layer | README | Description |
|-------|--------|-------------|
| **Rust** | [svm/README.md](svm/README.md) | Core SVM engine: `QuasarSvm`, `ExecutionResult`, `Account`, token helpers |
| **Python** | [bindings/python/README.md](bindings/python/README.md) | Python API using `solders` types (`Pubkey`, `Instruction`, `AccountMeta`) |
| **web3.js** | [bindings/node/src/web3.js/README.md](bindings/node/src/web3.js/README.md) | TypeScript API using `@solana/web3.js` types (`PublicKey`, `KeyedAccountInfo`) |
| **kit** | [bindings/node/src/kit/README.md](bindings/node/src/kit/README.md) | TypeScript API using `@solana/kit` types (`Address`, `Account<T>`) |
| **Go** | [bindings/go/README.md](bindings/go/README.md) | Go API using `gagliardetto/solana-go` types (`PublicKey`) |

## Exports

| Import Path | Address Type | Account Type | Description |
|-------------|-------------|--------------|-------------|
| `quasar_svm` | `solders.Pubkey` | `KeyedAccount` | Python API using `solders` |
| `@blueshift-gg/quasar-svm/web3.js` | `PublicKey` | `KeyedAccount` | `@solana/web3.js` API |
| `@blueshift-gg/quasar-svm/kit` | `Address` | `Account` | `@solana/kit` API |
| `@blueshift-gg/quasar-svm/ffi` | — | — | Low-level native bindings |
| `github.com/blueshift-gg/quasar-svm/bindings/go` | `solana.PublicKey` | `Account` | Go API using `solana-go` |

All APIs expose the same core functionality with idiomatic types for each language. The web3.js layer additionally provides `toKeyedAccountInfo` / `fromKeyedAccountInfo` for interop with legacy code.

## Workspace

| Crate | Path | Purpose |
|-------|------|---------|
| `quasar-svm` | `svm/` | Core execution engine — `QuasarSvm`, `ExecutionResult`, `Account`, token helpers |
| `quasar-svm-ffi` | `ffi/` | C-ABI wrapper for language bindings |
| Python bindings | `bindings/python/` | Python API using `solders` for Solana types |
| TypeScript bindings | `bindings/node/` | `web3.js` and `kit` API layers over the native engine |
| Go bindings | `bindings/go/` | Go API using `gagliardetto/solana-go` via CGo (prebuilt libs bundled) |

## Built-in Programs

The system program, BPF Loader v2, and Upgradeable Loader v3 are always available. SPL programs are bundled and loaded by default.

**Rust:**
```rust
// All SPL programs loaded by default
let svm = QuasarSvm::new();

// Or customize via config
use quasar_svm::QuasarSvmConfig;
let svm = QuasarSvm::new_with_config(QuasarSvmConfig {
    token: true,
    token_2022: false,
    associated_token: true,
});

// Or use builder methods
QuasarSvm::new()
    .with_token_program()
    .with_token_2022_program()
    .with_associated_token_program();
```

**TypeScript:**
```ts
// All SPL programs loaded by default
const vm = new QuasarSvm();

// Or customize via config
const vm = new QuasarSvm({
  token: true,
  token2022: false,
  associatedToken: true,
});
```

## Development

```bash
# Rust
cargo check --workspace
cargo clippy --workspace

# TypeScript
npm run build
npm run build:native

# Go (dev mode — links against target/release/)
cargo build --release -p quasar-svm-ffi
make test-go

# Go (bundle prebuilt libs for distribution)
make build-all       # builds all platforms
make build-go-all    # copies into bindings/go/lib/
```

## License

MIT
