use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use std::sync::Arc;

use agave_feature_set::FeatureSet;
use agave_syscalls::{
    create_program_runtime_environment_v1, create_program_runtime_environment_v2,
};
use solana_account::{
    Account as SolanaAccount, AccountSharedData, ReadableAccount, WritableAccount,
};
use solana_compute_budget::compute_budget::ComputeBudget;
use solana_hash::Hash;
use solana_instruction::{AccountMeta, BorrowedAccountMeta, BorrowedInstruction, Instruction};
use solana_instruction_error::InstructionError;
use solana_instructions_sysvar::construct_instructions_data;
use solana_message::{LegacyMessage, Message, SanitizedMessage};
use solana_program_runtime::invoke_context::{EnvironmentConfig, InvokeContext};
use solana_program_runtime::loaded_programs::ProgramRuntimeEnvironments;
use solana_program_runtime::sysvar_cache::SysvarCache;
use solana_pubkey::Pubkey;
use solana_svm_callback::InvokeContextCallback;
use solana_svm_log_collector::LogCollector;
use solana_svm_timings::ExecuteTimings;
use solana_svm_transaction::instruction::SVMInstruction;
use solana_transaction_context::{IndexOfAccount, TransactionContext};

use solana_program_pack::Pack;
use spl_token::state::{Account as SplTokenAccount, Mint as SplMint};

use crate::program_cache::ProgramCache;
use crate::sysvars::Sysvars;
use crate::Account;

struct NoOpCallback;

impl InvokeContextCallback for NoOpCallback {
    fn get_epoch_stake(&self) -> u64 {
        0
    }
    fn get_epoch_stake_for_vote_account(&self, _: &Pubkey) -> u64 {
        0
    }
    fn is_precompile(&self, _: &Pubkey) -> bool {
        false
    }
    fn process_precompile(
        &self,
        _: &Pubkey,
        _: &[u8],
        _: Vec<&[u8]>,
    ) -> Result<(), solana_precompile_error::PrecompileError> {
        Ok(())
    }
}

pub struct ExecutionResult {
    pub compute_units_consumed: u64,
    pub execution_time_us: u64,
    pub raw_result: Result<(), InstructionError>,
    pub return_data: Vec<u8>,
    pub accounts: Vec<Account>,
    pub logs: Vec<String>,
    // RPC metadata
    pub pre_balances: Vec<u64>,
    pub post_balances: Vec<u64>,
    pub pre_token_balances: Vec<TokenBalance>,
    pub post_token_balances: Vec<TokenBalance>,
    /// Full execution trace showing all program invocations with stack depth, compute units,
    /// and execution results. Each instruction includes the full instruction data.
    /// Useful for debugging: trace the call stack via stack_depth and see where execution halted.
    pub execution_trace: ExecutionTrace,
}

#[derive(Debug, Clone)]
pub struct TokenBalance {
    pub account_index: usize,
    pub mint: String,
    pub owner: Option<String>,
    pub ui_token_amount: UiTokenAmount,
}

#[derive(Debug, Clone)]
pub struct UiTokenAmount {
    pub ui_amount: Option<f64>,
    pub decimals: u8,
    pub amount: String,
}

/// Execution trace capturing all program invocations during transaction execution.
/// Each instruction shows full instruction data, stack depth, compute units consumed,
/// and execution result. Parsed from program logs for accuracy.
/// Useful for debugging: trace the call stack via stack_depth and see exact failure points.
#[derive(Debug, Clone)]
pub struct ExecutionTrace {
    pub instructions: Vec<ExecutedInstruction>,
}

#[derive(Debug, Clone)]
pub struct ExecutedInstruction {
    /// Call stack depth: 0 = top-level instruction, 1+ = CPI depth
    pub stack_depth: u8,
    /// The full instruction that was executed (program_id, accounts, data)
    pub instruction: Instruction,
    /// Compute units consumed by this specific invocation (parsed from logs)
    pub compute_units_consumed: u64,
    /// Execution result: 0 = success, error code otherwise (parsed from logs)
    pub result: u64,
}

