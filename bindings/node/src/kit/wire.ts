import { getAddressDecoder, getAddressEncoder } from "@solana/addresses";
import type { Address } from "@solana/addresses";
import type { AccountMeta } from "@solana/instructions";
import { isSignerRole, isWritableRole } from "@solana/instructions";
import type { Instruction } from "@solana/instructions";
import type { Account } from "@solana/accounts";
import { lamports } from "@solana/rpc-types";

const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();

// ---------------------------------------------------------------------------
// Serialization (JS -> wire format)
// ---------------------------------------------------------------------------

export function serializeInstruction(ix: Instruction): Buffer {
  const accounts = (ix.accounts ?? []) as readonly AccountMeta[];
  const data = ix.data ?? new Uint8Array(0);
  const metaSize = accounts.length * 34;
  const buf = Buffer.alloc(32 + 4 + data.length + 4 + metaSize);
  let o = 0;

  buf.set(addressEncoder.encode(ix.programAddress), o);
  o += 32;
  buf.writeUInt32LE(data.length, o);
  o += 4;
  buf.set(data, o);
  o += data.length;
  buf.writeUInt32LE(accounts.length, o);
  o += 4;

  for (const m of accounts) {
    buf.set(addressEncoder.encode(m.address), o);
    o += 32;
    buf[o++] = isSignerRole(m.role) ? 1 : 0;
    buf[o++] = isWritableRole(m.role) ? 1 : 0;
  }
  return buf;
}

export function serializeInstructions(ixs: Instruction[]): Buffer {
  const parts = ixs.map(serializeInstruction);
  const total = 4 + parts.reduce((s, p) => s + p.length, 0);
  const buf = Buffer.alloc(total);
  let o = 0;
  buf.writeUInt32LE(ixs.length, o);
  o += 4;
  for (const p of parts) {
    p.copy(buf, o);
    o += p.length;
  }
  return buf;
}

export function serializeAccounts(accounts: Account<Uint8Array>[]): Buffer {
  let total = 4;
  for (const a of accounts) total += 32 + 32 + 8 + 4 + a.data.length + 1;

  const buf = Buffer.alloc(total);
  let o = 0;
  buf.writeUInt32LE(accounts.length, o);
  o += 4;

  for (const a of accounts) {
    buf.set(addressEncoder.encode(a.address), o);
    o += 32;
    buf.set(addressEncoder.encode(a.programAddress), o);
    o += 32;
    buf.writeBigUInt64LE(BigInt(a.lamports), o);
    o += 8;
    buf.writeUInt32LE(a.data.length, o);
    o += 4;
    buf.set(a.data, o);
    o += a.data.length;
    buf[o++] = a.executable ? 1 : 0;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Deserialization (wire format -> JS)
// ---------------------------------------------------------------------------

export function deserializeSingleAccount(buf: Buffer): Account<Uint8Array> {
  let o = 0;
  const address = addressDecoder.decode(buf.subarray(o, o + 32)) as Address;
  o += 32;
  const programAddress = addressDecoder.decode(buf.subarray(o, o + 32)) as Address;
  o += 32;
  const lamps = buf.readBigUInt64LE(o);
  o += 8;
  const dataLen = buf.readUInt32LE(o);
  o += 4;
  const data = new Uint8Array(buf.subarray(o, o + dataLen));
  o += dataLen;
  const executable = buf[o] !== 0;
  return {
    address,
    programAddress,
    lamports: lamports(lamps),
    data,
    executable,
    space: BigInt(dataLen),
  };
}
