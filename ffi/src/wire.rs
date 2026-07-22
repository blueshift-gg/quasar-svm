//! Binary wire format for passing instructions, accounts, and results across FFI.
//!
//! All integers are little-endian. All lengths are u32 except lamports (u64).
//!
//! ## Instruction (single)
//! ```text
//! [32]  program_id
//! [4]   data_len
//! [N]   data
//! [4]   num_account_metas
//! per meta:
//!   [32] pubkey
//!   [1]  is_signer
//!   [1]  is_writable
//! ```
//!
//! ## Instructions (multiple) — prefixed with count
//! ```text
//! [4]   num_instructions
//! [...]  instruction * num_instructions
//! ```
//!
//! ## Accounts
//! ```text
//! [4]   num_accounts
//! per account:
//!   [32] pubkey
//!   [32] owner
//!   [8]  lamports (u64 LE)
//!   [4]  data_len
//!   [N]  data
//!   [1]  executable
//! ```
//!
//! ## Result
//! ```text
//! [4]   status (i32 LE)
//! [4]   custom error code (u32 LE; meaningful when status is 1)
//! [8]   compute_units (u64 LE)
//! [8]   execution_time_us (u64 LE)
//! [4]   return_data_len
//! [N]   return_data
//! [4]   num_accounts
//! per account:
//!   [32] pubkey
//!   [32] owner
//!   [8]  lamports (u64 LE)
//!   [4]  data_len
//!   [N]  data
//!   [1]  executable
//! [4]   num_logs
//! per log:
//!   [4]  len
//!   [N]  UTF-8 bytes
//! [4]   error_message_len (0 = no error)
//! [N]   error_message UTF-8 bytes
//! ```

use quasar_svm::{ExecutionResult, Instruction, ProgramError, Pubkey};
use solana_account::Account as SolanaAccount;
use solana_instruction::AccountMeta;

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    fn remaining(&self) -> usize {
        self.data.len() - self.pos
    }

    fn read_bytes(&mut self, n: usize) -> Result<&'a [u8], &'static str> {
        if self.pos + n > self.data.len() {
            return Err("unexpected end of input");
        }
        let slice = &self.data[self.pos..self.pos + n];
        self.pos += n;
        Ok(slice)
    }

    fn read_u8(&mut self) -> Result<u8, &'static str> {
        Ok(self.read_bytes(1)?[0])
    }

    fn read_bool(&mut self) -> Result<bool, &'static str> {
        Ok(self.read_u8()? != 0)
    }

    fn read_u32(&mut self) -> Result<u32, &'static str> {
        let bytes: [u8; 4] = self.read_bytes(4)?.try_into().unwrap();
        Ok(u32::from_le_bytes(bytes))
    }

    fn read_u64(&mut self) -> Result<u64, &'static str> {
        let bytes: [u8; 8] = self.read_bytes(8)?.try_into().unwrap();
        Ok(u64::from_le_bytes(bytes))
    }

    fn read_pubkey(&mut self) -> Result<Pubkey, &'static str> {
        let bytes: [u8; 32] = self.read_bytes(32)?.try_into().unwrap();
        Ok(Pubkey::new_from_array(bytes))
    }
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

struct Writer {
    buf: Vec<u8>,
}

impl Writer {
    fn new() -> Self {
        Self {
            buf: Vec::with_capacity(1024),
        }
    }

    fn write_i32(&mut self, v: i32) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    fn write_u8(&mut self, v: u8) {
        self.buf.push(v);
    }

    fn write_u32(&mut self, v: u32) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    fn write_u64(&mut self, v: u64) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    fn write_f64(&mut self, v: f64) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    fn write_bool(&mut self, v: bool) {
        self.buf.push(u8::from(v));
    }

    fn write_bytes(&mut self, data: &[u8]) {
        self.buf.extend_from_slice(data);
    }

    fn write_length_prefixed(&mut self, data: &[u8]) {
        self.write_u32(data.len() as u32);
        self.write_bytes(data);
    }

    fn write_pubkey(&mut self, pubkey: &Pubkey) {
        self.write_bytes(&pubkey.to_bytes());
    }