/// Configuration for loading bundled SPL programs.
#[derive(Debug, Clone)]
pub struct QuasarSvmConfig {
    /// Load SPL Token program (default: true)
    pub token: bool,
    /// Load SPL Token-2022 program (default: true)
    pub token_2022: bool,
    /// Load SPL Associated Token Account program (default: true)
    pub associated_token: bool,
}

impl Default for QuasarSvmConfig {
    fn default() -> Self {
        Self {
            token: true,
            token_2022: true,
            associated_token: true,
        }
    }
}

pub struct QuasarSvm {
    pub compute_budget: ComputeBudget,
    pub feature_set: FeatureSet,
    pub logger: Option<Rc<RefCell<LogCollector>>>,
    pub program_cache: ProgramCache,
    pub sysvars: Sysvars,
    accounts: HashMap<Pubkey, SolanaAccount>,
}

impl Default for QuasarSvm {
    fn default() -> Self {
        Self::new()
    }
}

impl QuasarSvm {
    /// Create a new QuasarSvm instance with all SPL programs loaded by default.
    pub fn new() -> Self {
        Self::new_with_config(QuasarSvmConfig::default())
    }

    /// Create a new QuasarSvm instance with custom program loading configuration.
    pub fn new_with_config(config: QuasarSvmConfig) -> Self {
        let feature_set = FeatureSet::all_enabled();
        let compute_budget = ComputeBudget::new_with_defaults(true, true);
        let program_cache = ProgramCache::new(&feature_set, &compute_budget);

        let svm = Self {
            compute_budget,
            feature_set,
            logger: Some(LogCollector::new_ref()),
            program_cache,
            sysvars: Sysvars::default(),
            accounts: HashMap::new(),
        };

        // Load programs based on config
        if config.token {
            let elf = include_bytes!("../programs/spl_token.so");
            svm.add_program(
                &crate::SPL_TOKEN_PROGRAM_ID,
                &crate::loader_keys::LOADER_V2,
                elf,
            );
        }
        if config.token_2022 {
            let elf = include_bytes!("../programs/spl_token_2022.so");
            svm.add_program(
                &crate::SPL_TOKEN_2022_PROGRAM_ID,
                &crate::loader_keys::LOADER_V3,
                elf,
            );
        }
        if config.associated_token {
            let elf = include_bytes!("../programs/spl_associated_token.so");
            svm.add_program(
                &crate::SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
                &crate::loader_keys::LOADER_V2,
                elf,
            );
        }

        svm
    }

    pub fn add_program(&self, program_id: &Pubkey, loader_key: &Pubkey, elf: &[u8]) {
        self.program_cache.add_program(program_id, loader_key, elf);
    }

    /// Store an account in the SVM's account database.
    /// Stored accounts are automatically included when processing transactions.
    pub fn set_account(&mut self, account: Account) {
        let (pubkey, acct) = account.to_pair();
        self.accounts.insert(pubkey, acct);
    }

    /// Read an account from the SVM's account database.
    pub fn get_account(&self, pubkey: &Pubkey) -> Option<Account> {
        self.accounts
            .get(pubkey)
            .map(|a| Account::from_pair(*pubkey, a.clone()))
    }

    /// Give lamports to an account, creating it if it doesn't exist.
    /// The account is owned by the system program.
    pub fn airdrop(&mut self, pubkey: &Pubkey, lamports: u64) {
        let existing = self.accounts.get(pubkey);
        let new_lamports = existing.map_or(lamports, |a| a.lamports + lamports);
        let account = SolanaAccount {
            lamports: new_lamports,
            data: existing.map_or_else(Vec::new, |a| a.data.clone()),
            owner: existing.map_or(solana_sdk_ids::system_program::ID, |a| a.owner),
            executable: existing.is_some_and(|a| a.executable),
            rent_epoch: 0,
        };
        self.accounts.insert(*pubkey, account);
    }

    /// Create a rent-exempt account with the given space and owner.
    pub fn create_account(&mut self, pubkey: &Pubkey, space: usize, owner: &Pubkey) {
        let lamports = self.sysvars.rent.minimum_balance(space);
        let account = SolanaAccount {
            lamports,
            data: vec![0u8; space],
            owner: *owner,
            executable: false,
            rent_epoch: 0,
        };
        self.accounts.insert(*pubkey, account);
    }

