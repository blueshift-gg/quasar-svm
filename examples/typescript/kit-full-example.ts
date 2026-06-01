import {
  QuasarSvm,
  createKeyedMintAccount, createKeyedAssociatedTokenAccount,
} from "@blueshift-gg/quasar-svm/kit";
import { getAddressFromPublicKey } from "@solana/addresses";
import { generateKeyPair } from "@solana/keys";
import { createSignerFromKeyPair } from "@solana/signers";
import { getTokenDecoder, getTransferInstruction } from "@solana-program/token";

const vm = new QuasarSvm(); // SPL programs loaded by default
const randomAddress = async () => getAddressFromPublicKey((await generateKeyPair()).publicKey);

const authorityKp = await generateKeyPair();
const authority = await createSignerFromKeyPair(authorityKp);

const mint = createKeyedMintAccount(await randomAddress(), { decimals: 6, supply: 10_000n });
const alice = await createKeyedAssociatedTokenAccount(authority.address, mint.address, 5_000n);
const bob = await createKeyedAssociatedTokenAccount(await randomAddress(), mint.address, 0n);

const ix = getTransferInstruction({
  source: alice.address,
  destination: bob.address,
  authority,
  amount: 1_000n,
});

const result = vm.processInstruction(ix, [mint, alice, bob]);

result.assertSuccess();
console.log(result.account(bob.address, getTokenDecoder())?.amount); // 1000n
console.log(result.account(alice.address, getTokenDecoder())?.amount); // 4000n