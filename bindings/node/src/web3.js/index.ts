import { Address } from "@solana/web3.js";
import type { TransactionInstruction, KeyedAccountInfo } from "@solana/web3.js";
import { getMintEncoder, getTokenEncoder, getMintSize, getTokenSize, AccountState } from "@solana-program/token";
import type { Address as SplAddress } from "@solana/addresses";
import * as ffi from "../ffi.js";
import { serializeInstructions, serializeAccounts } from "./wire.js";
import { deserializeResult } from "../internal/deserialize.js";
import { ExecutionResult } from "./result.js";
import { QuasarSvmBase, QUASAR_SVM_CONFIG_FULL, type QuasarSvmConfig } from "../base.js";
import {
  SPL_TOKEN_PROGRAM_ID,
  SPL_TOKEN_2022_PROGRAM_ID,
  SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  LAMPORTS_PER_SOL,
  LOADER_V2,
  LOADER_V3,
  loadElf,
} from "../programs.js";
import { rentMinimumBalance } from "../token.js";

export type { KeyedAccountInfo } from "./types.js";
export { ExecutionResult } from "./result.js";
export type { ExecutionStatus, ProgramError, Clock, EpochSchedule, QuasarSvmConfig } from "../index.js";
export { QUASAR_SVM_CONFIG_FULL } from "../index.js";
export { SPL_TOKEN_PROGRAM_ID, SPL_TOKEN_2022_PROGRAM_ID, SPL_ASSOCIATED_TOKEN_PROGRAM_ID, LOADER_V2, LOADER_V3, LAMPORTS_PER_SOL } from "../programs.js";
export { AccountState } from "@solana-program/token";

const mintEncoder = getMintEncoder();
const tokenEncoder = getTokenEncoder();

// ---------------------------------------------------------------------------
// Opts — web3.js-compatible parameter types
// ---------------------------------------------------------------------------

export interface MintOpts {
  mintAuthority?: Address;
  supply?: bigint;
  decimals?: number;
  freezeAuthority?: Address;
}

export interface TokenAccountOpts {
  mint: Address;
  owner: Address;
  amount: bigint;
  delegate?: Address;
  state?: AccountState;
  isNative?: bigint;
  delegatedAmount?: bigint;
  closeAuthority?: Address;
}

// ---------------------------------------------------------------------------
// QuasarSvm
// ---------------------------------------------------------------------------

export class QuasarSvm extends QuasarSvmBase {
  constructor(config: QuasarSvmConfig = QUASAR_SVM_CONFIG_FULL) {
    super();
    if (config.token) this.addProgram(new Address(SPL_TOKEN_PROGRAM_ID), loadElf("spl_token.so"), LOADER_V2);
    if (config.token2022) this.addProgram(new Address(SPL_TOKEN_2022_PROGRAM_ID), loadElf("spl_token_2022.so"), LOADER_V3);
    if (config.associatedToken) this.addProgram(new Address(SPL_ASSOCIATED_TOKEN_PROGRAM_ID), loadElf("spl_associated_token.so"), LOADER_V2);
  }

  addProgram(programId: Address, elf: Uint8Array, loaderVersion = LOADER_V3): this {
    this.check(
      ffi.quasar_svm_add_program(
        this.ptr,
        Buffer.from(programId.toBytes()),
        Buffer.from(elf),
        elf.length,
        loaderVersion
      )
    );
    return this;
  }

  // ---------- Execution ----------

  processInstruction(instruction: TransactionInstruction, accounts: KeyedAccountInfo[]): ExecutionResult {
    return this.exec(ffi.quasar_svm_process_transaction, serializeInstructions([instruction]), serializeAccounts(accounts));
  }

  processInstructionChain(instructions: TransactionInstruction[], accounts: KeyedAccountInfo[]): ExecutionResult {
    return this.exec(ffi.quasar_svm_process_transaction, serializeInstructions(instructions), serializeAccounts(accounts));
  }

  // ---------- Internal ----------

  private exec(fn: Function, ixBuf: Buffer, acctBuf: Buffer): ExecutionResult {
    return new ExecutionResult(deserializeResult(this.execRaw(fn, ixBuf, acctBuf)));
  }
}