    /// Set the token balance (amount) of an existing token account in the store.
    /// Panics if the account is not found or is not a valid SPL Token account.
    pub fn set_token_balance(&mut self, address: &Pubkey, amount: u64) {
        let acct = self
            .accounts
            .get_mut(address)
            .unwrap_or_else(|| panic!("set_token_balance: account {address} not found"));
        let mut token = SplTokenAccount::unpack(&acct.data).unwrap_or_else(|_| {
            panic!("set_token_balance: account {address} is not a valid token account")
        });
        token.amount = amount;
        SplTokenAccount::pack(token, &mut acct.data).unwrap();
    }

    /// Set the supply of an existing mint account in the store.
    /// Panics if the account is not found or is not a valid SPL Mint account.
    pub fn set_mint_supply(&mut self, address: &Pubkey, supply: u64) {
        let acct = self
            .accounts
            .get_mut(address)
            .unwrap_or_else(|| panic!("set_mint_supply: account {address} not found"));
        let mut mint = SplMint::unpack(&acct.data).unwrap_or_else(|_| {
            panic!("set_mint_supply: account {address} is not a valid mint account")
        });
        mint.supply = supply;
        SplMint::pack(mint, &mut acct.data).unwrap();
    }

    /// Set the clock's unix_timestamp only.
    pub fn warp_to_timestamp(&mut self, timestamp: i64) {
        self.sysvars.clock.unix_timestamp = timestamp;
    }

    /// Execute a single instruction without committing any state changes.
    pub fn simulate_instruction(
        &mut self,
        instruction: &Instruction,
        accounts: &[Account],
    ) -> ExecutionResult {
        self.execute_inner(std::slice::from_ref(instruction), accounts, false)
    }

    /// Execute instructions without committing any state changes.
    pub fn simulate_instruction_chain(
        &mut self,
        instructions: &[Instruction],
        accounts: &[Account],
    ) -> ExecutionResult {
        self.execute_inner(instructions, accounts, false)
    }

    /// Execute a single instruction atomically.
    /// Accounts from the SVM's database are merged in automatically.
    pub fn process_instruction(
        &mut self,
        instruction: &Instruction,
        accounts: &[Account],
    ) -> ExecutionResult {
        self.execute_inner(std::slice::from_ref(instruction), accounts, true)
    }

    /// Execute multiple instructions as a single atomic chain.
    /// Accounts from the SVM's database are merged in automatically.
    pub fn process_instruction_chain(
        &mut self,
        instructions: &[Instruction],
        accounts: &[Account],
    ) -> ExecutionResult {
        self.execute_inner(instructions, accounts, true)
    }

    fn execute_inner(
        &mut self,
        instructions: &[Instruction],
        accounts: &[Account],
        commit: bool,
    ) -> ExecutionResult {
        self.reset_logger();

        let pairs: Vec<(Pubkey, SolanaAccount)> = accounts.iter().map(|a| a.to_pair()).collect();
        let merged = self.merge_accounts(&pairs);

        let (sanitized_message, transaction_accounts) =
            self.compile_accounts(instructions, &merged);

        let mut transaction_context = TransactionContext::new(
            transaction_accounts,
            self.sysvars.rent.clone(),
            self.compute_budget.max_instruction_stack_depth,
            self.compute_budget.max_instruction_trace_length,
        );

        let sysvar_cache = self.sysvars.setup_sysvar_cache(&merged);

        let (compute_units_consumed, execution_time_us, raw_result, return_data) =
            self.process_message(&sanitized_message, &mut transaction_context, &sysvar_cache);

        // Capture pre-execution state before merged is potentially moved
        let pre_balances: Vec<u64> = merged.iter().map(|(_, acc)| acc.lamports()).collect();
        let pre_token_balances = Self::extract_token_balances(&merged);

        let resulting_pairs = if raw_result.is_ok() {
            let result = Self::deconstruct_resulting_accounts(&transaction_context, &merged);
            if commit {
                self.commit_accounts(&result);
            }
            result
        } else {
            merged
        };

        let result_accounts = Self::pairs_to_svm_accounts(&resulting_pairs);

        let logs = self.drain_logs();

        // Compute post-execution state
        let post_balances: Vec<u64> = resulting_pairs
            .iter()
            .map(|(_, acc)| acc.lamports())
            .collect();
        let post_token_balances = Self::extract_token_balances(&resulting_pairs);

        // Extract execution trace from transaction context (using logs for accurate results)
        let execution_trace =
            Self::extract_execution_trace(&mut transaction_context, &sanitized_message, &logs);

        ExecutionResult {
            compute_units_consumed,
            execution_time_us,
            raw_result,
            return_data,
            accounts: result_accounts,
            logs,
            pre_balances,
            post_balances,
            pre_token_balances,
            post_token_balances,
            execution_trace,
        }
    }

