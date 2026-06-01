import { QuasarSvm, createKeyedMintAccount, createKeyedAssociatedTokenAccount } from "@blueshift-gg/quasar-svm/web3.js";
import { Keypair } from "@solana/web3.js";
import { createTransferInstruction } from "@solana/spl-token";
import { getTokenDecoder } from "@solana-program/token";

const vm = new QuasarSvm(); // Token program loaded by default

const randomAddress = async () => (await Keypair.generate()).address;

const authority = await randomAddress();
const recipient = await randomAddress();

const mint = createKeyedMintAccount(await randomAddress(), { decimals: 6, supply: 10_000n });
const alice = await createKeyedAssociatedTokenAccount(authority, mint.accountId, 5_000n);
const bob = await createKeyedAssociatedTokenAccount(recipient, mint.accountId, 0n);

const ix = createTransferInstruction(alice.accountId, bob.accountId, authority, 1_000n);

const result = vm.processInstruction(ix, [mint, alice, bob]);

result.assertSuccess();
console.log(result.account(bob.accountId, getTokenDecoder())?.amount); // 1000n