use escrow_client::{Escrow, ID, MakeInstruction, RefundInstruction};
use quasar_svm::{Instruction, QuasarSvm, token::{create_keyed_associated_token_account, create_keyed_mint_account, create_keyed_program_account, create_keyed_system_account}};
use solana_address::Address;
use solana_program_pack::Pack;
use spl_token::state::Mint;

fn setup() -> QuasarSvm {
    let elf = include_bytes!("../../escrow.so");
    QuasarSvm::new()
        .with_program(&Address::from(crate::ID), elf)
}

#[test]
fn make() {
    let mut vm = setup();

    let (maker, maker_account) = create_keyed_system_account(&Address::new_unique(), 1_000_000_000);
    let (mint_a, mint_a_account) = create_keyed_mint_account(&Address::new_unique(), &Mint { mint_authority: None.into(), supply: 1_000_000_000_000_000, decimals: 6, is_initialized: true, freeze_authority: None.into() });
    let (mint_b, mint_b_account) = create_keyed_mint_account(&Address::new_unique(), &Mint { mint_authority: None.into(), supply: 1_000_000_000_000_000, decimals: 6, is_initialized: true, freeze_authority: None.into() });
    let (maker_ta_a, maker_ta_a_account) = create_keyed_associated_token_account(&maker, &mint_a, 100_000_000_000);
    let (maker_ta_b, maker_ta_b_account) = create_keyed_associated_token_account(&maker, &mint_b, 100_000_000_000);
    let (escrow, escrow_account) = create_keyed_system_account(
        &Address::find_program_address(
            &[b"escrow", Address::from(maker.to_bytes()).as_ref()],
            &ID,
        ).0, 
        0
    );
    let (vault_ta_a, vault_ta_a_account) = create_keyed_associated_token_account(&escrow, &mint_a, 0);

    let instruction: Instruction = MakeInstruction {
        maker,
        mint_a,
        mint_b,
        maker_ta_a,
        maker_ta_b,
        vault_ta_a,
        escrow,
        rent: quasar_svm::solana_sdk_ids::sysvar::rent::ID,
        system_program: quasar_svm::system_program::ID,
        token_program: quasar_svm::SPL_TOKEN_PROGRAM_ID,
        deposit: 1_000_000_000,
        receive: 1_000_000_000,
    }.into();

    let result = vm.process_instruction(
        &instruction,
        &[
            (maker, maker_account),
            (mint_a, mint_a_account),
            (mint_b, mint_b_account),
            (maker_ta_a, maker_ta_a_account),
            (maker_ta_b, maker_ta_b_account),
            (vault_ta_a, vault_ta_a_account),
            (escrow, escrow_account),
        ],
    );
    result.assert_success();
    assert_eq!(
        spl_token::state::Account::unpack(&result.account(&maker_ta_a).expect("Missing Maker Token Account").data).unwrap().amount,
        99_000_000_000
    );
    assert_eq!(
        spl_token::state::Account::unpack(&result.account(&vault_ta_a).expect("Missing Vault Token Account").data).unwrap().amount,
        1_000_000_000
    );
}

#[test]
fn refund() {
    let mut vm = setup();

    let (maker, maker_account) = create_keyed_system_account(&Address::new_unique(), 1_000_000_000);
    let (mint_a, mint_a_account) = create_keyed_mint_account(&Address::new_unique(), &Mint { mint_authority: None.into(), supply: 1_000_000_000_000_000, decimals: 6, is_initialized: true, freeze_authority: None.into() });
    let mint_b = Address::new_unique();
    let (maker_ta_a, maker_ta_a_account) = create_keyed_associated_token_account(&maker, &mint_a, 100_000_000_000);
    let maker_ta_b = Address::new_unique();
    let (escrow, bump) = Address::find_program_address(
        &[b"escrow", Address::from(maker.to_bytes()).as_ref()],
        &ID,
    );

    let escrow_state = Escrow {
        maker,
        mint_a,
        mint_b,
        maker_ta_b,
        receive: 1_000_000_000,
        bump,
    };

    let (_, escrow_account) = create_keyed_program_account(
        escrow,
        escrow_state.to_bytes(),
        escrow_client::ID
    );

    let (vault_ta_a, vault_ta_a_account) = create_keyed_associated_token_account(&escrow, &mint_a, 1_000_000_000);

    let instruction: Instruction = RefundInstruction {
        maker,
        mint_a,
        maker_ta_a,
        vault_ta_a,
        escrow,
        rent: quasar_svm::solana_sdk_ids::sysvar::rent::ID,
        system_program: quasar_svm::system_program::ID,
        token_program: quasar_svm::SPL_TOKEN_PROGRAM_ID,
    }.into();

    let result = vm.process_instruction(
        &instruction,
        &[
            (maker, maker_account),
            (mint_a, mint_a_account),
            (maker_ta_a, maker_ta_a_account),
            (vault_ta_a, vault_ta_a_account),
            (escrow, escrow_account),
        ],
    );
    result.assert_success();
    // Maker gets tokens back from vault
    assert_eq!(
        spl_token::state::Account::unpack(&result.account(&maker_ta_a).expect("Missing Maker Token Account").data).unwrap().amount,
        101_000_000_000 // 100B initial + 1B refunded from vault
    );
}

#[test]
fn test_escrow_serialization_round_trip() {
    // Test that to_bytes and from_bytes are inverses
    let original = Escrow {
        maker: Address::new_unique(),
        mint_a: Address::new_unique(),
        mint_b: Address::new_unique(),
        maker_ta_b: Address::new_unique(),
        receive: 1_000_000_000,
        bump: 42,
    };

    let bytes = original.to_bytes();
    let deserialized = Escrow::from_bytes(&bytes).expect("Failed to deserialize");

    assert_eq!(original.maker, deserialized.maker);
    assert_eq!(original.mint_a, deserialized.mint_a);
    assert_eq!(original.mint_b, deserialized.mint_b);
    assert_eq!(original.maker_ta_b, deserialized.maker_ta_b);
    assert_eq!(original.receive, deserialized.receive);
    assert_eq!(original.bump, deserialized.bump);
}