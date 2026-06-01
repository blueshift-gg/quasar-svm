import { Address } from "@solana/web3.js";
import type { TransactionInstruction } from "@solana/web3.js";
import type { KeyedAccountInfo } from "@solana/web3.js";
import type { Instruction } from "@solana/instructions";
import { isSignerRole, isWritableRole } from "@solana/instructions";

export type SupportedInstruction = TransactionInstruction | Instruction;

// ---------------------------------------------------------------------------
// Serialization (JS -> wire format)
// ---------------------------------------------------------------------------

export function serializeInstruction(ix: SupportedInstruction): Buffer {
  if (isWeb3Instruction(ix)) {
    return serializeWeb3Instruction(ix);
  }
  if (isKitInstruction(ix)) {
    return serializeKitInstruction(ix);
  }
  throw new TypeError("Unsupported instruction: expected Web3.js TransactionInstruction or Kit instruction.");
}

function isWeb3Instruction(ix: unknown): ix is TransactionInstruction {
  if (!ix || typeof ix !== "object") {
    return false;
  }

  const candidate = ix as Record<string, unknown>;

  if (!hasToBytes(candidate.programId) || !Array.isArray(candidate.keys) || !(candidate.data instanceof Uint8Array)) {
    return false;
  }

  for (const keyMeta of candidate.keys) {
    if (!keyMeta || typeof keyMeta !== "object") {
      return false;
    }

    const candidateKeyMeta = keyMeta as Record<string, unknown>;
    if (!hasToBytes(candidateKeyMeta.pubkey)) {
      return false;
    }
    if (typeof candidateKeyMeta.isSigner !== "boolean" || typeof candidateKeyMeta.isWritable !== "boolean") {
      return false;
    }
  }

  return true;
}

function isKitInstruction(ix: unknown): ix is Instruction {
  if (!ix || typeof ix !== "object") {
    return false;
  }

  const candidate = ix as Record<string, unknown>;
  if (typeof candidate.programAddress !== "string") {
    return false;
  }

  if (candidate.data !== undefined && !(candidate.data instanceof Uint8Array)) {
    return false;
  }

  if (candidate.accounts === undefined) {
    return true;
  }

  if (!Array.isArray(candidate.accounts)) {
    return false;
  }

  for (const accountMeta of candidate.accounts) {
    if (!accountMeta || typeof accountMeta !== "object") {
      return false;
    }

    const candidateAccountMeta = accountMeta as Record<string, unknown>;
    if (typeof candidateAccountMeta.address !== "string") {
      return false;
    }
    if (
      !("role" in candidateAccountMeta)
    ) {
      return false;
    }
  }

  return true;
}

function hasToBytes(value: unknown): value is { toBytes: () => Uint8Array } {
  return !!value && typeof value === "object" && typeof (value as { toBytes?: unknown }).toBytes === "function";
}

function serializeWeb3Instruction(ix: TransactionInstruction): Buffer {
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

function serializeKitInstruction(ix: Instruction): Buffer {
  const accounts = ix.accounts ?? [];
  const data = ix.data ?? new Uint8Array(0);
  const metaSize = accounts.length * 34;
  const buf = Buffer.alloc(32 + 4 + data.length + 4 + metaSize);
  let o = 0;

  buf.set(new Address(ix.programAddress).toBytes(), o);
  o += 32;
  buf.writeUInt32LE(data.length, o);
  o += 4;
  buf.set(data, o);
  o += data.length;
  buf.writeUInt32LE(accounts.length, o);
  o += 4;

  for (const m of accounts) {
    buf.set(new Address(m.address).toBytes(), o);
    o += 32;
    buf[o++] = isSignerRole(m.role) ? 1 : 0;
    buf[o++] = isWritableRole(m.role) ? 1 : 0;
  }
  return buf;
}

export function serializeInstructions(ixs: SupportedInstruction[]): Buffer {
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
