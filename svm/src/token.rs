use solana_program_pack::Pack;
use solana_address::Address;
use solana_account::Account as SolanaAccount;
use solana_rent::Rent;
pub use spl_token::state::{Account as TokenAccount, AccountState, Mint};

// ---------------------------------------------------------------------------
// Account factories
// ---------------------------------------------------------------------------

/// Create a system-owned account.
pub fn create_keyed_system_account(address: &Address, lamports: u64) -> (Address, SolanaAccount) {
    (
        *address,
        SolanaAccount {
            lamports,
            data: vec![],
            owner: solana_sdk_ids::system_program::ID,
            executable: false,
            rent_epoch: 0,
        }
    )
}

/// Create a pre-initialized mint account.
pub fn create_keyed_mint_account(address: &Address, mint: &Mint) -> (Address, SolanaAccount) {
    create_keyed_mint_account_with_program(address, mint, &crate::SPL_TOKEN_PROGRAM_ID)
}

/// Create a pre-initialized mint account with a specific token program.
#[inline(always)]
pub fn create_keyed_mint_account_with_program(
    address: &Address,
    mint: &Mint,
    token_program_id: &Address,
) -> (Address, SolanaAccount) {
    let mut data = vec![0u8; Mint::LEN];
    Mint::pack(*mint, &mut data).unwrap();
    (
        *address,
        SolanaAccount {
            lamports: Rent::default().minimum_balance(Mint::LEN),
            data,
            owner: *token_program_id,
            executable: false,
            rent_epoch: 0,
        }
    )
}

/// Create a pre-initialized token account.
pub fn create_keyed_token_account(address: &Address, token: &TokenAccount) -> (Address, SolanaAccount) {
    create_keyed_token_account_with_program(address, token, &crate::SPL_TOKEN_PROGRAM_ID)
}

/// Create a pre-initialized token account with a specific token program.
#[inline(always)]
pub fn create_keyed_token_account_with_program(
    address: &Address,
    token: &TokenAccount,
    token_program_id: &Address,
) -> (Address, SolanaAccount) {
    let mut data = vec![0u8; TokenAccount::LEN];
    TokenAccount::pack(*token, &mut data).unwrap();
    (
        *address,
        SolanaAccount {
            lamports: Rent::default().minimum_balance(TokenAccount::LEN),
            data,
            owner: *token_program_id,
            executable: false,
            rent_epoch: 0,
        }
    )
}

/// Create a pre-initialized associated token account.
/// The address is derived from the wallet, mint, and token program.
pub fn create_keyed_associated_token_account(
    wallet: &Address,
    mint: &Address,
    amount: u64,
) -> (Address, SolanaAccount) {
    create_keyed_associated_token_account_with_program(
        wallet,
        mint,
        amount,
        &crate::SPL_TOKEN_PROGRAM_ID,
    )
}

/// Create a pre-initialized associated token account with a specific token program.
/// The address is derived from the wallet, mint, and token program.
#[inline(always)]
pub fn create_keyed_associated_token_account_with_program(
    wallet: &Address,
    mint: &Address,
    amount: u64,
    token_program_id: &Address,
) -> (Address, SolanaAccount) {
    let (ata, _bump) = Address::find_program_address(
        &[wallet.as_ref(), token_program_id.as_ref(), mint.as_ref()],
        &crate::SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    let token = TokenAccount {
        mint: *mint,
        owner: *wallet,
        amount,
        state: AccountState::Initialized,
        ..TokenAccount::default()
    };
    create_keyed_token_account_with_program(&ata, &token, token_program_id)
}

/// Create a program-owned account with serialized data.
/// This is useful for creating accounts with custom program state.
/// The data should already be serialized to bytes.
///
/// # Example
/// ```ignore
/// use quasar_svm::token::create_keyed_program_account;
///
/// let state = MyProgramState { owner, balance: 1000 };
/// let data = state.to_bytes(); // Use whatever serialization method your type has
/// let (address, account) = create_keyed_program_account(
///     my_address,
///     data,
///     my_program_id
/// );
/// ```
pub fn create_keyed_program_account(
    address: Address,
    data: Vec<u8>,
    owner: Address,
) -> (Address, SolanaAccount) {
    let data_len = data.len();
    (
        address,
        SolanaAccount {
            lamports: Rent::default().minimum_balance(data_len),
            data,
            owner,
            executable: false,
            rent_epoch: 0,
        }
    )
}
