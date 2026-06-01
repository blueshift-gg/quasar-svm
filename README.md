<h1 align="center">
  <code>quasar-svm</code>
</h1>
<p align="center">
  In-process Solana execution for Rust, Node.js, and Python.
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
import { Keypair } from "@solana/web3.js";
import { createTransferInstruction } from "@solana/spl-token";
import { getTokenDecoder } from "@solana-program/token";

const vm = new QuasarSvm(); // Token program loaded by default

const randomAddress = async () => (await Keypair.generate()).address;

const authority = await randomAddress();
const recipient = await randomAddress();

const mint = createKeyedMintAccount(await randomAddress(), { decimals: 6, supply: 10_000n });
const alice = await createKeyedAssociatedTokenAccount(authority, mint.accountId, 5_000n);
const bob = await createKeyedAssociatedTokenAccount(recipient, mint.accountId, 0n);

const ix = createTransferInstruction(alice.accountId, bob.accountId, authority, 1_000n);

const result = vm.processInstruction(ix, [mint, alice, bob]);

result.assertSuccess();
console.log(result.account(bob.accountId, getTokenDecoder())?.amount); // 1000n
```

### TypeScript (kit)

```ts
import { QuasarSvm, createKeyedMintAccount, createKeyedAssociatedTokenAccount } from "@blueshift-gg/quasar-svm/kit";
import { getAddressFromPublicKey } from "@solana/addresses";
import { generateKeyPair } from "@solana/keys";
import { createSignerFromKeyPair } from "@solana/signers";
import { getTransferInstruction, getTokenDecoder } from "@solana-program/token";

const vm = new QuasarSvm(); // Token program loaded by default

const randomAddress = async () => getAddressFromPublicKey((await generateKeyPair()).publicKey);

const authorityKeyPair = await generateKeyPair();
const authority = await createSignerFromKeyPair(authorityKeyPair);
const recipient = await randomAddress();

const mint = createKeyedMintAccount(await randomAddress(), { decimals: 6, supply: 10_000n });
const alice = await createKeyedAssociatedTokenAccount(authority.address, mint.address, 5_000n);
const bob = await createKeyedAssociatedTokenAccount(recipient, mint.address, 0n);

const ix = getTransferInstruction({
  source: alice.address,
  destination: bob.address,
  authority,
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

> **TypeScript:** Native memory is freed automatically by the GC. For deterministic cleanup in tight loops, use `using vm = new QuasarSvm()` or call `vm.free()`.
>
> **Python:** Use context manager (`with QuasarSvm() as svm:`) for automatic cleanup.

## Documentation

| Layer | README | Description |
|-------|--------|-------------|
| **Rust** | [svm/README.md](svm/README.md) | Core SVM engine: `QuasarSvm`, `ExecutionResult`, `Account`, token helpers |
| **Python** | [bindings/python/README.md](bindings/python/README.md) | Python API using `solders` types (`Pubkey`, `Instruction`, `AccountMeta`) |
| **web3.js** | [bindings/node/src/web3.js/README.md](bindings/node/src/web3.js/README.md) | TypeScript API using `@solana/web3.js` types (`Address`, `KeyedAccountInfo`) |
| **kit** | [bindings/node/src/kit/README.md](bindings/node/src/kit/README.md) | TypeScript API using `@solana/kit` types (`Address`, `Account<T>`) |

## Exports

| Import Path | Address Type | Account Type | Description |
|-------------|-------------|--------------|-------------|
| `quasar_svm` | `solders.Pubkey` | `KeyedAccount` | Python API using `solders` |
| `@blueshift-gg/quasar-svm/web3.js` | `Address` | `KeyedAccountInfo` | `@solana/web3.js` API |
| `@blueshift-gg/quasar-svm/kit` | `Address` | `Account` | `@solana/kit` API |
| `@blueshift-gg/quasar-svm/ffi` | — | — | Low-level native bindings |

All APIs expose the same core functionality with idiomatic types for each language.

## Workspace

| Crate | Path | Purpose |
|-------|------|---------|
| `quasar-svm` | `svm/` | Core execution engine — `QuasarSvm`, `ExecutionResult`, `Account`, token helpers |
| `quasar-svm-ffi` | `ffi/` | C-ABI wrapper for language bindings |
| Python bindings | `bindings/python/` | Python API using `solders` for Solana types |
| TypeScript bindings | `bindings/node/` | `web3.js` and `kit` API layers over the native engine |

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

This repository uses Bun for the TypeScript toolchain and package management.

```bash
bun install
```

```bash
# Rust
cargo check --workspace
cargo clippy --workspace

# TypeScript
bun run build
bun run build:native
bun run test
```

### README example tests

The fully-worked TypeScript README snippets are sourced from real `.ts` files under `examples/typescript/`.

How it works:

- Each README snippet has a matching source file in `examples/typescript/`.
- `bun run docs:sync-readme-examples` copies those source files into the first ` ```ts ` block under the matching README heading.
- `tests/readme-examples.test.ts` executes the source files directly.
- Vitest aliases `@blueshift-gg/quasar-svm/web3.js` and `@blueshift-gg/quasar-svm/kit` to the local source entrypoints in `bindings/node/src/...` while the tests run.
- `console.log` is intercepted while the snippet runs.
- Expected output is declared inline using comments of the form `console.log(value); // expected-output`.
- The test compares the captured log output to those expected comment strings, and also checks that the README fences are in sync.

## License

MIT
