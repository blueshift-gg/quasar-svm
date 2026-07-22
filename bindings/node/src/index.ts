// ---------------------------------------------------------------------------
// ProgramError — mirrors the Rust ProgramError enum
// ---------------------------------------------------------------------------

export type ProgramError =
  | { type: "InvalidArgument" }
  | { type: "InvalidInstructionData" }
  | { type: "InvalidAccountData" }
  | { type: "AccountDataTooSmall" }
  | { type: "InsufficientFunds" }
  | { type: "IncorrectProgramId" }
  | { type: "MissingRequiredSignature" }
  | { type: "AccountAlreadyInitialized" }
  | { type: "UninitializedAccount" }
  | { type: "MissingAccount" }
  | { type: "InvalidSeeds" }
  | { type: "ArithmeticOverflow" }
  | { type: "AccountNotRentExempt" }
  | { type: "InvalidAccountOwner" }
  | { type: "IncorrectAuthority" }
  | { type: "Immutable" }
  | { type: "BorshIoError" }
  | { type: "ComputeBudgetExceeded" }
  | { type: "Custom"; code: number }
  | { type: "Runtime"; message: string };

/** Map the stable FFI error discriminant into a ProgramError. */
export function programErrorFromStatus(
  status: number,
  errorMessage: string | null,
  customErrorCode = 0,
): ProgramError {
  switch (status) {
    case 1: return { type: "Custom", code: customErrorCode };
    case -1: return { type: "InvalidArgument" };
    case -2: return { type: "InvalidInstructionData" };
    case -3: return { type: "InvalidAccountData" };
    case -4: return { type: "AccountDataTooSmall" };
    case -5: return { type: "InsufficientFunds" };
    case -6: return { type: "IncorrectProgramId" };
    case -7: return { type: "MissingRequiredSignature" };
    case -8: return { type: "AccountAlreadyInitialized" };
    case -9: return { type: "UninitializedAccount" };
    case -10: return { type: "MissingAccount" };
    case -13: return { type: "InvalidSeeds" };
    case -14: return { type: "BorshIoError" };
    case -15: return { type: "AccountNotRentExempt" };
    case -21: return { type: "ComputeBudgetExceeded" };
    case -22: return { type: "InvalidAccountOwner" };
    case -23: return { type: "ArithmeticOverflow" };
    case -24: return { type: "Immutable" };
    case -25: return { type: "IncorrectAuthority" };
    case -26: return { type: "Runtime", message: errorMessage ?? "unknown error" };
    default: return { type: "Runtime", message: errorMessage ?? "unknown error" };
  }
}

// ---------------------------------------------------------------------------
// ExecutionStatus — discriminated union for pattern matching
// ---------------------------------------------------------------------------

export type ExecutionStatus =
  | { ok: true }
  | { ok: false; error: ProgramError };

// ---------------------------------------------------------------------------
// Sysvars
// ---------------------------------------------------------------------------

export interface Clock {
  slot: bigint;
  epochStartTimestamp: bigint;
  epoch: bigint;
  leaderScheduleEpoch: bigint;
  unixTimestamp: bigint;
}

export interface EpochSchedule {
  slotsPerEpoch: bigint;
  leaderScheduleSlotOffset: bigint;
  warmup: boolean;
  firstNormalEpoch: bigint;
  firstNormalSlot: bigint;
}

export type { QuasarSvmConfig } from "./base.js";
export { QUASAR_SVM_CONFIG_FULL } from "./base.js";
