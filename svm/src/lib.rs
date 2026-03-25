mod error;
mod program_cache;
mod svm;
mod sysvars;
pub mod token;

pub use solana_clock::Clock;
pub use solana_instruction::{AccountMeta, Instruction};
pub use solana_instruction_error::InstructionError;
pub use solana_address::Address;
pub use solana_rent::Rent;
pub use solana_sdk_ids;

/// Convenience alias so users can write `quasar_svm::system_program::ID`.
pub use solana_sdk_ids::system_program;

pub use crate::error::ProgramError;
pub use crate::program_cache::loader_keys;
pub use crate::svm::{
    ExecutedInstruction, ExecutionResult, ExecutionTrace, QuasarSvm, QuasarSvmConfig,
};
pub use crate::sysvars::Sysvars;
pub use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    pub address: Address,
    pub lamports: u64,
    pub data: Vec<u8>,
    pub owner: Address,
    pub executable: bool,
}

impl Account {
    pub fn from_pair(address: Address, account: solana_account::Account) -> Self {
        Self {
            address,
            lamports: account.lamports,
            data: account.data,
            owner: account.owner,
            executable: account.executable,
        }
    }

    pub fn to_pair(&self) -> (Address, solana_account::Account) {
        (
            self.address,
            solana_account::Account {
                lamports: self.lamports,
                data: self.data.clone(),
                owner: self.owner,
                executable: self.executable,
                rent_epoch: 0,
            },
        )
    }
}

// ---------------------------------------------------------------------------
// AccountDiff
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountDiff {
    pub address: Address,
    pub pre: Account,
    pub post: Account,
}

// ---------------------------------------------------------------------------
// Bundled SPL programs
// ---------------------------------------------------------------------------

pub const SPL_TOKEN_PROGRAM_ID: Address =
    solana_address::address!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

pub const SPL_TOKEN_2022_PROGRAM_ID: Address =
    solana_address::address!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

pub const SPL_ASSOCIATED_TOKEN_PROGRAM_ID: Address =
    solana_address::address!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// ---------------------------------------------------------------------------
// Builder-style helpers on QuasarSvm
// ---------------------------------------------------------------------------

impl QuasarSvm {
    /// Load a BPF program from an ELF byte slice (loader v3 / upgradeable).
    pub fn with_program(self, program_id: &Address, elf: &[u8]) -> Self {
        self.add_program(program_id, &loader_keys::LOADER_V3, elf);
        self
    }

    /// Load a BPF program with a specific loader version.
    pub fn with_program_loader(self, program_id: &Address, loader: &Address, elf: &[u8]) -> Self {
        self.add_program(program_id, loader, elf);
        self
    }

    /// Load the bundled SPL Token program.
    pub fn with_token_program(self) -> Self {
        let elf = include_bytes!("../programs/spl_token.so");
        self.with_program_loader(&SPL_TOKEN_PROGRAM_ID, &loader_keys::LOADER_V2, elf)
    }

    /// Load the bundled SPL Token 2022 program.
    pub fn with_token_2022_program(self) -> Self {
        let elf = include_bytes!("../programs/spl_token_2022.so");
        self.with_program(&SPL_TOKEN_2022_PROGRAM_ID, elf)
    }

    /// Load the bundled SPL Associated Token program.
    pub fn with_associated_token_program(self) -> Self {
        let elf = include_bytes!("../programs/spl_associated_token.so");
        self.with_program_loader(
            &SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
            &loader_keys::LOADER_V2,
            elf,
        )
    }

    /// Pre-populate an account in the SVM's account database.
    pub fn with_account(mut self, address: Address, account: solana_account::Account) -> Self {
        self.set_account(address, account);
        self
    }

    /// Set the clock slot (convenience for `sysvars.warp_to_slot`).
    pub fn with_slot(mut self, slot: u64) -> Self {
        self.sysvars.warp_to_slot(slot);
        self
    }

    /// Set the compute budget (builder-style).
    pub fn with_compute_budget(mut self, max_units: u64) -> Self {
        self.compute_budget.compute_unit_limit = max_units;
        self
    }

    /// Give lamports to an account (builder-style).
    pub fn with_airdrop(mut self, address: &Address, lamports: u64) -> Self {
        self.airdrop(address, lamports);
        self
    }

    /// Create a rent-exempt account (builder-style).
    pub fn with_create_account(mut self, address: &Address, space: usize, owner: &Address) -> Self {
        self.create_account(address, space, owner);
        self
    }
}

// ---------------------------------------------------------------------------
// ExecutionStatus
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExecutionStatus {
    Success,
    Err(ProgramError),
}

// ---------------------------------------------------------------------------
// ExecutionResult
// ---------------------------------------------------------------------------

impl ExecutionResult {
    /// Returns `ExecutionStatus::Success` or `ExecutionStatus::Err(ProgramError)`.
    pub fn status(&self) -> ExecutionStatus {
        match &self.raw_result {
            Ok(()) => ExecutionStatus::Success,
            Err(e) => ExecutionStatus::Err(ProgramError::from(e.clone())),
        }
    }

    pub fn is_ok(&self) -> bool {
        self.raw_result.is_ok()
    }

    pub fn is_err(&self) -> bool {
        self.raw_result.is_err()
    }

    /// Panics with the error and program logs if execution failed.
    pub fn unwrap(&self) {
        if let Err(ref e) = self.raw_result {
            panic!("{}", self.format_error(e));
        }
    }

    /// Panics with a custom message, error, and program logs.
    pub fn expect(&self, msg: &str) {
        if let Err(ref e) = self.raw_result {
            panic!("{msg}: {}", self.format_error(e));
        }
    }

    /// Look up a resulting account by address.
    pub fn account(&self, address: &Address) -> Option<&Account> {
        self.accounts.iter().find(|a| a.address == *address)
    }

    /// Print transaction logs to stdout, nicely formatted.
    pub fn print_logs(&self) {
        for log in &self.logs {
            println!("  {log}");
        }
    }

    /// Panic if execution did not succeed.
    pub fn assert_success(&self) {
        if let Err(ref e) = self.raw_result {
            panic!("expected success, got: {}", self.format_error(e));
        }
    }

    /// Panic if execution did not fail with the expected error.
    pub fn assert_error(&self, expected: ProgramError) {
        match &self.raw_result {
            Ok(()) => panic!("expected error {:?}, but execution succeeded", expected),
            Err(e) => {
                let actual = ProgramError::from(e.clone());
                assert_eq!(
                    actual, expected,
                    "expected error {:?}, got {:?}",
                    expected, actual
                );
            }
        }
    }

    fn format_error(&self, e: &InstructionError) -> String {
        let err = ProgramError::from(e.clone());
        if self.logs.is_empty() {
            format!("{err}")
        } else {
            format!(
                "{err}\n\nProgram logs:\n{}",
                self.logs
                    .iter()
                    .map(|l| format!("  {l}"))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        }
    }
}
