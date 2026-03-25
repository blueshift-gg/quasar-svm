import { describe, it, expect, beforeEach } from "vitest";
import { address } from "@solana/addresses";
import { lamports } from "@solana/rpc-types";
import type { Account } from "@solana/accounts";
import { createNoopSigner } from "@solana/signers";
import { getTransferSolInstruction } from "@solana-program/system";
import { getTransferInstruction, getTokenDecoder, getMintDecoder } from "@solana-program/token";
import {
  QuasarSvm,
  createKeyedSystemAccount,
  createKeyedMintAccount,
  createKeyedTokenAccount,
  SPL_TOKEN_PROGRAM_ID,
  SPL_TOKEN_2022_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
} from "../bindings/node/src/kit/index.js";

const ALICE = address("4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM");
const BOB = address("8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR");
const MINT = address("CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3");
const TOKEN_ACCT = address("Fj2vfeCmqR4VVoiL2UTqtK3qjfSaEdBnR6bKXbY3bNwi");

const aliceSigner = createNoopSigner(ALICE);

describe("state management", () => {
  let svm: QuasarSvm;

  beforeEach(() => {
    svm = new QuasarSvm();
  });

  describe("airdrop + getBalance", () => {
    it("airdrop creates account and adds lamports", () => {
      expect(svm.getBalance(ALICE)).toBe(0n);
      svm.airdrop(ALICE, 1_000_000_000n);
      expect(svm.getBalance(ALICE)).toBe(1_000_000_000n);
    });

    it("airdrop accumulates on existing account", () => {
      expect(svm.getBalance(ALICE)).toBe(0n);
      svm.airdrop(ALICE, 500n).airdrop(ALICE, 300n);
      expect(svm.getBalance(ALICE)).toBe(800n);
    });

    it("getBalance returns 0n for missing account", () => {
      expect(svm.getBalance(BOB)).toBe(0n);
    });
  });

  describe("setAccount + getAccount", () => {
    it("roundtrip", () => {
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
  });

  describe("createAccount", () => {
    it("creates rent-exempt account with correct owner", () => {
      const owner = address(SPL_TOKEN_PROGRAM_ID);
      svm.createAccount(ALICE, 165, owner);
      const got = svm.getAccount(ALICE);
      expect(got).not.toBeNull();
      expect(got!.programAddress).toBe(SPL_TOKEN_PROGRAM_ID);
      expect(got!.data.length).toBe(165);
      expect(got!.lamports > 0n).toBe(true);
    });
  });

  describe("setTokenBalance", () => {
    it("mutates token account balance", () => {
      const mint = createKeyedMintAccount(MINT, { mintAuthority: ALICE, supply: 1000n });
      const token = createKeyedTokenAccount(TOKEN_ACCT, { mint: MINT, owner: ALICE, amount: 100n });
      svm.setAccount(mint).setAccount(token);

      svm.setTokenBalance(TOKEN_ACCT, 999n);

      const got = svm.getAccount(TOKEN_ACCT);
      expect(got).not.toBeNull();
      const decoded = getTokenDecoder().decode(got!.data);
      expect(decoded.amount).toBe(999n);
    });

    it("throws on missing account", () => {
      expect(() => svm.setTokenBalance(TOKEN_ACCT, 100n)).toThrow("not found");
    });

    it("throws on non-token account", () => {
      svm.createAccount(TOKEN_ACCT, 32, address(SYSTEM_PROGRAM_ID));
      expect(() => svm.setTokenBalance(TOKEN_ACCT, 100n)).toThrow("not a valid token account");
    });

    it("throws on correct-length garbage data", () => {
      svm.setAccount({
        address: TOKEN_ACCT,
        programAddress: address(SPL_TOKEN_PROGRAM_ID),
        lamports: lamports(1_000_000n),
        data: new Uint8Array(165),
        executable: false,
        space: 165n,
      });
      expect(() => svm.setTokenBalance(TOKEN_ACCT, 100n)).toThrow("not a valid token account");
    });

    it("throws on token-2022 account with extensions", () => {
      svm.setAccount({
        address: TOKEN_ACCT,
        programAddress: address(SPL_TOKEN_2022_PROGRAM_ID),
        lamports: lamports(1_000_000n),
        data: new Uint8Array(200),
        executable: false,
        space: 200n,
      });
      expect(() => svm.setTokenBalance(TOKEN_ACCT, 100n)).toThrow("not a valid token account");
    });
  });

  describe("setMintSupply", () => {
    it("mutates mint supply", () => {
      const mint = createKeyedMintAccount(MINT, { mintAuthority: ALICE, supply: 1000n });
      svm.setAccount(mint);

      svm.setMintSupply(MINT, 5000n);

      const got = svm.getAccount(MINT);
      expect(got).not.toBeNull();
      const decoded = getMintDecoder().decode(got!.data);
      expect(decoded.supply).toBe(5000n);
    });

    it("throws on missing account", () => {
      expect(() => svm.setMintSupply(MINT, 100n)).toThrow("not found");
    });

    it("throws on non-mint account", () => {
      svm.createAccount(MINT, 32, address(SYSTEM_PROGRAM_ID));
      expect(() => svm.setMintSupply(MINT, 100n)).toThrow("not a valid mint account");
    });

    it("throws on correct-length garbage data", () => {
      svm.setAccount({
        address: MINT,
        programAddress: address(SPL_TOKEN_PROGRAM_ID),
        lamports: lamports(1_000_000n),
        data: new Uint8Array(82),
        executable: false,
        space: 82n,
      });
      expect(() => svm.setMintSupply(MINT, 100n)).toThrow("not a valid mint account");
    });

    it("throws on token-2022 mint with extensions", () => {
      svm.setAccount({
        address: MINT,
        programAddress: address(SPL_TOKEN_2022_PROGRAM_ID),
        lamports: lamports(1_000_000n),
        data: new Uint8Array(120),
        executable: false,
        space: 120n,
      });
      expect(() => svm.setMintSupply(MINT, 100n)).toThrow("not a valid mint account");
    });
  });

  describe("warpToTimestamp", () => {
    it("does not corrupt state and survives execution", () => {
      svm.airdrop(ALICE, 2_000_000_000n);
      svm.airdrop(BOB, 0n);
      svm.warpToTimestamp(1_700_000_000n);

      const ix = getTransferSolInstruction({ source: aliceSigner, destination: BOB, amount: 100n });
      const result = svm.processInstruction(ix);

      result.assertSuccess();
      expect(svm.getBalance(ALICE)).toBe(2_000_000_000n - 100n);
      expect(svm.getBalance(BOB)).toBe(100n);
    });
  });

  describe("simulate (dry run, no state commit)", () => {
    it("simulateInstruction does not commit state changes", () => {
      svm.airdrop(ALICE, 2_000_000_000n);
      svm.airdrop(BOB, 1_000_000n);

      const ix = getTransferSolInstruction({ source: aliceSigner, destination: BOB, amount: 500_000_000n });
      const result = svm.simulateInstruction(ix);

      result.assertSuccess();
      expect(svm.getBalance(ALICE)).toBe(2_000_000_000n);
      expect(svm.getBalance(BOB)).toBe(1_000_000n);
    });

    it("simulateInstructionChain does not commit state changes", () => {
      svm.airdrop(ALICE, 2_000_000_000n);
      svm.airdrop(BOB, 1_000_000n);

      const ix1 = getTransferSolInstruction({ source: aliceSigner, destination: BOB, amount: 100_000_000n });
      const ix2 = getTransferSolInstruction({ source: aliceSigner, destination: BOB, amount: 200_000_000n });
      const result = svm.simulateInstructionChain([ix1, ix2]);

      result.assertSuccess();
      expect(svm.getBalance(ALICE)).toBe(2_000_000_000n);
      expect(svm.getBalance(BOB)).toBe(1_000_000n);
    });
  });

  describe("statefulness (SVM store used by processInstruction)", () => {
    it("SOL transfer using accounts from SVM store", () => {
      svm.airdrop(ALICE, 2_000_000_000n);
      svm.airdrop(BOB, 1_000_000n);

      const ix = getTransferSolInstruction({ source: aliceSigner, destination: BOB, amount: 500_000_000n });
      const result = svm.processInstruction(ix);

      result.assertSuccess();
      expect(svm.getBalance(ALICE)).toBe(1_500_000_000n);
      expect(svm.getBalance(BOB)).toBe(500_000_000n + 1_000_000n);
    });

    it("SPL token transfer using accounts from SVM store", () => {
      const ALICE_TOKEN = address("DjPi1LtwrXJMAYjR3G1mMQmjkRRjsFBacjJJm8JHHzNu");
      const BOB_TOKEN = address("HJiQv2jg8JZoNrREAfbS7nXHhR4hEMnqsYbBNpKXSGaC");

      const mint = createKeyedMintAccount(MINT, { mintAuthority: ALICE, supply: 10_000n, decimals: 6 });
      const aliceToken = createKeyedTokenAccount(ALICE_TOKEN, { mint: MINT, owner: ALICE, amount: 5_000n });
      const bobToken = createKeyedTokenAccount(BOB_TOKEN, { mint: MINT, owner: BOB, amount: 0n });
      svm.setAccount(mint).setAccount(aliceToken).setAccount(bobToken);

      const ix = getTransferInstruction({
        source: ALICE_TOKEN,
        destination: BOB_TOKEN,
        authority: aliceSigner,
        amount: 1_000n,
      });
      const result = svm.processInstruction(ix);

      result.assertSuccess();

      const aliceBalance = getTokenDecoder().decode(svm.getAccount(ALICE_TOKEN)!.data).amount;
      const bobBalance = getTokenDecoder().decode(svm.getAccount(BOB_TOKEN)!.data).amount;
      expect(aliceBalance).toBe(4_000n);
      expect(bobBalance).toBe(1_000n);
    });
  });
});
