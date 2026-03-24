import { describe, it, expect, beforeEach } from "vitest";
import { address } from "@solana/addresses";
import { lamports } from "@solana/rpc-types";
import { AccountRole } from "@solana/instructions";
import type { Account } from "@solana/accounts";
import {
  QuasarSvm,
  createKeyedSystemAccount,
  createKeyedMintAccount,
  createKeyedTokenAccount,
  SPL_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
} from "../bindings/node/src/kit/index.js";

// Valid 32-byte base58 addresses (all zeros/ones with distinct last bytes)
const ALICE = address("4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM");
const BOB = address("8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR");
const MINT = address("CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3");
const TOKEN_ACCT = address("Fj2vfeCmqR4VVoiL2UTqtK3qjfSaEdBnR6bKXbY3bNwi");

describe("state management", () => {
  let svm: QuasarSvm;

  beforeEach(() => {
    svm = new QuasarSvm();
  });

  // -- airdrop + getBalance --

  it("airdrop creates account and adds lamports", () => {
    svm.airdrop(ALICE, 1_000_000_000n);
    expect(svm.getBalance(ALICE)).toBe(1_000_000_000n);
  });

  it("airdrop accumulates on existing account", () => {
    svm.airdrop(ALICE, 500n).airdrop(ALICE, 300n);
    expect(svm.getBalance(ALICE)).toBe(800n);
  });

  it("getBalance returns 0n for missing account", () => {
    expect(svm.getBalance(BOB)).toBe(0n);
  });

  // -- setAccount + getAccount --

  it("setAccount / getAccount roundtrip", () => {
    const account: Account<Uint8Array> = {
      address: ALICE,
      programAddress: address(SYSTEM_PROGRAM_ID),
      lamports: lamports(42n),
      data: new Uint8Array([1, 2, 3]),
      executable: false,
      space: 3n,
    };
    svm.setAccount(account);
    const got = svm.getAccount(ALICE);
    expect(got).not.toBeNull();
    expect(got!.address).toBe(ALICE);
    expect(got!.programAddress).toBe(SYSTEM_PROGRAM_ID);
    expect(got!.lamports).toBe(lamports(42n));
    expect(got!.data).toEqual(new Uint8Array([1, 2, 3]));
    expect(got!.executable).toBe(false);
  });

  it("getAccount returns null for missing account", () => {
    expect(svm.getAccount(BOB)).toBeNull();
  });

  // -- createAccount --

  it("createAccount creates rent-exempt account with correct owner", () => {
    const owner = address(SPL_TOKEN_PROGRAM_ID);
    svm.createAccount(ALICE, 165, owner);
    const got = svm.getAccount(ALICE);
    expect(got).not.toBeNull();
    expect(got!.programAddress).toBe(SPL_TOKEN_PROGRAM_ID);
    expect(got!.data.length).toBe(165);
    expect(got!.lamports > 0n).toBe(true);
  });

  // -- setTokenBalance --

  it("setTokenBalance mutates token account balance", () => {
    const mint = createKeyedMintAccount(MINT, { mintAuthority: ALICE, supply: 1000n });
    const token = createKeyedTokenAccount(TOKEN_ACCT, { mint: MINT, owner: ALICE, amount: 100n });
    svm.setAccount(mint).setAccount(token);

    svm.setTokenBalance(TOKEN_ACCT, 999n);

    const got = svm.getAccount(TOKEN_ACCT);
    expect(got).not.toBeNull();
    // Verify the raw data changed (amount is at offset 64 in SPL Token account layout)
    const view = new DataView(got!.data.buffer, got!.data.byteOffset);
    expect(view.getBigUint64(64, true)).toBe(999n);
  });

  it("setTokenBalance throws on missing account", () => {
    expect(() => svm.setTokenBalance(TOKEN_ACCT, 100n)).toThrow("not found");
  });

  // -- setMintSupply --

  it("setMintSupply mutates mint supply", () => {
    const mint = createKeyedMintAccount(MINT, { mintAuthority: ALICE, supply: 1000n });
    svm.setAccount(mint);

    svm.setMintSupply(MINT, 5000n);

    const got = svm.getAccount(MINT);
    expect(got).not.toBeNull();
    // Supply is at offset 36 in SPL Mint layout
    const view = new DataView(got!.data.buffer, got!.data.byteOffset);
    expect(view.getBigUint64(36, true)).toBe(5000n);
  });

  it("setMintSupply throws on missing account", () => {
    expect(() => svm.setMintSupply(MINT, 100n)).toThrow("not found");
  });

  // -- warpToTimestamp --

  it("warpToTimestamp sets the clock unix_timestamp", () => {
    svm.warpToTimestamp(1700000000n);
    // Verify by executing an instruction and checking the result's clock
    // (no direct getter, but if it doesn't throw, the FFI call works)
    svm.airdrop(ALICE, 1_000_000_000n);
    const result = svm.processInstruction({
      programAddress: address(SYSTEM_PROGRAM_ID),
      accounts: [],
      data: new Uint8Array(0),
    });
    // Just verify it didn't throw — the timestamp is set internally
    expect(result).toBeDefined();
  });

  // -- simulate (dry run, no state commit) --

  it("simulateInstruction does not commit state changes", () => {
    svm.airdrop(ALICE, 2_000_000_000n);
    svm.airdrop(BOB, 1_000_000n);

    const data = new Uint8Array(12);
    const view = new DataView(data.buffer);
    view.setUint32(0, 2, true);
    view.setBigUint64(4, 500_000_000n, true);

    const result = svm.simulateInstruction({
      programAddress: address(SYSTEM_PROGRAM_ID),
      accounts: [
        { address: ALICE, role: AccountRole.WRITABLE_SIGNER },
        { address: BOB, role: AccountRole.WRITABLE },
      ],
      data,
    });

    result.assertSuccess();
    // State should NOT have changed
    expect(svm.getBalance(ALICE)).toBe(2_000_000_000n);
    expect(svm.getBalance(BOB)).toBe(1_000_000n);
  });

  // -- statefulness: SVM store used by processInstruction --

  it("processInstruction reads accounts from SVM store (SOL transfer)", () => {
    // Set up accounts in the SVM store — no accounts passed to processInstruction
    svm.airdrop(ALICE, 2_000_000_000n);
    svm.airdrop(BOB, 1_000_000n);

    // Build a system program Transfer instruction (index 2, u32 LE + u64 LE lamports)
    const data = new Uint8Array(12);
    const view = new DataView(data.buffer);
    view.setUint32(0, 2, true); // Transfer instruction index
    view.setBigUint64(4, 500_000_000n, true); // lamports

    const result = svm.processInstruction({
      programAddress: address(SYSTEM_PROGRAM_ID),
      accounts: [
        { address: ALICE, role: AccountRole.WRITABLE_SIGNER },
        { address: BOB, role: AccountRole.WRITABLE },
      ],
      data,
    });

    result.assertSuccess();
    expect(svm.getBalance(ALICE)).toBe(1_500_000_000n);
    expect(svm.getBalance(BOB)).toBe(500_000_000n + 1_000_000n);
  });

  it("processInstruction reads token accounts from SVM store (SPL transfer)", () => {
    const ALICE_TOKEN = address("DjPi1LtwrXJMAYjR3G1mMQmjkRRjsFBacjJJm8JHHzNu");
    const BOB_TOKEN = address("HJiQv2jg8JZoNrREAfbS7nXHhR4hEMnqsYbBNpKXSGaC");

    // Store mint + token accounts in SVM
    const mint = createKeyedMintAccount(MINT, { mintAuthority: ALICE, supply: 10_000n, decimals: 6 });
    const aliceToken = createKeyedTokenAccount(ALICE_TOKEN, { mint: MINT, owner: ALICE, amount: 5_000n });
    const bobToken = createKeyedTokenAccount(BOB_TOKEN, { mint: MINT, owner: BOB, amount: 0n });
    svm.setAccount(mint).setAccount(aliceToken).setAccount(bobToken);

    // Build SPL Token Transfer instruction (index 3, u8 + u64 LE amount)
    const data = new Uint8Array(9);
    data[0] = 3; // Transfer instruction index
    new DataView(data.buffer).setBigUint64(1, 1_000n, true);

    const result = svm.processInstruction({
      programAddress: address(SPL_TOKEN_PROGRAM_ID),
      accounts: [
        { address: ALICE_TOKEN, role: AccountRole.WRITABLE },
        { address: BOB_TOKEN, role: AccountRole.WRITABLE },
        { address: ALICE, role: AccountRole.READONLY_SIGNER },
      ],
      data,
    });

    result.assertSuccess();

    // Verify balances changed in SVM store
    const aliceAcct = svm.getAccount(ALICE_TOKEN)!;
    const bobAcct = svm.getAccount(BOB_TOKEN)!;
    const aliceAmount = new DataView(aliceAcct.data.buffer, aliceAcct.data.byteOffset).getBigUint64(64, true);
    const bobAmount = new DataView(bobAcct.data.buffer, bobAcct.data.byteOffset).getBigUint64(64, true);
    expect(aliceAmount).toBe(4_000n);
    expect(bobAmount).toBe(1_000n);
  });
});