    /// Merge explicit accounts with the stored account database.
    /// Explicit accounts take priority over stored ones.
    fn merge_accounts(&self, accounts: &[(Pubkey, SolanaAccount)]) -> Vec<(Pubkey, SolanaAccount)> {
        let explicit: HashSet<Pubkey> = accounts.iter().map(|(k, _)| *k).collect();
        let mut merged: Vec<(Pubkey, SolanaAccount)> = self
            .accounts
            .iter()
            .filter(|(k, _)| !explicit.contains(k))
            .map(|(k, v)| (*k, v.clone()))
            .collect();
        merged.extend_from_slice(accounts);
        merged
    }

    /// Write resulting accounts back into the stored account database.
    fn commit_accounts(&mut self, resulting: &[(Pubkey, SolanaAccount)]) {
        for (pubkey, account) in resulting {
            self.accounts.insert(*pubkey, account.clone());
        }
    }

    fn reset_logger(&mut self) {
        self.logger = Some(LogCollector::new_ref());
    }

    pub(crate) fn drain_logs(&self) -> Vec<String> {
        self.logger
            .as_ref()
            .map(|rc| rc.borrow().get_recorded_content().to_vec())
            .unwrap_or_default()
    }

    /// Build the instructions sysvar account.
    fn build_instructions_sysvar(instructions: &[Instruction]) -> (Pubkey, SolanaAccount) {
        let data = construct_instructions_data(
            instructions
                .iter()
                .map(|ix| BorrowedInstruction {
                    program_id: &ix.program_id,
                    accounts: ix
                        .accounts
                        .iter()
                        .map(|meta| BorrowedAccountMeta {
                            pubkey: &meta.pubkey,
                            is_signer: meta.is_signer,
                            is_writable: meta.is_writable,
                        })
                        .collect(),
                    data: &ix.data,
                })
                .collect::<Vec<_>>()
                .as_slice(),
        );
        (
            solana_instructions_sysvar::ID,
            SolanaAccount {
                lamports: 0,
                data,
                owner: solana_sysvar_id::ID,
                executable: false,
                rent_epoch: 0,
            },
        )
    }

