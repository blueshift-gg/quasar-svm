import { describe, expect, it } from "vitest";
import { address, getAddressDecoder } from "@solana/addresses";
import { AccountRole, type Instruction } from "@solana/instructions";
import { getTokenDecoder } from "@solana-program/token";
import {
  createKeyedAssociatedTokenAccount,
  createKeyedMintAccount,
  QuasarSvm,
  SPL_TOKEN_PROGRAM_ID,
} from "@blueshift-gg/quasar-svm/kit";

function testAddress(byte: number) {
  return getAddressDecoder().decode(new Uint8Array(32).fill(byte));
}

function transfer(source: ReturnType<typeof testAddress>, destination: ReturnType<typeof testAddress>, authority: ReturnType<typeof testAddress>, amount: bigint): Instruction {
  const data = new Uint8Array(9);
  data[0] = 3;
  new DataView(data.buffer).setBigUint64(1, amount, true);
  return {
    programAddress: address(SPL_TOKEN_PROGRAM_ID),
    accounts: [
      { address: source, role: AccountRole.WRITABLE },
      { address: destination, role: AccountRole.WRITABLE },
      { address: authority, role: AccountRole.READONLY_SIGNER },
    ],
    data,
  };
}

describe("runtime controls", () => {
  it("simulates without committing and warps the clock timestamp", async () => {
    using svm = new QuasarSvm();
    const authority = testAddress(1);
    const mint = createKeyedMintAccount(testAddress(2), { supply: 10_000n });
    const alice = await createKeyedAssociatedTokenAccount(
      authority,
      mint.address,
      5_000n,
    );
    const bob = await createKeyedAssociatedTokenAccount(
      testAddress(3),
      mint.address,
      0n,
    );

    svm
      .processInstruction(transfer(alice.address, bob.address, authority, 1_000n), [
        mint,
        alice,
        bob,
      ])
      .assertSuccess();

    const simulated = svm.simulateInstruction(
      transfer(alice.address, bob.address, authority, 1_000n),
      [],
    );
    simulated.assertSuccess();
    expect(simulated.account(bob.address, getTokenDecoder())?.amount).toBe(2_000n);

    const committed = svm.processInstruction(
      transfer(alice.address, bob.address, authority, 0n),
      [],
    );
    committed.assertSuccess();
    expect(committed.account(bob.address, getTokenDecoder())?.amount).toBe(1_000n);

    svm.setComputeBudget(1n);
    expect(
      svm.processInstruction(
        transfer(alice.address, bob.address, authority, 1n),
        [],
      ).status,
    ).toEqual({
      ok: false,
      error: { type: "Runtime", message: "ProgramFailedToComplete" },
    });

    svm.warpToTimestamp(42n);
  });
});
