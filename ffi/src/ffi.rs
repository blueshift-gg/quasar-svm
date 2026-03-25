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

#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_warp_to_timestamp(svm: *mut QuasarSvm, timestamp: i64) -> i32 {
    clear_last_error();
    if svm.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    let svm = unsafe { &mut *svm };
    svm.warp_to_timestamp(timestamp);
    QUASAR_OK
}

// ---------------------------------------------------------------------------
// Account state management
// ---------------------------------------------------------------------------

/// Store an account in the SVM's account database.
/// `acct_bytes` / `acct_len`: count-prefixed serialized accounts (wire format).
#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_set_account(
    svm: *mut QuasarSvm,
    acct_bytes: *const u8,
    acct_len: u64,
) -> i32 {
    clear_last_error();
    if svm.is_null() || acct_bytes.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    match std::panic::catch_unwind(AssertUnwindSafe(|| {
        let svm = unsafe { &mut *svm };
        let bytes = unsafe { slice::from_raw_parts(acct_bytes, acct_len as usize) };
        let accts = match wire::deserialize_accounts(bytes) {
            Ok(a) => a,
            Err(e) => {
                set_last_error(format!("Invalid account data: {e}"));
                return QUASAR_ERR_EXECUTION;
            }
        };
        for (pk, a) in accts {
            svm.set_account(Account::from_pair(pk, a));
        }
        QUASAR_OK
    })) {
        Ok(code) => code,
        Err(_) => {
            set_last_error("Panic during set_account");
            QUASAR_ERR_INTERNAL
        }
    }
}

/// Read an account from the SVM's account database.
/// On success, writes a serialized account (no count prefix) to `result_out` / `result_len_out`.
/// Caller must free via `quasar_result_free`.
#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_get_account(
    svm: *mut QuasarSvm,
    pubkey: *const [u8; 32],
    result_out: *mut *mut u8,
    result_len_out: *mut u64,
) -> i32 {
    clear_last_error();
    if svm.is_null() || pubkey.is_null() || result_out.is_null() || result_len_out.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    match std::panic::catch_unwind(AssertUnwindSafe(|| {
        let svm = unsafe { &*svm };
        let pk = solana_pubkey::Pubkey::new_from_array(unsafe { *pubkey });
        match svm.get_account(&pk) {
            Some(account) => {
                let (pk, solana_acct) = account.to_pair();
                let serialized = wire::serialize_account(&pk, &solana_acct);
                let len = serialized.len();
                let ptr = Box::into_raw(serialized) as *mut u8;
                unsafe {
                    *result_out = ptr;
                    *result_len_out = len as u64;
                }
                QUASAR_OK
            }
            None => {
                set_last_error(format!("Account {pk} not found"));
                QUASAR_ERR_EXECUTION
            }
        }
    })) {
        Ok(code) => code,
        Err(_) => {
            set_last_error("Panic during get_account");
            QUASAR_ERR_INTERNAL
        }
    }
}

// Simple field operations — infallible, no catch_unwind needed.

/// Airdrop lamports to an account, creating it if it doesn't exist.
#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_airdrop(
    svm: *mut QuasarSvm,
    pubkey: *const [u8; 32],
    lamports: u64,
) -> i32 {
    clear_last_error();
    if svm.is_null() || pubkey.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    let svm = unsafe { &mut *svm };
    let pk = solana_pubkey::Pubkey::new_from_array(unsafe { *pubkey });
    svm.airdrop(&pk, lamports);
    QUASAR_OK
}

/// Get the lamport balance of an account. Writes 0 if the account doesn't exist.
#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_get_balance(
    svm: *mut QuasarSvm,
    pubkey: *const [u8; 32],
    out_lamports: *mut u64,
) -> i32 {
    clear_last_error();
    if svm.is_null() || pubkey.is_null() || out_lamports.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    let svm = unsafe { &*svm };
    let pk = solana_pubkey::Pubkey::new_from_array(unsafe { *pubkey });
    let balance = svm.get_account(&pk).map_or(0, |a| a.lamports);
    unsafe { *out_lamports = balance };
    QUASAR_OK
}

/// Create a rent-exempt account with the given space and owner.
#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_create_account(
    svm: *mut QuasarSvm,
    pubkey: *const [u8; 32],
    space: u64,
    owner: *const [u8; 32],
) -> i32 {
    clear_last_error();
    if svm.is_null() || pubkey.is_null() || owner.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    let svm = unsafe { &mut *svm };
    let pk = solana_pubkey::Pubkey::new_from_array(unsafe { *pubkey });
    let own = solana_pubkey::Pubkey::new_from_array(unsafe { *owner });
    svm.create_account(&pk, space as usize, &own);
    QUASAR_OK
}

/// Set the token balance of an existing SPL Token account.
/// Note: the underlying Rust method panics on invalid accounts — callers must
/// ensure the account exists and is a valid SPL Token account before calling.
#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_set_token_balance(
    svm: *mut QuasarSvm,
    pubkey: *const [u8; 32],
    amount: u64,
) -> i32 {
    clear_last_error();
    if svm.is_null() || pubkey.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    let svm = unsafe { &mut *svm };
    let pk = solana_pubkey::Pubkey::new_from_array(unsafe { *pubkey });
    svm.set_token_balance(&pk, amount);
    QUASAR_OK
}

/// Set the supply of an existing SPL Mint account.
/// Note: the underlying Rust method panics on invalid accounts — callers must
/// ensure the account exists and is a valid SPL Mint account before calling.
#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_set_mint_supply(
    svm: *mut QuasarSvm,
    pubkey: *const [u8; 32],
    supply: u64,
) -> i32 {
    clear_last_error();
    if svm.is_null() || pubkey.is_null() {
        set_last_error("Null pointer argument");
        return QUASAR_ERR_NULL_POINTER;
    }
    let svm = unsafe { &mut *svm };
    let pk = solana_pubkey::Pubkey::new_from_array(unsafe { *pubkey });
    svm.set_mint_supply(&pk, supply);
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
    execute_transaction(
        svm,
        instructions,
        instructions_len,
        accounts,
        accounts_len,
        result_out,
        result_len_out,
        true,
    )
}

/// Execute multiple instructions without committing state changes (dry run).
#[unsafe(no_mangle)]
pub extern "C" fn quasar_svm_simulate_transaction(
    svm: *mut QuasarSvm,
    instructions: *const u8,
    instructions_len: u64,
    accounts: *const u8,
    accounts_len: u64,
    result_out: *mut *mut u8,
    result_len_out: *mut u64,
) -> i32 {
    execute_transaction(
        svm,
        instructions,
        instructions_len,
        accounts,
        accounts_len,
        result_out,
        result_len_out,
        false,
    )
}

#[allow(clippy::too_many_arguments)]
fn execute_transaction(
    svm: *mut QuasarSvm,
    instructions: *const u8,
    instructions_len: u64,
    accounts: *const u8,
    accounts_len: u64,
    result_out: *mut *mut u8,
    result_len_out: *mut u64,
    commit: bool,
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

        let exec_result = if commit {
            svm.process_instruction_chain(&ixs, &svm_accounts)
        } else {
            svm.simulate_instruction_chain(&ixs, &svm_accounts)
        };
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