    fn into_boxed_slice(self) -> Box<[u8]> {
        self.buf.into_boxed_slice()
    }
}

// ---------------------------------------------------------------------------
// Deserialization
// ---------------------------------------------------------------------------

fn read_one_instruction(r: &mut Reader) -> Result<Instruction, &'static str> {
    let program_id = r.read_pubkey()?;
    let data_len = r.read_u32()? as usize;
    let data = r.read_bytes(data_len)?.to_vec();
    let num_metas = r.read_u32()? as usize;
    let mut accounts = Vec::with_capacity(num_metas);
    for _ in 0..num_metas {
        let pubkey = r.read_pubkey()?;
        let is_signer = r.read_bool()?;
        let is_writable = r.read_bool()?;
        accounts.push(AccountMeta {
            pubkey,
            is_signer,
            is_writable,
        });
    }
    Ok(Instruction {
        program_id,
        accounts,
        data,
    })
}

/// Deserialize a count-prefixed list of instructions from the wire format.
pub fn deserialize_instructions(data: &[u8]) -> Result<Vec<Instruction>, &'static str> {
    let mut r = Reader::new(data);
    let count = r.read_u32()? as usize;
    let mut instructions = Vec::with_capacity(count);
    for _ in 0..count {
        instructions.push(read_one_instruction(&mut r)?);
    }
    if r.remaining() > 0 {
        return Err("trailing data after instructions");
    }
    Ok(instructions)
}

/// Deserialize a count-prefixed list of accounts from the wire format.
pub fn deserialize_accounts(data: &[u8]) -> Result<Vec<(Pubkey, SolanaAccount)>, &'static str> {
    let mut r = Reader::new(data);
    let count = r.read_u32()? as usize;
    let mut accounts = Vec::with_capacity(count);
    for _ in 0..count {
        let pubkey = r.read_pubkey()?;
        let owner = r.read_pubkey()?;
        let lamports = r.read_u64()?;
        let data_len = r.read_u32()? as usize;
        let data = r.read_bytes(data_len)?.to_vec();
        let executable = r.read_bool()?;
        accounts.push((
            pubkey,
            SolanaAccount {
                lamports,
                data,
                owner,
                executable,
                rent_epoch: 0,
            },
        ));
    }
    if r.remaining() > 0 {
        return Err("trailing data after accounts");
    }
    Ok(accounts)
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

fn program_error_status(err: &ProgramError) -> (i32, u32) {
    match err {
        ProgramError::Custom(code) => (1, *code),
        ProgramError::InvalidArgument => (-1, 0),
        ProgramError::InvalidInstructionData => (-2, 0),
        ProgramError::InvalidAccountData => (-3, 0),
        ProgramError::AccountDataTooSmall => (-4, 0),
        ProgramError::InsufficientFunds => (-5, 0),
        ProgramError::IncorrectProgramId => (-6, 0),
        ProgramError::MissingRequiredSignature => (-7, 0),
        ProgramError::AccountAlreadyInitialized => (-8, 0),
        ProgramError::UninitializedAccount => (-9, 0),
        ProgramError::MissingAccount => (-10, 0),
        ProgramError::InvalidSeeds => (-13, 0),
        ProgramError::BorshIoError => (-14, 0),
        ProgramError::AccountNotRentExempt => (-15, 0),
        ProgramError::ComputeBudgetExceeded => (-21, 0),
        ProgramError::InvalidAccountOwner => (-22, 0),
        ProgramError::ArithmeticOverflow => (-23, 0),
        ProgramError::Immutable => (-24, 0),
        ProgramError::IncorrectAuthority => (-25, 0),
        ProgramError::Runtime(_) => (-26, 0),
    }
}