// ---------------------------------------------------------------------------
// Helper — builds a KeyedAccountInfo
// ---------------------------------------------------------------------------

function keyed(
  addr: Address,
  owner: Address,
  lamports: bigint,
  data: Buffer | Uint8Array,
  executable = false,
): KeyedAccountInfo {
  const accountData = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return {
    accountId: addr,
    accountInfo: {
      owner,
      lamports,
      data: accountData,
      executable,
      rentEpoch: 0n,
      space: BigInt(accountData.length),
    },
  };
}

// ---------------------------------------------------------------------------
// Account factories
// ---------------------------------------------------------------------------

/** Create a system-owned account. Defaults to 1 SOL if lamports omitted. */
export function createKeyedSystemAccount(address: Address, lamports: bigint = LAMPORTS_PER_SOL): KeyedAccountInfo {
  return keyed(address, new Address(SYSTEM_PROGRAM_ID), lamports, Buffer.alloc(0));
}

/** Create a pre-initialized mint account. */
export function createKeyedMintAccount(
  address: Address,
  opts: Partial<MintOpts> = {},
  tokenProgramId: Address = new Address(SPL_TOKEN_PROGRAM_ID)
): KeyedAccountInfo {
  const data = Buffer.from(mintEncoder.encode({
    mintAuthority: opts.mintAuthority ? opts.mintAuthority.toBase58() as SplAddress : null,
    supply: opts.supply ?? 0n,
    decimals: opts.decimals ?? 9,
    isInitialized: true,
    freezeAuthority: opts.freezeAuthority ? opts.freezeAuthority.toBase58() as SplAddress : null,
  }));
  return keyed(address, tokenProgramId, rentMinimumBalance(getMintSize()), data);
}

/** Create a pre-initialized token account. */
export function createKeyedTokenAccount(
  address: Address,
  opts: TokenAccountOpts,
  tokenProgramId: Address = new Address(SPL_TOKEN_PROGRAM_ID)
): KeyedAccountInfo {
  const data = Buffer.from(tokenEncoder.encode({
    mint: opts.mint.toBase58() as SplAddress,
    owner: opts.owner.toBase58() as SplAddress,
    amount: opts.amount,
    delegate: opts.delegate ? opts.delegate.toBase58() as SplAddress : null,
    state: (opts.state ?? AccountState.Initialized) as number,
    isNative: opts.isNative ?? null,
    delegatedAmount: opts.delegatedAmount ?? 0n,
    closeAuthority: opts.closeAuthority ? opts.closeAuthority.toBase58() as SplAddress : null,
  }));
  return keyed(address, tokenProgramId, rentMinimumBalance(getTokenSize()), data);
}

/** Create a pre-initialized associated token account. Derives the ATA address automatically. */
export async function createKeyedAssociatedTokenAccount(
  owner: Address,
  mint: Address,
  amount: bigint,
  tokenProgramId = new Address(SPL_TOKEN_PROGRAM_ID),
): Promise<KeyedAccountInfo> {
  const [ata] = await Address.findProgramAddress(
    [owner.toBytes(), tokenProgramId.toBytes(), mint.toBytes()],
    new Address(SPL_ASSOCIATED_TOKEN_PROGRAM_ID),
  );
  const data = Buffer.from(tokenEncoder.encode({
    mint: mint.toBase58() as SplAddress,
    owner: owner.toBase58() as SplAddress,
    amount,
    delegate: null,
    state: AccountState.Initialized,
    isNative: null,
    delegatedAmount: 0n,
    closeAuthority: null,
  }));
  return keyed(ata, tokenProgramId, rentMinimumBalance(getTokenSize()), data);
}

/** Generic account factory — encodes data with any @solana/codecs-compatible encoder. */
export function createKeyedAccount<T>(
  address: Address,
  owner: Address,
  encoder: { encode(value: T): Uint8Array },
  data: T,
  lamports?: bigint,
): KeyedAccountInfo {
  const encoded = Buffer.from(encoder.encode(data));
  return keyed(
    address,
    owner,
    lamports ?? rentMinimumBalance(encoded.length),
    encoded,
  );
}
