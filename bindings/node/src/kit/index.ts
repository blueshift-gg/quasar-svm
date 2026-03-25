import type { Address } from "@solana/addresses";
import { address, getAddressEncoder, getProgramDerivedAddress } from "@solana/addresses";
import type { Account } from "@solana/accounts";
import { lamports } from "@solana/rpc-types";
import type { Instruction } from "@solana/instructions";
import type { MintArgs, TokenArgs } from "@solana-program/token";
import {
  AccountState,
  TokenAccount,
  getMintEncoder,
  getMintDecoder,
  getTokenEncoder,
  getTokenDecoder,
  getMintSize,
  getTokenSize,
  identifyTokenAccount,
} from "@solana-program/token";
import * as ffi from "../ffi.js";
import { serializeInstructions, serializeAccounts, deserializeSingleAccount } from "./wire.js";
import { deserializeResult } from "../internal/deserialize.js";
import { ExecutionResult } from "./result.js";
import { QuasarSvmBase, QUASAR_SVM_CONFIG_FULL, type QuasarSvmConfig } from "../base.js";
import {
  SPL_TOKEN_PROGRAM_ID,
  SPL_TOKEN_2022_PROGRAM_ID,
  SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  LOADER_V2,
  LOADER_V3,
  loadElf,
} from "../programs.js";
import { rentMinimumBalance } from "../token.js";

export { ExecutionResult } from "./result.js";
export type { Mint, Token } from "./result.js";
export { AccountState } from "./result.js";
export type { MintArgs, TokenArgs } from "@solana-program/token";
export type { ExecutionStatus, ProgramError, Clock, EpochSchedule, QuasarSvmConfig } from "../index.js";
export { QUASAR_SVM_CONFIG_FULL } from "../index.js";
export { SPL_TOKEN_PROGRAM_ID, SPL_TOKEN_2022_PROGRAM_ID, SPL_ASSOCIATED_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID, LOADER_V2, LOADER_V3, LAMPORTS_PER_SOL } from "../programs.js";

const addressEncoder = getAddressEncoder();
const mintEncoder = getMintEncoder();
const mintDecoder = getMintDecoder();
const tokenEncoder = getTokenEncoder();
const tokenDecoder = getTokenDecoder();

function isTokenProgram(owner: Address): boolean {
  return owner === SPL_TOKEN_PROGRAM_ID || owner === SPL_TOKEN_2022_PROGRAM_ID;
}

// ---------------------------------------------------------------------------
// QuasarSvm
// ---------------------------------------------------------------------------

export class QuasarSvm extends QuasarSvmBase {
  constructor(config: QuasarSvmConfig = QUASAR_SVM_CONFIG_FULL) {
    super();
    if (config.token) this.addProgram(address(SPL_TOKEN_PROGRAM_ID), loadElf("spl_token.so"), LOADER_V2);
    if (config.token2022) this.addProgram(address(SPL_TOKEN_2022_PROGRAM_ID), loadElf("spl_token_2022.so"), LOADER_V3);
    if (config.associatedToken) this.addProgram(address(SPL_ASSOCIATED_TOKEN_PROGRAM_ID), loadElf("spl_associated_token.so"), LOADER_V2);
  }

  addProgram(programId: Address, elf: Uint8Array, loaderVersion = LOADER_V3): this {
    this.check(
      ffi.quasar_svm_add_program(
        this.ptr,
        Buffer.from(addressEncoder.encode(programId)),
        Buffer.from(elf),
        elf.length,
        loaderVersion
      )
    );
    return this;
  }

  // ---------- State management ----------

  setAccount(account: Account<Uint8Array>): this {
    const buf = serializeAccounts([account]);
    this.check(ffi.quasar_svm_set_account(this.ptr, buf, buf.length));
    return this;
  }

  getAccount(addr: Address): Account<Uint8Array> | null {
    const pubkeyBuf = Buffer.from(addressEncoder.encode(addr));
    const resultBuf = this.execGetAccount(pubkeyBuf);
    if (!resultBuf) return null;
    return deserializeSingleAccount(resultBuf);
  }

  airdrop(addr: Address, amount: bigint): this {
    const pubkeyBuf = Buffer.from(addressEncoder.encode(addr));
    this.check(ffi.quasar_svm_airdrop(this.ptr, pubkeyBuf, amount));
    return this;
  }

  getBalance(addr: Address): bigint {
    const pubkeyBuf = Buffer.from(addressEncoder.encode(addr));
    const out = [BigInt(0)];
    this.check(ffi.quasar_svm_get_balance(this.ptr, pubkeyBuf, out));
    return BigInt(out[0]);
  }

  createAccount(addr: Address, space: number, owner: Address): this {
    const pubkeyBuf = Buffer.from(addressEncoder.encode(addr));
    const ownerBuf = Buffer.from(addressEncoder.encode(owner));
    this.check(ffi.quasar_svm_create_account(this.ptr, pubkeyBuf, space, ownerBuf));
    return this;
  }

  setTokenBalance(addr: Address, amount: bigint): this {
    const acct = this.getAccount(addr);
    if (!acct) throw new Error(`setTokenBalance: account ${addr} not found`);
    if (!isTokenProgram(acct.programAddress)) {
      throw new Error(`setTokenBalance: account ${addr} is not a valid token account`);
    }
    try {
      // Match the current Rust mutator, which uses spl_token::state::Account
      // Pack::unpack() and only accepts the base 165-byte layout. Token-2022
      // accounts with extensions must be rejected here until Rust is extension-aware.
      if (identifyTokenAccount(acct.data) !== TokenAccount.Token) throw null;
      const token = tokenDecoder.decode(acct.data);
      if (token.state === AccountState.Uninitialized) throw null;
    } catch {
      throw new Error(`setTokenBalance: account ${addr} is not a valid token account`);
    }
    const pubkeyBuf = Buffer.from(addressEncoder.encode(addr));
    this.check(ffi.quasar_svm_set_token_balance(this.ptr, pubkeyBuf, amount));
    return this;
  }