    /// Compile accounts into the format needed by TransactionContext.
    fn compile_accounts(
        &self,
        instructions: &[Instruction],
        accounts: &[(Pubkey, SolanaAccount)],
    ) -> (SanitizedMessage, Vec<(Pubkey, AccountSharedData)>) {
        let message = Message::new(instructions, None);
        let sanitized_message =
            SanitizedMessage::Legacy(LegacyMessage::new(message, &HashSet::new()));

        let program_ids: HashSet<Pubkey> = instructions.iter().map(|ix| ix.program_id).collect();
        let account_keys: HashSet<&Pubkey> = accounts.iter().map(|(k, _)| k).collect();

        // Build fallback accounts for programs and sysvars not in the provided list.
        let mut fallbacks = HashMap::new();

        for pid in &program_ids {
            if !account_keys.contains(pid) {
                let program_accounts = self.program_cache.maybe_create_program_accounts(pid);
                if program_accounts.is_empty() {
                    let mut stub = SolanaAccount::default();
                    stub.set_executable(true);
                    fallbacks.insert(*pid, stub);
                } else {
                    for (key, acct) in program_accounts {
                        fallbacks.insert(key, acct);
                    }
                }
            }
        }

        // Instructions sysvar - always build it.
        let instructions_sysvar = if !account_keys.contains(&solana_instructions_sysvar::ID) {
            let (id, acct) = Self::build_instructions_sysvar(instructions);
            fallbacks.insert(id, acct.clone());
            Some((id, acct))
        } else {
            None
        };

        let mut transaction_accounts: Vec<(Pubkey, AccountSharedData)> = sanitized_message
            .account_keys()
            .iter()
            .map(|key| {
                // Try provided accounts first.
                if let Some((_, a)) = accounts.iter().find(|(k, _)| k == key) {
                    return (*key, AccountSharedData::from(a.clone()));
                }
                // Then try fallbacks (already built for top-level program IDs).
                if let Some(a) = fallbacks.get(key) {
                    return (*key, AccountSharedData::from(a.clone()));
                }
                // Sysvar fallback.
                if let Some(a) = self.sysvars.maybe_create_sysvar_account(key) {
                    return (*key, AccountSharedData::from(a));
                }
                // Program account fallback (for CPI targets not in top-level instructions).
                let program_accounts = self.program_cache.maybe_create_program_accounts(key);
                if let Some((_, a)) = program_accounts.into_iter().find(|(k, _)| k == key) {
                    return (*key, AccountSharedData::from(a));
                }
                // Empty account as last resort.
                (*key, AccountSharedData::default())
            })
            .collect();

        // Always append the instructions sysvar if it wasn't in the message's account keys.
        // This ensures programs can always introspect the current transaction's instructions.
        if let Some((id, acct)) = instructions_sysvar {
            transaction_accounts.push((id, AccountSharedData::from(acct)));
        }

        (sanitized_message, transaction_accounts)
    }

    fn deconstruct_resulting_accounts(
        transaction_context: &TransactionContext,
        original_accounts: &[(Pubkey, SolanaAccount)],
    ) -> Vec<(Pubkey, SolanaAccount)> {
        original_accounts
            .iter()
            .map(|(pubkey, account)| {
                transaction_context
                    .find_index_of_account(pubkey)
                    .map(|index| {
                        let account_ref = transaction_context.accounts().try_borrow(index).unwrap();
                        let resulting_account = SolanaAccount {
                            lamports: account_ref.lamports(),
                            data: account_ref.data().to_vec(),
                            owner: *account_ref.owner(),
                            executable: account_ref.executable(),
                            rent_epoch: account_ref.rent_epoch(),
                        };
                        (*pubkey, resulting_account)
                    })
                    .unwrap_or((*pubkey, account.clone()))
            })
            .collect()
    }

    /// Convert a list of (Pubkey, SolanaAccount) pairs to Vec<Account>.
    fn pairs_to_svm_accounts(pairs: &[(Pubkey, SolanaAccount)]) -> Vec<Account> {
        pairs
            .iter()
            .map(|(k, v)| Account::from_pair(*k, v.clone()))
            .collect()
    }

    /// Extract token balances from SPL token accounts
    fn extract_token_balances(accounts: &[(Pubkey, SolanaAccount)]) -> Vec<TokenBalance> {
        accounts
            .iter()
            .enumerate()
            .filter_map(|(index, (_, account))| {
                // Check if account is an SPL token account (165 bytes)
                if account.data().len() != SplTokenAccount::LEN {
                    return None;
                }

                // Try to parse as SPL token account
                SplTokenAccount::unpack(account.data())
                    .ok()
                    .map(|token_account| {
                        let amount = token_account.amount.to_string();

                        // Get decimals from mint (if we have it in the accounts list)
                        let mint_pubkey = token_account.mint;
                        let decimals = accounts
                            .iter()
                            .find(|(k, _)| *k == mint_pubkey)
                            .and_then(|(_, acc)| {
                                if acc.data().len() == SplMint::LEN {
                                    SplMint::unpack(acc.data()).ok().map(|m| m.decimals)
                                } else {
                                    None
                                }
                            })
                            .unwrap_or(0);

                        let ui_amount = if decimals > 0 {
                            Some(token_account.amount as f64 / 10_f64.powi(decimals as i32))
                        } else {
                            Some(token_account.amount as f64)
                        };

                        TokenBalance {
                            account_index: index,
                            mint: mint_pubkey.to_string(),
                            owner: Some(token_account.owner.to_string()),
                            ui_token_amount: UiTokenAmount {
                                ui_amount,
                                decimals,
                                amount,
                            },
                        }
                    })
            })
            .collect()
    }

