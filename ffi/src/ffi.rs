use std::os::raw::c_char;
use std::panic::AssertUnwindSafe;
use std::slice;

use crate::error::*;
use crate::wire;
use quasar_svm::loader_keys;
use quasar_svm::{Account, QuasarSvm};

// ---------------------------------------------------------------------------
// Error query
// ---------------------------------------------------------------------------

#[unsafe(no_mangle)]
pub extern "C" fn quasar_last_error() -> *const c_char {
    last_error_ptr()
}

// ---------------------------------------------------------------------------
// VM lifecycle
// ---------------------------------------------------------------------------

#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_new() -> *mut QuasarSvm {
    clear_last_error();
    match std::panic::catch_unwind(|| Box::into_raw(Box::new(QuasarSvm::new()))) {
        Ok(ptr) => ptr,
        Err(_) => {
            set_last_error("Panic during SVM creation");
            std::ptr::null_mut()
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_free(svm: *mut QuasarSvm) {
    if !svm.is_null() {
        unsafe {
            drop(Box::from_raw(svm));
        }
    }
}

// ---------------------------------------------------------------------------
// Program management
// ---------------------------------------------------------------------------

#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_add_program(
    svm: *mut QuasarSvm,
    program_id: *const [u8; 32],
    elf_data: *const u8,
    elf_len: u64,
    loader_version: u8,
) -> i32 {
    clear_last_error();
    if svm.is_null() || program_id.is_null() || elf_data.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    match std::panic::catch_unwind(AssertUnwindSafe(|| {
        let svm = unsafe { &*svm };
        let id = solana_pubkey::Pubkey::new_from_array(unsafe { *program_id });
        let elf = unsafe { slice::from_raw_parts(elf_data, elf_len as usize) };
        let loader_key = match loader_version {
            2 => &loader_keys::LOADER_V2,
            _ => &loader_keys::LOADER_V3,
        };
        svm.add_program(&id, loader_key, elf);
        QUASAR_OK
    })) {
        Ok(code) => code,
        Err(_) => {
            set_last_error("Panic while loading program");
            QUASAR_ERR_PROGRAM_LOAD
        }
    }
}

// ---------------------------------------------------------------------------
// Sysvar configuration
// ---------------------------------------------------------------------------

#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_set_clock(
    svm: *mut QuasarSvm,
    slot: u64,
    epoch_start_timestamp: i64,
    epoch: u64,
    leader_schedule_epoch: u64,
    unix_timestamp: i64,
) -> i32 {
    clear_last_error();
    if svm.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    let svm = unsafe { &mut *svm };
    svm.sysvars.clock = solana_clock::Clock {
        slot,
        epoch_start_timestamp,
        epoch,
        leader_schedule_epoch,
        unix_timestamp,
    };
    QUASAR_OK
}

#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_warp_to_slot(svm: *mut QuasarSvm, slot: u64) -> i32 {
    clear_last_error();
    if svm.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    let svm = unsafe { &mut *svm };
    svm.sysvars.warp_to_slot(slot);
    QUASAR_OK
}

#[allow(deprecated)]
#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_set_rent(svm: *mut QuasarSvm, lamports_per_byte_year: u64) -> i32 {
    clear_last_error();
    if svm.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    let svm = unsafe { &mut *svm };
    svm.sysvars.rent = solana_rent::Rent {
        lamports_per_byte_year,
        exemption_threshold: 1.0,
        burn_percent: 0,
    };
    QUASAR_OK
}

#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_set_epoch_schedule(
    svm: *mut QuasarSvm,
    slots_per_epoch: u64,
    leader_schedule_slot_offset: u64,
    warmup: bool,
    first_normal_epoch: u64,
    first_normal_slot: u64,
) -> i32 {
    clear_last_error();
    if svm.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    let svm = unsafe { &mut *svm };
    svm.sysvars.epoch_schedule = solana_epoch_schedule::EpochSchedule {
        slots_per_epoch,
        leader_schedule_slot_offset,
        warmup,
        first_normal_epoch,
        first_normal_slot,
    };
    QUASAR_OK
}

#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_set_compute_budget(svm: *mut QuasarSvm, max_units: u64) -> i32 {
    clear_last_error();
    if svm.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    let svm = unsafe { &mut *svm };
    svm.compute_budget.compute_unit_limit = max_units;
    QUASAR_OK
}

// ---------------------------------------------------------------------------
// Execution -- serialized bytes in, serialized bytes out
// ---------------------------------------------------------------------------

/// Execute multiple instructions as a single atomic transaction.
///
/// `instructions` / `instructions_len`: count-prefixed serialized instructions.
/// `accounts` / `accounts_len`: serialized accounts (wire format).
#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_process_transaction(
    svm: *mut QuasarSvm,
    instructions: *const u8,
    instructions_len: u64,
    accounts: *const u8,
    accounts_len: u64,
    result_out: *mut *mut u8,
    result_len_out: *mut u64,
) -> i32 {
    clear_last_error();
    if svm.is_null()
        || instructions.is_null()
        || accounts.is_null()
        || result_out.is_null()
        || result_len_out.is_null()
    {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    match std::panic::catch_unwind(AssertUnwindSafe(|| {
        let svm = unsafe { &mut *svm };
        let ix_bytes = unsafe { slice::from_raw_parts(instructions, instructions_len as usize) };
        let acct_bytes = unsafe { slice::from_raw_parts(accounts, accounts_len as usize) };

        let ixs = match wire::deserialize_instructions(ix_bytes) {
            Ok(v) => v,
            Err(e) => {
                set_last_error(format!("Invalid instructions data: {e}"));
                return QUASAR_ERR_EXECUTION;
            }
        };
        let accts = match wire::deserialize_accounts(acct_bytes) {
            Ok(a) => a,
            Err(e) => {
                set_last_error(format!("Invalid accounts data: {e}"));
                return QUASAR_ERR_EXECUTION;
            }
        };

        let svm_accounts: Vec<Account> = accts
            .into_iter()
            .map(|(pk, a)| Account::from_pair(pk, a))
            .collect();

        let exec_result = svm.process_instruction_chain(&ixs, &svm_accounts);
        write_result_out(result_out, result_len_out, &exec_result);
        QUASAR_OK
    })) {
        Ok(code) => code,
        Err(_) => {
            set_last_error("Panic during transaction execution");
            QUASAR_ERR_INTERNAL
        }
    }
}

// ---------------------------------------------------------------------------
// Result deallocation
// ---------------------------------------------------------------------------

/// Free a serialized result buffer previously returned by an execution function.
/// Both the pointer and the length from the execution call must be provided.
#[unsafe(no_mangle)]
pub extern "C" fn quasar_result_free(result: *mut u8, result_len: u64) {
    if !result.is_null() {
        unsafe {
            let slice = slice::from_raw_parts_mut(result, result_len as usize);
            drop(Box::from_raw(slice as *mut [u8]));
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn write_result_out(
    result_out: *mut *mut u8,
    result_len_out: *mut u64,
    exec_result: &quasar_svm::ExecutionResult,
) {
    let serialized = wire::serialize_result(exec_result);
    let len = serialized.len();
    let ptr = Box::into_raw(serialized) as *mut u8;
    unsafe {
        *result_out = ptr;
        *result_len_out = len as u64;
    }
}