  setMintSupply(addr: Address, supply: bigint): this {
    const acct = this.getAccount(addr);
    if (!acct) throw new Error(`setMintSupply: account ${addr} not found`);
    if (!isTokenProgram(acct.programAddress)) {
      throw new Error(`setMintSupply: account ${addr} is not a valid mint account`);
    }
    try {
      // Match the current Rust mutator, which uses spl_token::state::Mint
      // Pack::unpack() and only accepts the base 82-byte layout. Token-2022
      // mints with extensions must be rejected here until Rust is extension-aware.
      if (identifyTokenAccount(acct.data) !== TokenAccount.Mint) throw null;
      const mint = mintDecoder.decode(acct.data);
      if (!mint.isInitialized) throw null;
    } catch {
      throw new Error(`setMintSupply: account ${addr} is not a valid mint account`);
    }
    const pubkeyBuf = Buffer.from(addressEncoder.encode(addr));
    this.check(ffi.quasar_svm_set_mint_supply(this.ptr, pubkeyBuf, supply));
    return this;
  }

  // ---------- Execution ----------

  processInstruction(instruction: Instruction, accounts: Account<Uint8Array>[] = []): ExecutionResult {
    return this.exec(ffi.quasar_svm_process_transaction, serializeInstructions([instruction]), serializeAccounts(accounts));
  }

  processInstructionChain(instructions: Instruction[], accounts: Account<Uint8Array>[] = []): ExecutionResult {
    return this.exec(ffi.quasar_svm_process_transaction, serializeInstructions(instructions), serializeAccounts(accounts));
  }

  simulateInstruction(instruction: Instruction, accounts: Account<Uint8Array>[] = []): ExecutionResult {
    return this.exec(ffi.quasar_svm_simulate_transaction, serializeInstructions([instruction]), serializeAccounts(accounts));
  }

  simulateInstructionChain(instructions: Instruction[], accounts: Account<Uint8Array>[] = []): ExecutionResult {
    return this.exec(ffi.quasar_svm_simulate_transaction, serializeInstructions(instructions), serializeAccounts(accounts));
  }

  // ---------- Internal ----------

  private exec(fn: Function, ixBuf: Buffer, acctBuf: Buffer): ExecutionResult {
    return new ExecutionResult(deserializeResult(this.execRaw(fn, ixBuf, acctBuf)));
  }
}

// ---------------------------------------------------------------------------
// Account factories
// ---------------------------------------------------------------------------

const enc = (a: Address) => new Uint8Array(addressEncoder.encode(a));

/** Create a system-owned account with the given lamports. */
export function createKeyedSystemAccount(addr: Address, lamps: bigint = 1_000_000_000n): Account<Uint8Array> {
  return {
    address: addr,
    programAddress: address(SYSTEM_PROGRAM_ID),
    lamports: lamports(lamps),
    data: new Uint8Array(0),
    executable: false,
    space: 0n,
  };
}

/** Create a pre-initialized mint account. */
export function createKeyedMintAccount(addr: Address, args: Partial<MintArgs> = {}, tokenProgramId: Address = address(SPL_TOKEN_PROGRAM_ID)): Account<Uint8Array> {
  const data = new Uint8Array(mintEncoder.encode({
    mintAuthority: args.mintAuthority ?? null,
    supply: args.supply ?? 0n,
    decimals: args.decimals ?? 9,
    isInitialized: true,
    freezeAuthority: args.freezeAuthority ?? null,
  }));
  return {
    address: addr,
    programAddress: tokenProgramId,
    lamports: lamports(rentMinimumBalance(getMintSize())),
    data,
    executable: false,
    space: BigInt(data.length),
  };
}

/** Create a pre-initialized token account. */
export function createKeyedTokenAccount(addr: Address, args: Partial<TokenArgs>, tokenProgramId: Address = address(SPL_TOKEN_PROGRAM_ID)): Account<Uint8Array> {
  const data = new Uint8Array(tokenEncoder.encode({
    mint: args.mint!,
    owner: args.owner!,
    amount: args.amount!,
    delegate: args.delegate ?? null,
    state: args.state ?? AccountState.Initialized,
    isNative: args.isNative ?? null,
    delegatedAmount: args.delegatedAmount ?? 0n,
    closeAuthority: args.closeAuthority ?? null,
  }));
  return {
    address: addr,
    programAddress: tokenProgramId,
    lamports: lamports(rentMinimumBalance(getTokenSize())),
    data,
    executable: false,
    space: BigInt(data.length),
  };
}

/** Create a pre-initialized associated token account. Derives the ATA address automatically. */
export async function createKeyedAssociatedTokenAccount(
  owner: Address,
  mint: Address,
  amount: bigint,
  tokenProgramId: Address = address(SPL_TOKEN_PROGRAM_ID),
): Promise<Account<Uint8Array>> {
  const [ata] = await getProgramDerivedAddress({
    programAddress: address(SPL_ASSOCIATED_TOKEN_PROGRAM_ID),
    seeds: [enc(owner), enc(tokenProgramId), enc(mint)],
  });
  return createKeyedTokenAccount(ata, { mint, owner, amount }, tokenProgramId);
}