    /// Parse program logs to extract per-instruction results and compute units.
    /// Returns a map of (stack_depth, instruction_index) -> (result_code, compute_units).
    /// Note: Logs use 1-based depth [1], but we convert to 0-based to match trace nesting_level.
    fn parse_log_results(logs: &[String]) -> HashMap<(u8, usize), (u64, u64)> {
        let mut results = HashMap::new();
        let mut stack: Vec<(u8, usize, Pubkey)> = Vec::new(); // (depth_0based, idx, program_id)
        let mut instruction_counter = 0;

        for log in logs {
            // Parse "Program <id> invoke [<depth>]"
            // Logs use 1-based depth, convert to 0-based to match trace
            if let Some(depth_1based) = Self::parse_invoke_log(log) {
                let depth_0based = depth_1based.saturating_sub(1);
                stack.push((depth_0based, instruction_counter, Pubkey::default()));
                instruction_counter += 1;
                continue;
            }

            // Parse "Program <id> consumed <units> of <total> compute units"
            if let Some(units) = Self::parse_consumed_log(log) {
                if let Some((depth, idx, _)) = stack.last() {
                    results
                        .entry((*depth, *idx))
                        .and_modify(|e: &mut (u64, u64)| e.1 = units)
                        .or_insert((0, units));
                }
                continue;
            }

            // Parse "Program <id> success" or "Program <id> failed: <error>"
            if let Some(error_code) = Self::parse_result_log(log) {
                if let Some((depth, idx, _)) = stack.pop() {
                    results
                        .entry((depth, idx))
                        .and_modify(|e| e.0 = error_code)
                        .or_insert((error_code, 0));
                }
            }
        }

        results
    }

    /// Parse "Program <id> invoke [<depth>]" log line.
    /// Returns Some(depth) if matched.
    fn parse_invoke_log(log: &str) -> Option<u8> {
        if log.contains("invoke [") {
            log.split("invoke [")
                .nth(1)?
                .split(']')
                .next()?
                .parse::<u8>()
                .ok()
        } else {
            None
        }
    }

    /// Parse "Program <id> consumed <units> of <total> compute units" log line.
    /// Returns Some(units) if matched.
    fn parse_consumed_log(log: &str) -> Option<u64> {
        if log.contains("consumed ") && log.contains(" compute units") {
            log.split("consumed ")
                .nth(1)?
                .split(' ')
                .next()?
                .parse::<u64>()
                .ok()
        } else {
            None
        }
    }

    /// Parse "Program <id> success" or "Program <id> failed: <error>" log line.
    /// Returns Some(0) for success, Some(error_code) for failure, None if not a result line.
    fn parse_result_log(log: &str) -> Option<u64> {
        if log.contains(" success") {
            Some(0)
        } else if log.contains(" failed: ") {
            // Extract error code from the error message
            // For now, return 1 for generic error. We can enhance this later.
            Some(1)
        } else {
            None
        }
    }

