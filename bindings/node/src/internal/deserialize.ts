import { programErrorFromStatus } from "../index.js";
import type { ExecutionStatus } from "../index.js";
import type { InternalAccount, InternalResult } from "./types.js";

function skipAccountFields(data: Buffer, o: number): number {
  o += 32; // owner
  o += 8;  // lamports
  const dLen = data.readUInt32LE(o);
  o += 4;
  o += dLen; // data
  o += 1;    // executable
  return o;
}

export function deserializeResult(data: Buffer): InternalResult {
  let o = 0;

  const rawStatus = data.readInt32LE(o); o += 4;
  const customErrorCode = data.readUInt32LE(o); o += 4;
  const computeUnits = data.readBigUInt64LE(o); o += 8;
  const executionTimeUs = data.readBigUInt64LE(o); o += 8;

  const rdLen = data.readUInt32LE(o); o += 4;
  const returnData = new Uint8Array(data.subarray(o, o + rdLen)); o += rdLen;

  const numAccts = data.readUInt32LE(o); o += 4;
  const accounts: InternalAccount[] = [];
  for (let i = 0; i < numAccts; i++) {
    const address = new Uint8Array(data.subarray(o, o + 32)); o += 32;
    const owner = new Uint8Array(data.subarray(o, o + 32)); o += 32;
    const lamports = data.readBigUInt64LE(o); o += 8;
    const dLen = data.readUInt32LE(o); o += 4;
    const acctData = new Uint8Array(data.subarray(o, o + dLen)); o += dLen;
    const executable = data[o++] !== 0;
    accounts.push({ address, owner, lamports, data: acctData, executable });
  }

  const numLogs = data.readUInt32LE(o); o += 4;
  const logs: string[] = [];
  for (let i = 0; i < numLogs; i++) {
    const lLen = data.readUInt32LE(o); o += 4;
    logs.push(data.subarray(o, o + lLen).toString("utf8"));
    o += lLen;
  }

  const emLen = data.readUInt32LE(o); o += 4;
  const errorMessage = emLen > 0 ? data.subarray(o, o + emLen).toString("utf8") : null;
  o += emLen;

  // RPC metadata: pre/post balances
  const numPreBalances = data.readUInt32LE(o); o += 4;
  const preBalances: bigint[] = [];
  for (let i = 0; i < numPreBalances; i++) {
    preBalances.push(data.readBigUInt64LE(o));
    o += 8;
  }

  const numPostBalances = data.readUInt32LE(o); o += 4;
  const postBalances: bigint[] = [];
  for (let i = 0; i < numPostBalances; i++) {
    postBalances.push(data.readBigUInt64LE(o));
    o += 8;
  }

  // Token balances (pre)
  const numPreTokenBalances = data.readUInt32LE(o); o += 4;
  const preTokenBalances = [];
  for (let i = 0; i < numPreTokenBalances; i++) {
    const accountIndex = data.readUInt32LE(o); o += 4;
    const mintLen = data.readUInt32LE(o); o += 4;
    const mint = data.subarray(o, o + mintLen).toString("utf8"); o += mintLen;
    const hasOwner = data[o++] !== 0;
    const owner = hasOwner ? (() => {
      const ownerLen = data.readUInt32LE(o); o += 4;
      const ownerStr = data.subarray(o, o + ownerLen).toString("utf8"); o += ownerLen;
      return ownerStr;
    })() : null;
    const decimals = data[o++];
    const amountLen = data.readUInt32LE(o); o += 4;
    const amount = data.subarray(o, o + amountLen).toString("utf8"); o += amountLen;
    const hasUiAmount = data[o++] !== 0;
    const uiAmount = hasUiAmount ? data.readDoubleLE(o) : null;
    if (hasUiAmount) o += 8;
    preTokenBalances.push({ accountIndex, mint, owner, uiTokenAmount: { uiAmount, decimals, amount } });
  }

  // Token balances (post)
  const numPostTokenBalances = data.readUInt32LE(o); o += 4;
  const postTokenBalances = [];
  for (let i = 0; i < numPostTokenBalances; i++) {
    const accountIndex = data.readUInt32LE(o); o += 4;
    const mintLen = data.readUInt32LE(o); o += 4;
    const mint = data.subarray(o, o + mintLen).toString("utf8"); o += mintLen;
    const hasOwner = data[o++] !== 0;
    const owner = hasOwner ? (() => {
      const ownerLen = data.readUInt32LE(o); o += 4;
      const ownerStr = data.subarray(o, o + ownerLen).toString("utf8"); o += ownerLen;
      return ownerStr;
    })() : null;
    const decimals = data[o++];
    const amountLen = data.readUInt32LE(o); o += 4;
    const amount = data.subarray(o, o + amountLen).toString("utf8"); o += amountLen;
    const hasUiAmount = data[o++] !== 0;
    const uiAmount = hasUiAmount ? data.readDoubleLE(o) : null;
    if (hasUiAmount) o += 8;
    postTokenBalances.push({ accountIndex, mint, owner, uiTokenAmount: { uiAmount, decimals, amount } });
  }

  // Execution trace (list of all executed instructions with full data, compute units, and results)
  const numInstructions = data.readUInt32LE(o); o += 4;
  const instructions = [];
  for (let i = 0; i < numInstructions; i++) {
    const stackDepth = data[o++];

    // Read full instruction data
    const programId = new Uint8Array(data.subarray(o, o + 32)); o += 32;
    const numAccounts = data.readUInt32LE(o); o += 4;
    const accounts = [];
    for (let j = 0; j < numAccounts; j++) {
      const pubkey = new Uint8Array(data.subarray(o, o + 32)); o += 32;
      const isSigner = data[o++] !== 0;
      const isWritable = data[o++] !== 0;
      accounts.push({ pubkey, isSigner, isWritable });
    }
    const dataLen = data.readUInt32LE(o); o += 4;
    const ixData = new Uint8Array(data.subarray(o, o + dataLen)); o += dataLen;

    // Read compute units and result
    const computeUnitsConsumed = data.readBigUInt64LE(o); o += 8;
    const result = data.readBigUInt64LE(o); o += 8;

    instructions.push({
      stackDepth,
      instruction: { programId, accounts, data: ixData },
      computeUnitsConsumed,
      result,
    });
  }
  const executionTrace = { instructions };

  const status: ExecutionStatus =
    rawStatus === 0
      ? { ok: true as const }
      : {
          ok: false as const,
          error: programErrorFromStatus(rawStatus, errorMessage, customErrorCode),
        };

  return {
    status,
    computeUnits,
    executionTimeUs,
    returnData,
    accounts,
    logs,
    preBalances,
    postBalances,
    preTokenBalances,
    postTokenBalances,
    executionTrace,
  };
}
