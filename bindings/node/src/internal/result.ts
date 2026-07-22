import type { ExecutionStatus, ProgramError } from "../index.js";
import type { InternalAccount, InternalResult, TokenBalance, ExecutionTrace } from "./types.js";

function hexKey(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

export class ExecutionResultBase {
  readonly status: ExecutionStatus;
  readonly computeUnits: bigint;
  readonly executionTimeUs: bigint;
  readonly returnData: Uint8Array;
  readonly logs: string[];
  readonly preBalances: bigint[];
  readonly postBalances: bigint[];
  readonly preTokenBalances: TokenBalance[];
  readonly postTokenBalances: TokenBalance[];
  readonly executionTrace: ExecutionTrace;
  /** @internal */ protected readonly _accounts: InternalAccount[];
  /** @internal */ private readonly _index: Map<string, number>;

  constructor(data: InternalResult) {
    this.status = data.status;
    this.computeUnits = data.computeUnits;
    this.executionTimeUs = data.executionTimeUs;
    this.returnData = data.returnData;
    this.logs = data.logs;
    this.preBalances = data.preBalances;
    this.postBalances = data.postBalances;
    this.preTokenBalances = data.preTokenBalances;
    this.postTokenBalances = data.postTokenBalances;
    this.executionTrace = data.executionTrace;
    this._accounts = data.accounts;
    this._index = new Map();
    for (let i = 0; i < data.accounts.length; i++) {
      this._index.set(hexKey(data.accounts[i].address), i);
    }
  }

  isSuccess(): boolean {
    return this.status.ok;
  }

  isError(): boolean {
    return !this.status.ok;
  }

  assertSuccess(): void {
    if (!this.status.ok) {
      const err = this.status.error;
      throw new Error(
        `expected success, got ${err.type}: ${JSON.stringify(err)}\n\nLogs:\n${this.logs.join("\n")}`
      );
    }
  }

  assertError(expected: ProgramError): void {
    if (this.status.ok) {
      throw new Error(
        `expected error ${JSON.stringify(expected)}, but execution succeeded`
      );
    }
    const actual = this.status.error;
    if (actual.type !== expected.type) {
      throw new Error(
        `expected error ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
    if (
      "code" in expected &&
      "code" in actual &&
      actual.code !== expected.code
    ) {
      throw new Error(
        `expected error code ${expected.code}, got ${actual.code}`
      );
    }
    if (
      "message" in expected &&
      "message" in actual &&
      actual.message !== expected.message
    ) {
      throw new Error(
        `expected runtime error ${JSON.stringify(expected.message)}, got ${JSON.stringify(actual.message)}`
      );
    }
  }

  assertCustomError(code: number): void {
    this.assertError({ type: "Custom", code });
  }

  printLogs(): void {
    for (const log of this.logs) console.log(log);
  }

  /** @internal */ protected _findAccount(addressBytes: Uint8Array): InternalAccount | undefined {
    const idx = this._index.get(hexKey(addressBytes));
    return idx !== undefined ? this._accounts[idx] : undefined;
  }
}
