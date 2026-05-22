# QuasarSVM - web3.js Layer

QuasarSVM web3.js layer provides Solana virtual machine execution with full interoperability with `@solana/web3.js`. This layer uses `Address` (class) from web3.js and `KeyedAccountInfo` for account representation.

## Installation

```bash
npm install @blueshift-gg/quasar-svm
```

## Quick Start

```ts
import {
  QuasarSvm,
  createKeyedMintAccount, createKeyedAssociatedTokenAccount,
  tokenTransfer,
} from "@blueshift-gg/quasar-svm/web3.js";
import { Keypair } from "@solana/web3.js";
import { getTokenDecoder } from "@solana-program/token";

const vm = new QuasarSvm(); // SPL programs loaded by default

const authority = (await Keypair.generate()).address;
const recipient = (await Keypair.generate()).address;

const mint  = createKeyedMintAccount((await Keypair.generate()).address, { decimals: 6, supply: 10_000n });
const alice = await createKeyedAssociatedTokenAccount(authority, mint.accountId, 5_000n);
const bob   = await createKeyedAssociatedTokenAccount(recipient, mint.accountId, 0n);

const ix = tokenTransfer(alice.accountId, bob.accountId, authority, 1_000n);

const result = vm.processInstruction(ix, [mint, alice, bob]);

result.assertSuccess();
console.log(result.account(bob.accountId, getTokenDecoder())?.amount); // 1000n
```

## Import Path

```ts
import { ... } from "@blueshift-gg/quasar-svm/web3.js";
```

## Type System

The web3.js layer uses:
- **Address Type**: `Address` (class) from `@solana/web3.js`
- **Account Type**: `KeyedAccountInfo`

### KeyedAccountInfo

```ts
type KeyedAccountInfo = {
  accountId: Address;
  accountInfo: {
    owner: Address;
    lamports: bigint;
    data: Buffer;
    executable: boolean;
    rentEpoch: bigint;
    space: bigint;
  };
};
```

## Core API

### QuasarSvm

#### Creating a VM

```ts
const vm = new QuasarSvm();
```

All SPL programs load by default.

**To disable specific programs:**

```ts
const vm = new QuasarSvm({
  token: true,          // default: true
  token2022: false,     // disable Token-2022
  associatedToken: true // default: true
});
```

**Or load programs manually:**

```ts
const vm = new QuasarSvm({ token: false, token2022: false, associatedToken: false });
vm.addTokenProgram();
vm.addToken2022Program();
vm.addAssociatedTokenProgram();
```

#### Memory Management

Native memory is freed automatically by the GC. For deterministic cleanup in tight loops, use `using` or call `free()`:

```ts
// Automatic — GC handles it
const vm = new QuasarSvm();

// Deterministic — freed when scope exits
{
  using vm = new QuasarSvm();
} // freed here

// Manual — explicit control
const vm = new QuasarSvm();
vm.free();
```

#### Loading Programs

Load a custom program from an ELF binary:

```ts
vm.addProgram(programId, elf);             // loader v3 (default)
vm.addProgram(programId, elf, LOADER_V2);  // loader v2
```

#### Executing Instructions

Two execution methods — single or chain:

| Method | Behavior |
|--------|----------|
| `processInstruction` | Execute one instruction atomically. |
| `processInstructionChain` | Execute multiple instructions as one atomic chain. |

```ts
// Single instruction
const result = vm.processInstruction(ix, accounts);

// Multiple instructions — atomic
const result = vm.processInstructionChain([ix1, ix2], accounts);
```

Accounts are `KeyedAccountInfo[]`.

#### Sysvars

```ts
vm.warpToSlot(200n);                    // updates clock.slot + slot_hashes
vm.setClock({ slot: 100n, epochStartTimestamp: 0n, epoch: 0n, leaderScheduleEpoch: 0n, unixTimestamp: 0n });
vm.setRent(6960n);
vm.setEpochSchedule({ slotsPerEpoch: 432000n, leaderScheduleSlotOffset: 0n, warmup: false, firstNormalEpoch: 0n, firstNormalSlot: 0n });
vm.setComputeBudget(200_000n);
```

### ExecutionResult

Every execution returns an `ExecutionResult` class with methods for inspecting the execution outcome.

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | `ExecutionStatus` | Status of the execution |
| `computeUnits` | `bigint` | Compute units used |
| `executionTimeUs` | `bigint` | Execution time in microseconds |
| `returnData` | `Uint8Array` | Program return data |
| `accounts` | `KeyedAccountInfo[]` | Resulting account states |
| `logs` | `string[]` | Execution logs |

#### Assertion Methods

```ts
result.assertSuccess();
result.assertError({ type: "InsufficientFunds" });
result.assertError({ type: "Custom", code: 6001 });

result.isSuccess();  // boolean
result.isError();    // boolean
result.printLogs();
```

#### Account Lookup

