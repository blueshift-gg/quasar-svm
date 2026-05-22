import { type TransactionInstruction, Address } from "@solana/web3.js";
import type { KeyedAccountInfo } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Serialization (JS -> wire format)
// ---------------------------------------------------------------------------

export function serializeInstruction(ix: TransactionInstruction): Buffer {
  const keys = ix.keys;
  const data = ix.data;
  const metaSize = keys.length * 34;
  const buf = Buffer.alloc(32 + 4 + data.length + 4 + metaSize);
  let o = 0;

  buf.set(ix.programId.toBytes(), o);
  o += 32;
  buf.writeUInt32LE(data.length, o);
  o += 4;
  buf.set(data, o);
  o += data.length;
  buf.writeUInt32LE(keys.length, o);
  o += 4;

  for (const m of keys) {
    buf.set(m.pubkey.toBytes(), o);
    o += 32;
    buf[o++] = m.isSigner ? 1 : 0;
    buf[o++] = m.isWritable ? 1 : 0;
  }
  return buf;
}

export function serializeInstructions(ixs: TransactionInstruction[]): Buffer {
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

export function serializeAccounts(accounts: KeyedAccountInfo[]): Buffer {
  let total = 4;
  for (const a of accounts) total += 32 + 32 + 8 + 4 + a.accountInfo.data.length + 1;

  const buf = Buffer.alloc(total);
  let o = 0;
  buf.writeUInt32LE(accounts.length, o);
  o += 4;

  for (const a of accounts) {
    buf.set(a.accountId.toBytes(), o);
    o += 32;
    buf.set(a.accountInfo.owner.toBytes(), o);
    o += 32;
    buf.writeBigUInt64LE(BigInt(a.accountInfo.lamports), o);
    o += 8;
    buf.writeUInt32LE(a.accountInfo.data.length, o);
    o += 4;
    buf.set(a.accountInfo.data, o);
    o += a.accountInfo.data.length;
    buf[o++] = a.accountInfo.executable ? 1 : 0;
  }
  return buf;
}
