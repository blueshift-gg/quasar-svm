import {
	createKeyedAssociatedTokenAccount,
	createKeyedMintAccount,
	QuasarSvm,
} from "@blueshift-gg/quasar-svm/web3.js";
import { Keypair } from "@solana/web3.js";
import { getTokenDecoder, getTransferInstruction } from "@solana-program/token";

const vm = new QuasarSvm(); // SPL programs loaded by default

const authority = await Keypair.generate();
const recipient = (await Keypair.generate()).publicKey;

const mint = createKeyedMintAccount((await Keypair.generate()).publicKey, {
	decimals: 6,
	supply: 10_000n,
});
const alice = await createKeyedAssociatedTokenAccount(
	authority.publicKey,
	mint.accountId,
	5_000n,
);
const bob = await createKeyedAssociatedTokenAccount(
	recipient,
	mint.accountId,
	0n,
);

const ix = getTransferInstruction({
	source: alice.accountId.toBase58(),
	destination: bob.accountId.toBase58(),
	authority,
	amount: 1_000n,
});

const result = vm.processInstruction(ix, [mint, alice, bob]);

result.assertSuccess();
console.log(result.account(bob.accountId, getTokenDecoder())?.amount); // 1000n