```ts
// Without decoder — returns the raw account
const acct = result.account(address);   // KeyedAccountInfo | null

// With decoder — decodes account data into T
import { getTokenDecoder, getMintDecoder } from "@solana-program/token";

const token = result.account(ataPubkey, getTokenDecoder());  // Token | null
const mint  = result.account(mintPubkey, getMintDecoder());   // Mint | null
```

`result.account()` accepts any `Decoder<T>` from `@solana/codecs-core`.

### ProgramError

TypeScript uses a discriminated union. Known errors map to negative codes; `Custom(n)` maps to positive codes.

```ts
type ProgramError =
  | { type: "InvalidArgument" }
  | { type: "InvalidInstructionData" }
  | { type: "InvalidAccountData" }
  | { type: "AccountDataTooSmall" }
  | { type: "InsufficientFunds" }
  | { type: "IncorrectProgramId" }
  | { type: "MissingRequiredSignature" }
  | { type: "AccountAlreadyInitialized" }
  | { type: "UninitializedAccount" }
  | { type: "MissingAccount" }
  | { type: "InvalidSeeds" }
  | { type: "ArithmeticOverflow" }
  | { type: "AccountNotRentExempt" }
  | { type: "InvalidAccountOwner" }
  | { type: "IncorrectAuthority" }
  | { type: "Immutable" }
  | { type: "BorshIoError" }
  | { type: "ComputeBudgetExceeded" }
  | { type: "Custom"; code: number }
  | { type: "Runtime"; message: string }
```

## Account Factories

All factories return `KeyedAccountInfo`. The address is always the first parameter.

### System Account

Create a system-owned account with a SOL balance:

```ts
import { createKeyedSystemAccount } from "@blueshift-gg/quasar-svm/web3.js";
import { Address } from "@solana/web3.js";

// Explicit address (required), lamports defaults to 1 SOL
const account = createKeyedSystemAccount(address);

// With explicit lamports
const account = createKeyedSystemAccount(address, 1_000_000_000n);
```

### Mint Account

Create a pre-initialized SPL Token mint:

```ts
import { createKeyedMintAccount, Address } from "@blueshift-gg/quasar-svm/web3.js";
import { Keypair } from "@solana/web3.js";

// Address is required as first parameter
const address = (await Keypair.generate()).address;
const account = createKeyedMintAccount(address, { decimals: 6 });
const account = createKeyedMintAccount(address, { decimals: 6, supply: 10_000n });

// Token-2022
const account = createKeyedMintAccount(address, { decimals: 6 }, TOKEN_2022_PROGRAM_ID);
```

#### MintOpts

```ts
interface MintOpts {
  mintAuthority?: Address;
  supply?: bigint;
  decimals?: number;         // default: 9
  freezeAuthority?: Address;
}
```

### Token Account

Create a pre-initialized token account:

```ts
import { createKeyedTokenAccount } from "@blueshift-gg/quasar-svm/web3.js";

// Auto-generated address
const account = createKeyedTokenAccount({ mint, owner, amount: 5_000n });

// Explicit address
const account = createKeyedTokenAccount(address, { mint, owner, amount: 5_000n });

// Token-2022
const account = createKeyedTokenAccount({ mint, owner, amount: 5_000n }, TOKEN_2022_PROGRAM_ID);
```

#### TokenAccountOpts

```ts
interface TokenAccountOpts {
  mint: Address;
  owner: Address;
  amount: bigint;
  delegate?: Address;
  state?: AccountState;       // default: Initialized
  isNative?: bigint;
  delegatedAmount?: bigint;
  closeAuthority?: Address;
}
```

### Associated Token Account

Derive the ATA address automatically and create a pre-initialized token account. The address is always derived (not optional).

```ts
import { createKeyedAssociatedTokenAccount } from "@blueshift-gg/quasar-svm/web3.js";

const account = await createKeyedAssociatedTokenAccount(owner, mint, 5_000n);
account.accountId; // derived ATA address

// Token-2022
const account = await createKeyedAssociatedTokenAccount(owner, mint, 5_000n, TOKEN_2022_PROGRAM_ID);
```

**Note**: Async — uses `Address.findProgramAddress`.

## Token Types

### Mint

```ts
interface Mint {
  mintAuthority: Address | null;
  supply: bigint;
  decimals: number;
  freezeAuthority: Address | null;
}
```

### Token

```ts
// Re-exported from spl_token::state
interface Token {
  mint: Address;
  owner: Address;
  amount: bigint;
  delegate: Address | null;
  state: AccountState;
  isNative: bigint | null;
  delegatedAmount: bigint;
  closeAuthority: Address | null;
}
```

### AccountState

```ts
// From @solana-program/token
enum AccountState {
  Uninitialized = 0,
  Initialized   = 1, // default
  Frozen        = 2,
}
```

## Token Instruction Builders

All builders accept an optional `tokenProgramId` parameter (defaults to SPL Token). Pass `TOKEN_2022_PROGRAM_ID` for Token-2022.

### Transfer

```ts
import { tokenTransfer } from "@blueshift-gg/quasar-svm/web3.js";

const ix = tokenTransfer(source, destination, authority, 1_000n);
const ix = tokenTransfer(source, destination, authority, 1_000n, TOKEN_2022_PROGRAM_ID);
```

