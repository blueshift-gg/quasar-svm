import { describe, it, expect, beforeAll } from "vitest";
import {
  QuasarSvm,
  createMintAccount,
  createTokenAccount,
} from "@blueshift-gg/quasar-svm/web3.js";
import { Address } from "@solana/web3.js";
import { QuasarEscrowClient } from "../quasar_escrow/web3";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadProgram(): Uint8Array {
  const programPath = path.join(__dirname, "..", "programs", "escrow.so");
  return new Uint8Array(readFileSync(programPath));
}

describe("Web3.js Layer - Escrow Program", () => {
  let vm: QuasarSvm;
  let client: QuasarEscrowClient;
  const SPL_TOKEN_PROGRAM = new Address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

  beforeAll(() => {
    vm = new QuasarSvm();
    client = new QuasarEscrowClient();

    // Load escrow program
    const elf = loadProgram();
    vm.addProgram(QuasarEscrowClient.programId, elf, 3);
  });

  describe("Make Instruction", () => {
    it("should create escrow with new token accounts", () => {
      const maker = Address.unique();
      const mintA = Address.unique();
      const mintB = Address.unique();

      // Create mint accounts
      const mintAAccount = createMintAccount(mintA, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const mintBAccount = createMintAccount(mintB, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      // Create maker's token accounts
      const makerTaA = Address.unique();
      const makerTaAAccount = createTokenAccount(makerTaA, {
        mint: mintA,
        owner: maker,
        amount: 500_000n,
      });

      const makerTaB = Address.unique();
      const makerTaBAccount = createTokenAccount(makerTaB, {
        mint: mintB,
        owner: maker,
        amount: 0n,
      });

      // Create vault token account
      const [escrow] = Address.findProgramAddressSync(
        [Buffer.from("escrow"), maker.toBytes()],
        QuasarEscrowClient.programId
      );
      const vaultTaA = Address.unique();
      const vaultTaAAccount = createTokenAccount(vaultTaA, {
        mint: mintA,
        owner: escrow,
        amount: 0n,
      });

      // Create make instruction
      const makeIx = client.createMakeInstruction({
        maker,
        mintA,
        mintB,
        makerTaA,
        makerTaB,
        vaultTaA,
        deposit: 100_000n,
        receive: 200_000n,
      });

      // Execute
      const result = vm.processInstruction(makeIx, [
        { accountId: maker, accountInfo: { lamports: 1_000_000_000n, data: Buffer.alloc(0), owner: new Address("11111111111111111111111111111111"), executable: false } },
        mintAAccount,
        mintBAccount,
        makerTaAAccount,
        makerTaBAccount,
        vaultTaAAccount,
      ]);

      expect(result.status.ok, `make failed:\n${result.logs.join("\n")}`).toBe(true);
    });

    it("should fail with wrong mint for maker_ta_b", () => {
      const maker = Address.unique();
      const mintA = Address.unique();
      const mintB = Address.unique();
      const wrongMint = Address.unique();

      const mintAAccount = createMintAccount(mintA, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const mintBAccount = createMintAccount(mintB, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const wrongMintAccount = createMintAccount(wrongMint, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const makerTaA = Address.unique();
      const makerTaAAccount = createTokenAccount(makerTaA, {
        mint: mintA,
        owner: maker,
        amount: 500_000n,
      });

      // Wrong mint for maker_ta_b
      const makerTaB = Address.unique();
      const makerTaBAccount = createTokenAccount(makerTaB, {
        mint: wrongMint,  // Should be mintB
        owner: maker,
        amount: 0n,
      });

      const [escrow] = Address.findProgramAddressSync(
        [Buffer.from("escrow"), maker.toBytes()],
        QuasarEscrowClient.programId
      );
      const vaultTaA = Address.unique();
      const vaultTaAAccount = createTokenAccount(vaultTaA, {
        mint: mintA,
        owner: escrow,
        amount: 0n,
      });

      const makeIx = client.createMakeInstruction({
        maker,
        mintA,
        mintB,
        makerTaA,
        makerTaB,
        vaultTaA,
        deposit: 100_000n,
        receive: 200_000n,
      });

      const result = vm.processInstruction(makeIx, [
        { accountId: maker, accountInfo: { lamports: 1_000_000_000n, data: Buffer.alloc(0), owner: new Address("11111111111111111111111111111111"), executable: false } },
        mintAAccount,
        mintBAccount,
        wrongMintAccount,
        makerTaAAccount,
        makerTaBAccount,
        vaultTaAAccount,
      ]);

      expect(result.status.ok).toBe(false);
    });

    it("should fail with wrong owner for maker_ta_b", () => {
      const maker = Address.unique();
      const wrongOwner = Address.unique();
      const mintA = Address.unique();
      const mintB = Address.unique();

      const mintAAccount = createMintAccount(mintA, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const mintBAccount = createMintAccount(mintB, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const makerTaA = Address.unique();
      const makerTaAAccount = createTokenAccount(makerTaA, {
        mint: mintA,
        owner: maker,
        amount: 500_000n,
      });

      // Wrong owner for maker_ta_b
      const makerTaB = Address.unique();
      const makerTaBAccount = createTokenAccount(makerTaB, {
        mint: mintB,
        owner: wrongOwner,  // Should be maker
        amount: 0n,
      });

      const [escrow] = Address.findProgramAddressSync(
        [Buffer.from("escrow"), maker.toBytes()],
        QuasarEscrowClient.programId
      );
      const vaultTaA = Address.unique();
      const vaultTaAAccount = createTokenAccount(vaultTaA, {
        mint: mintA,
        owner: escrow,
        amount: 0n,
      });

      const makeIx = client.createMakeInstruction({
        maker,
        mintA,
        mintB,
        makerTaA,
        makerTaB,
        vaultTaA,
        deposit: 100_000n,
        receive: 200_000n,
      });

      const result = vm.processInstruction(makeIx, [
        { accountId: maker, accountInfo: { lamports: 1_000_000_000n, data: Buffer.alloc(0), owner: new Address("11111111111111111111111111111111"), executable: false } },
        { accountId: wrongOwner, accountInfo: { lamports: 1_000_000_000n, data: Buffer.alloc(0), owner: new Address("11111111111111111111111111111111"), executable: false } },
        mintAAccount,
        mintBAccount,
        makerTaAAccount,
        makerTaBAccount,
        vaultTaAAccount,
      ]);

      expect(result.status.ok).toBe(false);
    });
  });

  describe("Take Instruction", () => {
    it("should allow taker to complete escrow", () => {
      const maker = Address.unique();
      const taker = Address.unique();
      const mintA = Address.unique();
      const mintB = Address.unique();

      // Setup mints
      const mintAAccount = createMintAccount(mintA, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const mintBAccount = createMintAccount(mintB, {
        mintAuthority: taker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      // Maker's token accounts
      const makerTaA = Address.unique();
      const makerTaAAccount = createTokenAccount(makerTaA, {
        mint: mintA,
        owner: maker,
        amount: 300_000n,  // After make
      });

      const makerTaB = Address.unique();
      const makerTaBAccount = createTokenAccount(makerTaB, {
        mint: mintB,
        owner: maker,
        amount: 0n,
      });

      // Taker's token accounts
      const takerTaA = Address.unique();
      const takerTaAAccount = createTokenAccount(takerTaA, {
        mint: mintA,
        owner: taker,
        amount: 0n,
      });

      const takerTaB = Address.unique();
      const takerTaBAccount = createTokenAccount(takerTaB, {
        mint: mintB,
        owner: taker,
        amount: 500_000n,
      });

      // Vault
      const [escrow] = Address.findProgramAddressSync(
        [Buffer.from("escrow"), maker.toBytes()],
        QuasarEscrowClient.programId
      );
      const vaultTaA = Address.unique();
      const vaultTaAAccount = createTokenAccount(vaultTaA, {
        mint: mintA,
        owner: escrow,
        amount: 100_000n,  // From make
      });

      const takeIx = client.createTakeInstruction({
        taker,
        maker,
        mintA,
        mintB,
        takerTaA,
        takerTaB,
        makerTaB,
        vaultTaA,
      });

      const result = vm.processInstruction(takeIx, [
        { accountId: taker, accountInfo: { lamports: 1_000_000_000n, data: Buffer.alloc(0), owner: new Address("11111111111111111111111111111111"), executable: false } },
        { accountId: maker, accountInfo: { lamports: 1_000_000_000n, data: Buffer.alloc(0), owner: new Address("11111111111111111111111111111111"), executable: false } },
        mintAAccount,
        mintBAccount,
        takerTaAAccount,
        takerTaBAccount,
        makerTaBAccount,
        vaultTaAAccount,
      ]);

      expect(result.status.ok, `take failed:\n${result.logs.join("\n")}`).toBe(true);
    });
  });

  describe("Refund Instruction", () => {
    it("should allow maker to refund escrow", () => {
      const maker = Address.unique();
      const mintA = Address.unique();
      const mintB = Address.unique();

      const mintAAccount = createMintAccount(mintA, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const makerTaA = Address.unique();
      const makerTaAAccount = createTokenAccount(makerTaA, {
        mint: mintA,
        owner: maker,
        amount: 300_000n,  // After make
      });

      const [escrow] = Address.findProgramAddressSync(
        [Buffer.from("escrow"), maker.toBytes()],
        QuasarEscrowClient.programId
      );
      const vaultTaA = Address.unique();
      const vaultTaAAccount = createTokenAccount(vaultTaA, {
        mint: mintA,
        owner: escrow,
        amount: 100_000n,  // From make
      });

      const refundIx = client.createRefundInstruction({
        maker,
        mintA,
        makerTaA,
        vaultTaA,
      });

      const result = vm.processInstruction(refundIx, [
        { accountId: maker, accountInfo: { lamports: 1_000_000_000n, data: Buffer.alloc(0), owner: new Address("11111111111111111111111111111111"), executable: false } },
        mintAAccount,
        makerTaAAccount,
        vaultTaAAccount,
      ]);

      expect(result.status.ok, `refund failed:\n${result.logs.join("\n")}`).toBe(true);
    });
  });
});