    /// Extract execution trace from the transaction context and logs.
    /// Returns execution trace with full instruction data, compute units, and results.
    fn extract_execution_trace(
        transaction_context: &mut TransactionContext,
        sanitized_message: &SanitizedMessage,
        logs: &[String],
    ) -> ExecutionTrace {
        // First, collect instruction data before taking the trace
        let trace_len = transaction_context.get_instruction_trace_length();
        let instruction_data_vec: Vec<Vec<u8>> = (0..trace_len)
            .map(|idx| {
                transaction_context
                    .get_instruction_context_at_index_in_trace(idx)
                    .ok()
                    .map(|ctx| ctx.get_instruction_data().to_vec())
                    .unwrap_or_default()
            })
            .collect();

        // Now take the trace
        let instruction_trace = transaction_context.take_instruction_trace();
        let account_keys = sanitized_message.account_keys();

        // Parse logs to get per-instruction results and compute units
        let log_results = Self::parse_log_results(logs);

        // Build execution trace with full instruction data
        let instructions: Vec<ExecutedInstruction> = instruction_trace
            .iter()
            .enumerate()
            .map(|(idx, frame)| {
                let stack_depth = frame.nesting_level as u8;
                let program_id_index = frame.program_account_index_in_tx as usize;
                let program_id = *account_keys
                    .get(program_id_index)
                    .unwrap_or(&Pubkey::default());

                // Get instruction data from our pre-collected vec
                let instruction_data = instruction_data_vec.get(idx).cloned().unwrap_or_default();

                // Build account metas from instruction accounts
                let accounts: Vec<AccountMeta> = frame
                    .instruction_accounts
                    .iter()
                    .filter_map(|acc| {
                        let pubkey = account_keys.get(acc.index_in_transaction as usize)?;
                        Some(AccountMeta {
                            pubkey: *pubkey,
                            is_signer: acc.is_signer(),
                            is_writable: acc.is_writable(),
                        })
                    })
                    .collect();

                // Get result and compute units from logs
                let (result, compute_units_consumed) = log_results
                    .get(&(stack_depth, idx))
                    .copied()
                    .unwrap_or((0, 0));

                ExecutedInstruction {
                    stack_depth,
                    instruction: Instruction {
                        program_id,
                        accounts,
                        data: instruction_data,
                    },
                    compute_units_consumed,
                    result,
                }
            })
            .collect();

        ExecutionTrace { instructions }
    }

    fn process_message<'a>(
        &self,
        sanitized_message: &'a SanitizedMessage,
        transaction_context: &mut TransactionContext<'a>,
        sysvar_cache: &SysvarCache,
    ) -> (u64, u64, Result<(), InstructionError>, Vec<u8>) {
        let mut compute_units_consumed = 0u64;
        let mut timings = ExecuteTimings::default();

        let mut program_cache = self.program_cache.cache();
        let execution_budget = self.compute_budget.to_budget();
        let runtime_features = self.feature_set.runtime_features();

        let program_runtime_environments = ProgramRuntimeEnvironments {
            program_runtime_v1: Arc::new(
                create_program_runtime_environment_v1(
                    &runtime_features,
                    &execution_budget,
                    false,
                    false,
                )
                .unwrap(),
            ),
            program_runtime_v2: Arc::new(create_program_runtime_environment_v2(
                &execution_budget,
                false,
            )),
        };

        let callback = NoOpCallback;

        let mut invoke_context = InvokeContext::new(
            transaction_context,
            &mut program_cache,
            EnvironmentConfig::new(
                Hash::default(),
                5000,
                &callback,
                &runtime_features,
                &program_runtime_environments,
                &program_runtime_environments,
                sysvar_cache,
            ),
            self.logger.clone(),
            self.compute_budget.to_budget(),
            self.compute_budget.to_cost(),
        );

        let mut raw_result: Result<(), InstructionError> = Ok(());

        for (_program_id, compiled_ix) in sanitized_message.program_instructions_iter() {
            let program_id_index = compiled_ix.program_id_index as IndexOfAccount;

            invoke_context
                .prepare_next_top_level_instruction(
                    sanitized_message,
                    &SVMInstruction::from(compiled_ix),
                    program_id_index,
                    &compiled_ix.data,
                )
                .expect("failed to prepare instruction");

            let mut compute_units_consumed_ix = 0u64;
            let invoke_result =
                invoke_context.process_instruction(&mut compute_units_consumed_ix, &mut timings);

            compute_units_consumed += compute_units_consumed_ix;

            if let Err(err) = invoke_result {
                raw_result = Err(err);
                break;
            }
        }

        let return_data = transaction_context.get_return_data().1.to_vec();

        (
            compute_units_consumed,
            timings.details.execute_us.0,
            raw_result,
            return_data,
        )
    }
}