### MintTo

```ts
import { tokenMintTo } from "@blueshift-gg/quasar-svm/web3.js";

const ix = tokenMintTo(mint, destination, mintAuthority, 5_000n);
```

### Burn

```ts
import { tokenBurn } from "@blueshift-gg/quasar-svm/web3.js";

const ix = tokenBurn(source, mint, authority, 500n);
```

## Result Token Helpers

Decode token and mint state from resulting accounts:

```ts
import { getTokenDecoder, getMintDecoder } from "@solana-program/token";

const token = result.account(ataPubkey, getTokenDecoder());  // Token | null
const mint  = result.account(mintPubkey, getMintDecoder());   // Mint | null

console.log(token?.amount);  // bigint
console.log(mint?.supply);   // bigint
```

`result.account()` accepts any `Decoder<T>` from `@solana/codecs-core`.

## ATA Derivation

Derive associated token account addresses without creating accounts:

```ts
import { Address } from "@solana/web3.js";

const [ata] = await Address.findProgramAddress(
  [wallet.toBytes(), tokenProgramId.toBytes(), mint.toBytes()],
  new Address(SPL_ASSOCIATED_TOKEN_PROGRAM_ID),
);
```

Or use `createKeyedAssociatedTokenAccount` which derives the address and creates the account in one step.

## Token-2022 Support

All factories that create token-related accounts accept an optional `tokenProgramId` parameter. Pass `TOKEN_2022_PROGRAM_ID` to create Token-2022 accounts:

```ts
const mint  = createKeyedMintAccount(mintAddr, { decimals: 6 }, TOKEN_2022_PROGRAM_ID);
const token = createKeyedTokenAccount(tokenAddr, { mint, owner, amount: 5_000n }, TOKEN_2022_PROGRAM_ID);
const ata   = await createKeyedAssociatedTokenAccount(owner, mint, 5_000n, TOKEN_2022_PROGRAM_ID);
```

## Full Example

```ts
import {
  QuasarSvm,
  createKeyedMintAccount, createKeyedAssociatedTokenAccount,
  tokenTransfer,
} from "@blueshift-gg/quasar-svm/web3.js";
import { Keypair } from "@solana/web3.js";
import { getTokenDecoder } from "@solana-program/token";

const vm = new QuasarSvm(); // SPL programs loaded by default

const authority = (await Keypair.generate()).address;
const recipient = (await Keypair.generate()).address;

const mint  = createKeyedMintAccount((await Keypair.generate()).address, { decimals: 6, supply: 10_000n });
const alice = await createKeyedAssociatedTokenAccount(authority, mint.accountId, 5_000n);
const bob   = await createKeyedAssociatedTokenAccount(recipient, mint.accountId, 0n);

const ix = tokenTransfer(alice.accountId, bob.accountId, authority, 1_000n);

const result = vm.processInstruction(ix, [mint, alice, bob]);

result.assertSuccess();
console.log(result.account(bob.accountId, getTokenDecoder())?.amount);   // 1000n
console.log(result.account(alice.accountId, getTokenDecoder())?.amount); // 4000n
```

## Differences from kit Layer

The web3.js layer differs from the kit layer in the following ways:

| Feature | web3.js Layer | kit Layer |
|---------|---------------|-----------|
| Address Type | `Address` (class from `@solana/web3.js`) | `Address` (branded string from `@solana/addresses`) |
| Account Type | `KeyedAccountInfo` | `Account<T>` from `@solana/accounts` |
| ATA Derivation | Async (`findProgramAddress`) | Async (`getProgramDerivedAddress`) |
| Mint/Token Types | Custom interfaces | `MintArgs`/`TokenArgs` from `@solana-program/token` |
| Account Field Name | `accountId` | `address` |

Both layers expose the same functionality with different type systems to match their respective ecosystems.

## Exported Types and Functions

### Classes
- `QuasarSvm`
- `ExecutionResult`

### Account Factories
- `createKeyedSystemAccount(address, lamports?)`
- `createKeyedMintAccount(address, opts, tokenProgramId?)`
- `createKeyedTokenAccount(address | opts, opts?, tokenProgramId?)`
- `createKeyedAssociatedTokenAccount(owner, mint, amount, tokenProgramId?)` (async)

### Instruction Builders
- `tokenTransfer(source, destination, authority, amount, tokenProgramId?)`
- `tokenMintTo(mint, destination, authority, amount, tokenProgramId?)`
- `tokenBurn(source, mint, authority, amount, tokenProgramId?)`

### Types
- `KeyedAccountInfo`
- `MintOpts`
- `TokenAccountOpts`
- `Mint`
- `Token`
- `AccountState`
- `ProgramError`
- `ExecutionStatus`

### Constants
- `SPL_TOKEN_PROGRAM_ID`
- `SPL_TOKEN_2022_PROGRAM_ID`
- `SPL_ASSOCIATED_TOKEN_PROGRAM_ID`
