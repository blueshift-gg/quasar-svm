# QuasarSVM - kit Layer

QuasarSVM kit layer provides Solana virtual machine execution with full interoperability with Solana's modular packages. This layer uses `Address` (branded string) from `@solana/addresses` and `Account<T>` from `@solana/accounts` for account representation.

## Installation

```bash
npm install @blueshift-gg/quasar-svm
```

## Quick Start

```ts
import {
  QuasarSvm,
  createKeyedMintAccount, createKeyedAssociatedTokenAccount,
} from "@blueshift-gg/quasar-svm/kit";
import { generateKeyPair, getAddressFromPublicKey } from "@solana/keys";
import { getTokenDecoder, getTransferInstruction } from "@solana-program/token";

const vm = new QuasarSvm(); // SPL programs loaded by default

const authorityKp = await generateKeyPair();
const authority = await getAddressFromPublicKey(authorityKp.publicKey);

const mintAddr = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
const mint  = createKeyedMintAccount(mintAddr, { decimals: 6, supply: 10_000n });
const alice = await createKeyedAssociatedTokenAccount(authority, mint.address, 5_000n);
const bob   = await createKeyedAssociatedTokenAccount(
  await getAddressFromPublicKey((await generateKeyPair()).publicKey),
  mint.address, 0n,
);

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

## Import Path

```ts
import { ... } from "@blueshift-gg/quasar-svm/kit";
```

## Type System

The kit layer uses:
- **Address Type**: `Address` (branded string from `@solana/addresses`)
- **Account Type**: `Account<T>` from `@solana/accounts`
- **Token Types**: `MintArgs`, `TokenArgs` from `@solana-program/token`

### Account<T>

```ts
// Account<Uint8Array> from @solana/accounts
type Account<TData = Uint8Array> = {
  address: Address;
  programAddress: Address;
  lamports: Lamports;        // branded bigint from @solana/rpc-types
  data: TData;
  executable: boolean;
  space: bigint;
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
vm.addProgram(programId, elf);
vm.addProgram(programId, elf, LOADER_V2);
```

#### Executing Instructions

Two execution methods — single or chain:

| Method | Behavior |
|--------|----------|
| `processInstruction` | Execute one instruction atomically. |
| `processInstructionChain` | Execute multiple instructions as one atomic chain. |

```ts
const result = vm.processInstruction(ix, accounts);
const result = vm.processInstructionChain([ix1, ix2], accounts);
```

Accounts are `Account[]`.

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
| `accounts` | `Account[]` | Resulting account states |
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
const acct = result.account(address);   // Account<Uint8Array> | null

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

All factories return `Account`. The address is always the first parameter.

### System Account

Create a system-owned account with a SOL balance:

```ts
import { createKeyedSystemAccount } from "@blueshift-gg/quasar-svm/kit";

// Lamports defaults to 1 SOL
const account = createKeyedSystemAccount(address);

// With explicit lamports
const account = createKeyedSystemAccount(address, 1_000_000_000n);
```

### Mint Account

Create a pre-initialized SPL Token mint:

```ts
import { createKeyedMintAccount } from "@blueshift-gg/quasar-svm/kit";

const account = createKeyedMintAccount(address, { decimals: 6 });
const account = createKeyedMintAccount(address, { decimals: 6, supply: 10_000n });

// Token-2022
const account = createKeyedMintAccount(address, { decimals: 6 }, TOKEN_2022_PROGRAM_ID);
```

#### MintArgs

```ts
// Partial<MintArgs> from @solana-program/token
// All fields optional — defaults: decimals=9, supply=0, no authorities
type MintArgs = {
  mintAuthority: OptionOrNullable<Address>;
  supply: number | bigint;
  decimals: number;
  isInitialized: boolean;
  freezeAuthority: OptionOrNullable<Address>;
};
```

### Token Account

Create a pre-initialized token account:

```ts
import { createKeyedTokenAccount } from "@blueshift-gg/quasar-svm/kit";

const account = createKeyedTokenAccount(address, { mint, owner, amount: 5_000n });

// Token-2022
const account = createKeyedTokenAccount(address, { mint, owner, amount: 5_000n }, TOKEN_2022_PROGRAM_ID);
```

#### TokenArgs

```ts
// Partial<TokenArgs> from @solana-program/token
// mint, owner, amount required at runtime
type TokenArgs = {
  mint: Address;
  owner: Address;
  amount: number | bigint;
  delegate: OptionOrNullable<Address>;
  state: AccountState;
  isNative: OptionOrNullable<number | bigint>;
  delegatedAmount: number | bigint;
  closeAuthority: OptionOrNullable<Address>;
};
```

### Associated Token Account

Derive the ATA address automatically and create a pre-initialized token account. The address is always derived (not optional).

```ts
import { createKeyedAssociatedTokenAccount } from "@blueshift-gg/quasar-svm/kit";

// Async — PDA derivation in @solana/addresses is async
const account = await createKeyedAssociatedTokenAccount(owner, mint, 5_000n);
account.address; // derived ATA address

const account = await createKeyedAssociatedTokenAccount(owner, mint, 5_000n, TOKEN_2022_PROGRAM_ID);
```

**Note**: Async — PDA derivation in `@solana/addresses` is async.

## Token Types

The kit layer uses types from `@solana-program/token`:

### Mint

```ts
// Mint from @solana-program/token
type Mint = {
  mintAuthority: Option<Address>;
  supply: bigint;
  decimals: number;
  isInitialized: boolean;
  freezeAuthority: Option<Address>;
};
```

### Token

```ts
// Token from @solana-program/token
type Token = {
  mint: Address;
  owner: Address;
  amount: bigint;
  delegate: Option<Address>;
  state: AccountState;
  isNative: Option<bigint>;
  delegatedAmount: bigint;
  closeAuthority: Option<Address>;
};
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

## Token Instructions

Use instruction builders from `@solana-program/token`:

### Transfer

```ts
import { getTransferInstruction } from "@solana-program/token";

const ix = getTransferInstruction({
  source,
  destination,
  authority,
  amount: 1_000n,
});
```

### MintTo

```ts
import { getMintToInstruction } from "@solana-program/token";

const ix = getMintToInstruction({
  mint,
  token: destination,
  mintAuthority,
  amount: 5_000n,
});
```

### Burn

```ts
import { getBurnInstruction } from "@solana-program/token";

const ix = getBurnInstruction({
  account: source,
  mint,
  owner: authority,
  amount: 500n,
});
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
import { getProgramDerivedAddress } from "@solana/addresses";

const [ata] = await getProgramDerivedAddress({
  programAddress: SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
  seeds: [encode(wallet), encode(tokenProgramId), encode(mint)],
});
```

**Note**: Async — `getProgramDerivedAddress` is async in `@solana/addresses`.

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
} from "@blueshift-gg/quasar-svm/kit";
import { generateKeyPair, getAddressFromPublicKey } from "@solana/keys";
import { getTokenDecoder, getTransferInstruction } from "@solana-program/token";

