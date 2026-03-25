import { describe, it, expect, beforeAll } from "vitest";
import {
  QuasarSvm,
  createMintAccount,
  createTokenAccount,
} from "@blueshift-gg/quasar-svm/web3.js";
import { Address, TransactionInstruction, AccountMeta } from "@solana/web3.js";

describe("Web3.js Layer - Token Tests", () => {
  let vm: QuasarSvm;

  beforeAll(() => {
    vm = new QuasarSvm(); // SPL programs loaded by default
  });

  it.skip("should transfer tokens", () => {
    const authority = Address.unique();

    const mintAddr = Address.unique();
    const mint = createMintAccount(mintAddr, {
      mintAuthority: authority,
      decimals: 6,
      supply: 10_000n,
    });

    const sourceAddr = Address.unique();
    const source = createTokenAccount(sourceAddr, {
      mint: mint.accountId,
      owner: authority,
      amount: 5_000n,
    });

    const destAddr = Address.unique();
    const dest = createTokenAccount(destAddr, {
      mint: mint.accountId,
      owner: authority,
      amount: 0n,
    });

    // TODO: Create transfer instruction
    // TODO: Execute instruction
    // TODO: Verify token balances
  });

  it.skip("should mint tokens", () => {
    const authority = Address.unique();

    const mintAddr = Address.unique();
    const mint = createMintAccount(mintAddr, {
      mintAuthority: authority,
      decimals: 6,
      supply: 0n,
    });

    const tokenAddr = Address.unique();
    const token = createTokenAccount(tokenAddr, {
      mint: mint.accountId,
      owner: authority,
      amount: 0n,
    });

    // TODO: Create mint instruction
    // TODO: Execute instruction
    // TODO: Verify token was minted
  });
});
