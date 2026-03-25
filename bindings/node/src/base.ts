import * as ffi from "./ffi.js";
import type { Clock, EpochSchedule } from "./index.js";

const cleanupRegistry = new FinalizationRegistry((ptr: unknown) => {
  ffi.quasar_svm_free(ptr);
});

export interface QuasarSvmConfig {
  /** Load SPL Token program (default: true) */
  token?: boolean;
  /** Load SPL Token-2022 program (default: true) */
  token2022?: boolean;
  /** Load SPL Associated Token Account program (default: true) */
  associatedToken?: boolean;
}

export const QUASAR_SVM_CONFIG_FULL: QuasarSvmConfig = {
  token: true,
  token2022: true,
  associatedToken: true
}

export abstract class QuasarSvmBase {
  protected ptr: unknown;
  private freed = false;

  constructor() {
    this.ptr = ffi.quasar_svm_new();
    if (!this.ptr) {
      throw new Error(
        `Failed to create QuasarSvm: ${ffi.quasar_last_error() ?? "unknown"}`
      );
    }
    cleanupRegistry.register(this, this.ptr, this);
  }

  free(): void {
    if (!this.freed) {
      cleanupRegistry.unregister(this);
      ffi.quasar_svm_free(this.ptr);
      this.freed = true;
    }
  }

  [Symbol.dispose](): void {
    this.free();
  }

  // ---------- Sysvars ----------

  setClock(opts: Clock): void {
    this.check(
      ffi.quasar_svm_set_clock(
        this.ptr,
        opts.slot,
        opts.epochStartTimestamp,
        opts.epoch,
        opts.leaderScheduleEpoch,
        opts.unixTimestamp
      )
    );
  }

  warpToSlot(slot: bigint): void {
    this.check(ffi.quasar_svm_warp_to_slot(this.ptr, slot));
  }

  warpToTimestamp(timestamp: bigint): void {
    this.check(ffi.quasar_svm_warp_to_timestamp(this.ptr, timestamp));
  }

  setRent(lamportsPerByte: bigint): void {
    this.check(ffi.quasar_svm_set_rent(this.ptr, lamportsPerByte));
  }

  setEpochSchedule(opts: EpochSchedule): void {
    this.check(
      ffi.quasar_svm_set_epoch_schedule(
        this.ptr,
        opts.slotsPerEpoch,
        opts.leaderScheduleSlotOffset,
        opts.warmup,
        opts.firstNormalEpoch,
        opts.firstNormalSlot
      )
    );
  }

  setComputeBudget(maxUnits: bigint): void {
    this.check(ffi.quasar_svm_set_compute_budget(this.ptr, maxUnits));
  }

  // ---------- Internal ----------

  protected check(code: number): void {
    if (code !== 0) {
      throw new Error(
        `QuasarSvm error (${code}): ${ffi.quasar_last_error() ?? "unknown"}`
      );
    }
  }

  protected execGetAccount(pubkeyBuf: Buffer): Buffer | null {
    const ptrOut = [null as unknown];
    const lenOut = [BigInt(0)];

    const code = ffi.quasar_svm_get_account(this.ptr, pubkeyBuf, ptrOut, lenOut);
    if (code === -4) return null; // QUASAR_ERR_EXECUTION = account not found
    this.check(code);

    const resultPtr = ptrOut[0];
    const resultLen = Number(lenOut[0]);
    const resultBuf = Buffer.from(
      ffi.koffi.decode(resultPtr, "uint8_t", resultLen)
    );

    ffi.quasar_result_free(resultPtr, resultLen);
    return resultBuf;
  }

  protected execRaw(fn: Function, ixBuf: Buffer, acctBuf: Buffer): Buffer {
    const ptrOut = [null as unknown];
    const lenOut = [BigInt(0)];

    const code = fn(
      this.ptr,
      ixBuf,
      ixBuf.length,
      acctBuf,
      acctBuf.length,
      ptrOut,
      lenOut
    );

    if (code !== 0) {
      throw new Error(
        `Execution error (${code}): ${ffi.quasar_last_error() ?? "unknown"}`
      );
    }

    const resultPtr = ptrOut[0];
    const resultLen = Number(lenOut[0]);
    const resultBuf = Buffer.from(
      ffi.koffi.decode(resultPtr, "uint8_t", resultLen)
    );

    ffi.quasar_result_free(resultPtr, resultLen);
    return resultBuf;
  }
}
