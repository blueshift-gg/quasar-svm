import { describe, it, expect, beforeAll } from "vitest";
import {
  QuasarSvm,
  createKeyedMintAccount,
  createKeyedTokenAccount,
  createKeyedSystemAccount,
} from "@blueshift-gg/quasar-svm/kit";
import { generateKeyPair, getAddressFromPublicKey } from "@solana/keys";
import { QuasarEscrowClient } from "../quasar_escrow/kit";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import type { Address } from "@solana/addresses";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadProgram(): Uint8Array {
  const programPath = path.join(__dirname, "..", "programs", "escrow.so");
  return new Uint8Array(readFileSync(programPath));
}

describe("Kit Layer - Escrow Program", () => {
  let vm: QuasarSvm;
  let client: QuasarEscrowClient;

  beforeAll(() => {
    vm = new QuasarSvm();
    client = new QuasarEscrowClient();

    // Load escrow program
    const elf = loadProgram();
    vm.addProgram(QuasarEscrowClient.PROGRAM_ADDRESS, elf, 3);
  });

  describe("Make Instruction", () => {
    it("should create escrow with new token accounts", async () => {
      const maker = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const mintA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const mintB = await getAddressFromPublicKey((await generateKeyPair()).publicKey);

      // Create mint accounts
      const mintAAccount = createKeyedMintAccount(mintA, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const mintBAccount = createKeyedMintAccount(mintB, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      // Create maker's token accounts
      const makerTaA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const makerTaAAccount = createKeyedTokenAccount(makerTaA, {
        mint: mintA,
        owner: maker,
        amount: 500_000n,
      });

      const makerTaB = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const makerTaBAccount = createKeyedTokenAccount(makerTaB, {
        mint: mintB,
        owner: maker,
        amount: 0n,
      });

      // Create vault token account
      const [escrow] = await client.deriveEscrowAddress(maker);
      const vaultTaA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const vaultTaAAccount = createKeyedTokenAccount(vaultTaA, {
        mint: mintA,
        owner: escrow,
        amount: 0n,
      });

      // Create make instruction
      const makeIx = await client.createMakeInstruction({
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
        createKeyedSystemAccount(maker, 1_000_000_000n),
        mintAAccount,
        mintBAccount,
        makerTaAAccount,
        makerTaBAccount,
        vaultTaAAccount,
      ]);

      result.assertSuccess();
    });

    it("should fail with wrong mint for maker_ta_b", async () => {
      const maker = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const mintA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const mintB = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const wrongMint = await getAddressFromPublicKey((await generateKeyPair()).publicKey);

      const mintAAccount = createKeyedMintAccount(mintA, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const mintBAccount = createKeyedMintAccount(mintB, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const wrongMintAccount = createKeyedMintAccount(wrongMint, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const makerTaA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const makerTaAAccount = createKeyedTokenAccount(makerTaA, {
        mint: mintA,
        owner: maker,
        amount: 500_000n,
      });

      // Wrong mint for maker_ta_b
      const makerTaB = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const makerTaBAccount = createKeyedTokenAccount(makerTaB, {
        mint: wrongMint,  // Should be mintB
        owner: maker,
        amount: 0n,
      });

      const [escrow] = await client.deriveEscrowAddress(maker);
      const vaultTaA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const vaultTaAAccount = createKeyedTokenAccount(vaultTaA, {
        mint: mintA,
        owner: escrow,
        amount: 0n,
      });

      const makeIx = await client.createMakeInstruction({
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
        createKeyedSystemAccount(maker, 1_000_000_000n),
        mintAAccount,
        mintBAccount,
        wrongMintAccount,
        makerTaAAccount,
        makerTaBAccount,
        vaultTaAAccount,
      ]);

      result.assertError();
    });

    it("should fail with wrong owner for maker_ta_b", async () => {
      const maker = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const wrongOwner = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const mintA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const mintB = await getAddressFromPublicKey((await generateKeyPair()).publicKey);

      const mintAAccount = createKeyedMintAccount(mintA, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const mintBAccount = createKeyedMintAccount(mintB, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const makerTaA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const makerTaAAccount = createKeyedTokenAccount(makerTaA, {
        mint: mintA,
        owner: maker,
        amount: 500_000n,
      });

      // Wrong owner for maker_ta_b
      const makerTaB = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const makerTaBAccount = createKeyedTokenAccount(makerTaB, {
        mint: mintB,
        owner: wrongOwner,  // Should be maker
        amount: 0n,
      });

      const [escrow] = await client.deriveEscrowAddress(maker);
      const vaultTaA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const vaultTaAAccount = createKeyedTokenAccount(vaultTaA, {
        mint: mintA,
        owner: escrow,
        amount: 0n,
      });

      const makeIx = await client.createMakeInstruction({
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
        createKeyedSystemAccount(maker, 1_000_000_000n),
        createKeyedSystemAccount(wrongOwner, 1_000_000_000n),
        mintAAccount,
        mintBAccount,
        makerTaAAccount,
        makerTaBAccount,
        vaultTaAAccount,
      ]);

      result.assertError();
    });
  });

  describe("Take Instruction", () => {
    it("should allow taker to complete escrow", async () => {
      const maker = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const taker = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const mintA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const mintB = await getAddressFromPublicKey((await generateKeyPair()).publicKey);

      // Setup mints
      const mintAAccount = createKeyedMintAccount(mintA, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const mintBAccount = createKeyedMintAccount(mintB, {
        mintAuthority: taker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      // Maker's token accounts
      const makerTaA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const makerTaAAccount = createKeyedTokenAccount(makerTaA, {
        mint: mintA,
        owner: maker,
        amount: 300_000n,  // After make
      });

      const makerTaB = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const makerTaBAccount = createKeyedTokenAccount(makerTaB, {
        mint: mintB,
        owner: maker,
        amount: 0n,
      });

      // Taker's token accounts
      const takerTaA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const takerTaAAccount = createKeyedTokenAccount(takerTaA, {
        mint: mintA,
        owner: taker,
        amount: 0n,
      });

      const takerTaB = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const takerTaBAccount = createKeyedTokenAccount(takerTaB, {
        mint: mintB,
        owner: taker,
        amount: 500_000n,
      });

      // Vault
      const [escrow] = await client.deriveEscrowAddress(maker);
      const vaultTaA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const vaultTaAAccount = createKeyedTokenAccount(vaultTaA, {
        mint: mintA,
        owner: escrow,
        amount: 100_000n,  // From make
      });

      const takeIx = await client.createTakeInstruction({
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
        createKeyedSystemAccount(taker, 1_000_000_000n),
        createKeyedSystemAccount(maker, 1_000_000_000n),
        mintAAccount,
        mintBAccount,
        takerTaAAccount,
        takerTaBAccount,
        makerTaBAccount,
        vaultTaAAccount,
      ]);

      result.assertSuccess();
    });
  });

  describe("Refund Instruction", () => {
    it("should allow maker to refund escrow", async () => {
      const maker = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const mintA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);

      const mintAAccount = createKeyedMintAccount(mintA, {
        mintAuthority: maker,
        decimals: 9,
        supply: 1_000_000_000n,
      });

      const makerTaA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const makerTaAAccount = createKeyedTokenAccount(makerTaA, {
        mint: mintA,
        owner: maker,
        amount: 300_000n,  // After make
      });

      const [escrow] = await client.deriveEscrowAddress(maker);
      const vaultTaA = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
      const vaultTaAAccount = createKeyedTokenAccount(vaultTaA, {
        mint: mintA,
        owner: escrow,
        amount: 100_000n,  // From make
      });

      const refundIx = await client.createRefundInstruction({
        maker,
        mintA,
        makerTaA,
        vaultTaA,
      });

      const result = vm.processInstruction(refundIx, [
        createKeyedSystemAccount(maker, 1_000_000_000n),
        mintAAccount,
        makerTaAAccount,
        vaultTaAAccount,
      ]);

      result.assertSuccess();
    });
  });
});
