import { describe, it, expect, beforeAll } from "vitest";
import {
  QuasarSvm,
  createKeyedMintAccount,
  createKeyedTokenAccount,
} from "@blueshift-gg/quasar-svm/kit";
import { generateKeyPair, getAddressFromPublicKey } from "@solana/keys";
import { getTransferInstruction, getMintToInstruction } from "@solana-program/token";

describe("Kit Layer - Token Tests", () => {
  let vm: QuasarSvm;

  beforeAll(() => {
    vm = new QuasarSvm(); // SPL programs loaded by default
  });

  it.skip("should transfer tokens", async () => {
    const authorityKp = await generateKeyPair();
    const authority = await getAddressFromPublicKey(authorityKp.publicKey);

    const mintAddr = await getAddressFromPublicKey(
      (await generateKeyPair()).publicKey
    );
    const mint = createKeyedMintAccount(mintAddr, {
      mintAuthority: authority,
      decimals: 6,
      supply: 10_000n,
    });

    const sourceAddr = await getAddressFromPublicKey(
      (await generateKeyPair()).publicKey
    );
    const source = createKeyedTokenAccount(sourceAddr, {
      mint: mint.address,
      owner: authority,
      amount: 5_000n,
    });

    const destAddr = await getAddressFromPublicKey(
      (await generateKeyPair()).publicKey
    );
    const dest = createKeyedTokenAccount(destAddr, {
      mint: mint.address,
      owner: authority,
      amount: 0n,
    });

    const ix = getTransferInstruction({
      source: source.address,
      destination: dest.address,
      authority,
      amount: 1_000n,
    });

    const result = vm.processInstruction(ix, [mint, source, dest]);

    result.assertSuccess();
    // TODO: Verify token balances changed correctly
  });

  it.skip("should mint tokens", async () => {
    const authorityKp = await generateKeyPair();
    const authority = await getAddressFromPublicKey(authorityKp.publicKey);

    const mintAddr = await getAddressFromPublicKey(
      (await generateKeyPair()).publicKey
    );
    const mint = createKeyedMintAccount(mintAddr, {
      mintAuthority: authority,
      decimals: 6,
      supply: 0n,
    });

    const tokenAddr = await getAddressFromPublicKey(
      (await generateKeyPair()).publicKey
    );
    const token = createKeyedTokenAccount(tokenAddr, {
      mint: mint.address,
      owner: authority,
      amount: 0n,
    });

    const ix = getMintToInstruction({
      mint: mint.address,
      token: token.address,
      mintAuthority: authority,
      amount: 1_000n,
    });

    const result = vm.processInstruction(ix, [mint, token]);

    result.assertSuccess();
    // TODO: Verify token was minted
  });
});
