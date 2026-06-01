import { describe, expect, it } from "vitest";
import { address as kitAddress } from "@solana/addresses";
import type { Instruction } from "@solana/instructions";
import { AccountRole } from "@solana/instructions";
import { Address, TransactionInstruction } from "@solana/web3.js";
import { serializeInstruction } from "../bindings/node/src/web3.js/wire.js";
import type { SupportedInstruction } from "../bindings/node/src/web3.js/wire.js";

type DecodedAccountMeta = {
  pubkey: Buffer;
  isSigner: number;
  isWritable: number;
};

type DecodedInstruction = {
  programId: Buffer;
  data: Buffer;
  accounts: DecodedAccountMeta[];
};

function decodeInstructionWire(serialized: Buffer): DecodedInstruction {
  let o = 0;

  const programId = serialized.subarray(o, o + 32);
  o += 32;

  const dataLen = serialized.readUInt32LE(o);
  o += 4;
  const data = serialized.subarray(o, o + dataLen);
  o += dataLen;

  const accountCount = serialized.readUInt32LE(o);
  o += 4;

  const accounts: DecodedAccountMeta[] = [];
  for (let i = 0; i < accountCount; i++) {
    const pubkey = serialized.subarray(o, o + 32);
    o += 32;
    const isSigner = serialized[o++];
    const isWritable = serialized[o++];
    accounts.push({ pubkey, isSigner, isWritable });
  }

  return { programId, data, accounts };
}

describe("web3 wire serialization", () => {
  it("serializes a valid web3 instruction", () => {
    const ix = new TransactionInstruction({
      programId: new Address("11111111111111111111111111111111"),
      keys: [
        {
          pubkey: new Address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          isSigner: true,
          isWritable: false,
        },
      ],
      data: new Uint8Array([1, 2]),
    });

    const serialized = serializeInstruction(ix);
    const decoded = decodeInstructionWire(serialized);

    expect(decoded.programId).toEqual(Buffer.from(ix.programId.toBytes()));
    expect(decoded.data).toEqual(Buffer.from(ix.data));
    expect(decoded.accounts).toHaveLength(1);
    expect(decoded.accounts[0].pubkey).toEqual(Buffer.from(ix.keys[0].pubkey.toBytes()));
    expect(decoded.accounts[0].isSigner).toBe(1);
    expect(decoded.accounts[0].isWritable).toBe(0);
  });

  it("serializes a valid kit instruction with accounts and data", () => {
    const data = new Uint8Array([9, 8, 7]);
    const accountAddress = kitAddress("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

    const ix: Instruction = {
      programAddress: kitAddress("11111111111111111111111111111111"),
      accounts: [
        {
          address: accountAddress,
          role: AccountRole.WRITABLE_SIGNER,
        },
      ],
      data,
    };

    const serialized = serializeInstruction(ix);
    const decoded = decodeInstructionWire(serialized);

    expect(decoded.programId).toEqual(Buffer.from(new Address(ix.programAddress).toBytes()));
    expect(decoded.data).toEqual(Buffer.from(data));
    expect(decoded.accounts).toHaveLength(1);
    expect(decoded.accounts[0].pubkey).toEqual(Buffer.from(new Address(accountAddress).toBytes()));
    expect(decoded.accounts[0].isSigner).toBe(1);
    expect(decoded.accounts[0].isWritable).toBe(1);
  });

  it("serializes a kit instruction when accounts and data are omitted", () => {
    const ix: Instruction = {
      programAddress: kitAddress("11111111111111111111111111111111"),
    };

    const serialized = serializeInstruction(ix);
    const decoded = decodeInstructionWire(serialized);

    expect(decoded.programId).toEqual(Buffer.from(new Address(ix.programAddress).toBytes()));
    expect(decoded.data).toEqual(Buffer.alloc(0));
    expect(decoded.accounts).toHaveLength(0);
  });

  it("throws for unsupported instruction shapes", () => {
    expect(() => serializeInstruction({} as unknown as SupportedInstruction)).toThrow(
      /Unsupported instruction: expected Web3\.js TransactionInstruction or Kit instruction\./
    );
  });
});