const vm = new QuasarSvm(); // SPL programs loaded by default

const authorityKp = await generateKeyPair();
const authority = await getAddressFromPublicKey(authorityKp.publicKey);
const recipient = await getAddressFromPublicKey((await generateKeyPair()).publicKey);

const mintAddr = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
const mint  = createKeyedMintAccount(mintAddr, { decimals: 6, supply: 10_000n });
const alice = await createKeyedAssociatedTokenAccount(authority, mint.address, 5_000n);
const bob   = await createKeyedAssociatedTokenAccount(recipient, mint.address, 0n);

const ix = getTransferInstruction({
  source: alice.address,
  destination: bob.address,
  authority,
  amount: 1_000n,
});

const result = vm.processInstruction(ix, [mint, alice, bob]);

result.assertSuccess();
console.log(result.account(bob.address, getTokenDecoder())?.amount);   // 1000n
console.log(result.account(alice.address, getTokenDecoder())?.amount); // 4000n
```

## Differences from web3.js Layer

The kit layer differs from the web3.js layer in the following ways:

| Feature | kit Layer | web3.js Layer |
|---------|-----------|---------------|
| Address Type | `Address` (branded string from `@solana/addresses`) | `Address` (class from `@solana/web3.js`) |
| Account Type | `Account<T>` from `@solana/accounts` | `KeyedAccountInfo` |
| ATA Derivation | Async (`getProgramDerivedAddress`) | Async (`findProgramAddress`) |
| Mint/Token Types | `MintArgs`/`TokenArgs` from `@solana-program/token` | Custom interfaces |
| Account Field Name | `address` | `accountId` |

Both layers expose the same functionality with different type systems to match their respective ecosystems.

## Integration with Solana Modular Packages

The kit layer is designed for seamless integration with Solana's modular package ecosystem:

- Uses `Address` branded strings from `@solana/addresses`
- Uses `Account<T>` from `@solana/accounts`
- Uses `MintArgs`, `TokenArgs` from `@solana-program/token`
- Uses `Lamports` from `@solana/rpc-types`
- Compatible with `@solana/codecs-core` decoders

This ensures type safety and consistency when working with other Solana modular packages.

## Async PDA Derivation

Unlike the web3.js layer which uses synchronous PDA derivation, the kit layer uses async PDA derivation:

```ts
// createKeyedAssociatedTokenAccount is async
const ata = await createKeyedAssociatedTokenAccount(owner, mint, amount);

// Manual ATA derivation is also async
const [ataAddress] = await getProgramDerivedAddress({
  programAddress: SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
  seeds: [encode(wallet), encode(tokenProgramId), encode(mint)],
});
```

This is because `@solana/addresses` uses async PDA derivation for compatibility with WebCrypto and other async environments.

## Exported Types and Functions

### Classes
- `QuasarSvm`
- `ExecutionResult`

### Account Factories
- `createKeyedSystemAccount(address, lamports?)`
- `createKeyedMintAccount(address, opts, tokenProgramId?)`
- `createKeyedTokenAccount(address, opts, tokenProgramId?)`
- `createKeyedAssociatedTokenAccount(owner, mint, amount, tokenProgramId?)` (async)

### Types
- `Account<T>` (re-exported from `@solana/accounts`)
- `Address` (re-exported from `@solana/addresses`)
- `MintArgs` (from `@solana-program/token`)
- `TokenArgs` (from `@solana-program/token`)
- `Mint` (from `@solana-program/token`)
- `Token` (from `@solana-program/token`)
- `AccountState` (from `@solana-program/token`)
- `ProgramError`
- `ExecutionStatus`

### Constants
- `SPL_TOKEN_PROGRAM_ID`
- `SPL_TOKEN_2022_PROGRAM_ID`
- `SPL_ASSOCIATED_TOKEN_PROGRAM_ID`