/// Serialize an `ExecutionResult` into the wire format.
/// Returns a boxed slice suitable for handing across FFI.
pub fn serialize_result(result: &ExecutionResult) -> Box<[u8]> {
    let mut w = Writer::new();

    let (status, custom_error_code, error_message) = match &result.raw_result {
        Ok(()) => (0i32, 0, None),
        Err(err) => {
            let program_error = ProgramError::from(err.clone());
            let (status, custom_error_code) = program_error_status(&program_error);
            let message = match program_error {
                ProgramError::Runtime(message) => message,
                _ => format!("{err:?}"),
            };
            (status, custom_error_code, Some(message))
        }
    };

    w.write_i32(status);
    w.write_u32(custom_error_code);
    w.write_u64(result.compute_units_consumed);
    w.write_u64(result.execution_time_us);

    // Return data
    w.write_length_prefixed(&result.return_data);

    // Resulting accounts
    w.write_u32(result.accounts.len() as u32);
    for account in &result.accounts {
        w.write_pubkey(&account.address);
        w.write_pubkey(&account.owner);
        w.write_u64(account.lamports);
        w.write_length_prefixed(&account.data);
        w.write_bool(account.executable);
    }

    // Logs
    w.write_u32(result.logs.len() as u32);
    for log in &result.logs {
        w.write_length_prefixed(log.as_bytes());
    }

    // Error message
    match &error_message {
        Some(msg) => w.write_length_prefixed(msg.as_bytes()),
        None => w.write_u32(0),
    }

    // RPC metadata: pre/post balances
    w.write_u32(result.pre_balances.len() as u32);
    for balance in &result.pre_balances {
        w.write_u64(*balance);
    }

    w.write_u32(result.post_balances.len() as u32);
    for balance in &result.post_balances {
        w.write_u64(*balance);
    }

    // Token balances (pre)
    w.write_u32(result.pre_token_balances.len() as u32);
    for tb in &result.pre_token_balances {
        w.write_u32(tb.account_index as u32);
        w.write_length_prefixed(tb.mint.as_bytes());
        match &tb.owner {
            Some(owner) => {
                w.write_bool(true);
                w.write_length_prefixed(owner.as_bytes());
            }
            None => w.write_bool(false),
        }
        w.write_u8(tb.ui_token_amount.decimals);
        w.write_length_prefixed(tb.ui_token_amount.amount.as_bytes());
        match tb.ui_token_amount.ui_amount {
            Some(amt) => {
                w.write_bool(true);
                w.write_f64(amt);
            }
            None => w.write_bool(false),
        }
    }

    // Token balances (post)
    w.write_u32(result.post_token_balances.len() as u32);
    for tb in &result.post_token_balances {
        w.write_u32(tb.account_index as u32);
        w.write_length_prefixed(tb.mint.as_bytes());
        match &tb.owner {
            Some(owner) => {
                w.write_bool(true);
                w.write_length_prefixed(owner.as_bytes());
            }
            None => w.write_bool(false),
        }
        w.write_u8(tb.ui_token_amount.decimals);
        w.write_length_prefixed(tb.ui_token_amount.amount.as_bytes());
        match tb.ui_token_amount.ui_amount {
            Some(amt) => {
                w.write_bool(true);
                w.write_f64(amt);
            }
            None => w.write_bool(false),
        }
    }

    // Execution trace (list of all executed instructions with full data, compute units, and results)
    w.write_u32(result.execution_trace.instructions.len() as u32);
    for instr in &result.execution_trace.instructions {
        w.write_u8(instr.stack_depth);

        // Write full instruction data
        w.write_bytes(&instr.instruction.program_id.to_bytes());
        w.write_u32(instr.instruction.accounts.len() as u32);
        for acc in &instr.instruction.accounts {
            w.write_bytes(&acc.pubkey.to_bytes());
            w.write_bool(acc.is_signer);
            w.write_bool(acc.is_writable);
        }
        w.write_length_prefixed(&instr.instruction.data);

        // Write compute units and result
        w.write_u64(instr.compute_units_consumed);
        w.write_u64(instr.result);
    }

    w.into_boxed_slice()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_error_status_preserves_runtime_and_full_custom_codes() {
        assert_eq!(
            program_error_status(&ProgramError::ComputeBudgetExceeded),
            (-21, 0)
        );
        assert_eq!(program_error_status(&ProgramError::Custom(0)), (1, 0));
        assert_eq!(
            program_error_status(&ProgramError::Custom(u32::MAX)),
            (1, u32::MAX)
        );
        assert_eq!(
            program_error_status(&ProgramError::Runtime("opaque".into())),
            (-26, 0)
        );
    }
}
