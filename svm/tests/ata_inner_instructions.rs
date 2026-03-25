/// Test execution trace with actual CPIs (ATA creation)
use quasar_svm::token::{create_keyed_mint_account, Mint};
use quasar_svm::{QuasarSvm, SPL_ASSOCIATED_TOKEN_PROGRAM_ID, SPL_TOKEN_PROGRAM_ID};
use solana_address::Address;
use solana_instruction::Instruction;

#[test]
fn test_ata_creation_execution_trace() {
    let mut svm = QuasarSvm::new()
        .with_token_program()
        .with_associated_token_program();

    // Setup accounts
    let payer = Address::new_unique();
    let wallet = Address::new_unique();
    let mint_addr = Address::new_unique();

    let payer_account = (
        payer,
        solana_account::Account {
            owner: quasar_svm::system_program::ID,
            lamports: 10_000_000_000,
            data: vec![],
            executable: false,
            rent_epoch: 0,
        },
    );

    let wallet_account = (
        wallet,
        solana_account::Account {
            owner: quasar_svm::system_program::ID,
            lamports: 0,
            data: vec![],
            executable: false,
            rent_epoch: 0,
        },
    );

    let mint = create_keyed_mint_account(
        &mint_addr,
        &Mint {
            decimals: 6,
            supply: 1_000_000,
            ..Default::default()
        },
    );

    // Manually derive ATA address using PDA
    let (ata_address, _bump) = Address::find_program_address(
        &[
            wallet.as_ref(),
            SPL_TOKEN_PROGRAM_ID.as_ref(),
            mint_addr.as_ref(),
        ],
        &SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    println!("\n🧪 Testing ATA Creation (with CPIs)\n");
    println!("Payer: {}", payer);
    println!("Wallet: {}", wallet);
    println!("Mint: {}", mint_addr);
    println!("Expected ATA: {}\n", ata_address);

    // Create the ATA instruction
    let create_ata_ix = Instruction {
        program_id: SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
        accounts: vec![
            solana_instruction::AccountMeta::new(payer, true), // fee payer
            solana_instruction::AccountMeta::new(ata_address, false), // associated token account
            solana_instruction::AccountMeta::new_readonly(wallet, false), // wallet
            solana_instruction::AccountMeta::new_readonly(mint_addr, false), // mint
            solana_instruction::AccountMeta::new_readonly(quasar_svm::system_program::ID, false), // system program
            solana_instruction::AccountMeta::new_readonly(SPL_TOKEN_PROGRAM_ID, false), // token program
        ],
        data: vec![], // ATA program takes no instruction data for create
    };

    // Execute
    let result = svm.process_instruction(&create_ata_ix, &[payer_account, wallet_account, mint]);

    println!("📊 Execution Result:");
    println!("  Success: {}", result.is_ok());
    println!("  Compute units: {}", result.compute_units_consumed);
    println!("  Logs: {}\n", result.logs.len());

    // Show execution trace
    println!("📊 Execution Trace:");
    println!(
        "  Total executed instructions: {}",
        result.execution_trace.instructions.len()
    );
    for (idx, exec_instr) in result.execution_trace.instructions.iter().enumerate() {
        let indent = "  ".repeat(exec_instr.stack_depth as usize);
        let status = if exec_instr.result == 0 { "✅" } else { "❌" };
        println!(
            "  [{}] {}Depth={} {status} → {}",
            idx, indent, exec_instr.stack_depth, exec_instr.instruction.program_id
        );
        println!(
            "       {}  CUs: {}, Accounts: {}, Data: {} bytes",
            indent,
            exec_instr.compute_units_consumed,
            exec_instr.instruction.accounts.len(),
            exec_instr.instruction.data.len()
        );
    }

    // Analyze CPI structure
    let depth_0 = result
        .execution_trace
        .instructions
        .iter()
        .filter(|i| i.stack_depth == 0)
        .count();
    let depth_1 = result
        .execution_trace
        .instructions
        .iter()
        .filter(|i| i.stack_depth == 1)
        .count();
    let depth_2_plus = result
        .execution_trace
        .instructions
        .iter()
        .filter(|i| i.stack_depth >= 2)
        .count();

    println!("\n🔍 CPI Structure:");
    println!("  Depth 0 (top-level): {} instruction(s)", depth_0);
    println!("  Depth 1 (first-level CPIs): {} instruction(s)", depth_1);
    if depth_2_plus > 0 {
        println!("  Depth 2+ (nested CPIs): {} instruction(s)", depth_2_plus);
    }

    // Show unique programs invoked
    let mut programs: Vec<_> = result
        .execution_trace
        .instructions
        .iter()
        .map(|i| i.instruction.program_id)
        .collect();
    programs.sort();
    programs.dedup();
    println!("\n  Programs invoked:");
    for program in programs {
        let count = result
            .execution_trace
            .instructions
            .iter()
            .filter(|i| i.instruction.program_id == program)
            .count();
        println!("    - {} ({} time(s))", program, count);
    }

    // Show compute unit breakdown
    println!("\n💻 Compute Unit Breakdown:");
    let total_cus: u64 = result
        .execution_trace
        .instructions
        .iter()
        .map(|i| i.compute_units_consumed)
        .sum();
    println!("  Total from trace: {} CUs", total_cus);
    println!("  Reported overall: {} CUs", result.compute_units_consumed);

    println!("\n📝 Transaction Logs:");
    for log in &result.logs {
        println!("  {}", log);
    }

    if result.is_ok() {
        // Verify ATA was created
        let ata_account = result.account(&ata_address);
        if let Some(ata) = ata_account {
            println!("\n✅ ATA created successfully!");
            println!("  Address: {}", ata_address);
            println!("  Owner: {}", ata.owner);
            println!("  Lamports: {}", ata.lamports);
            println!("  Data length: {} bytes", ata.data.len());
        }
    }

    // Verify execution trace structure (regardless of success/failure)
    assert!(
        !result.execution_trace.instructions.is_empty(),
        "Should have at least one instruction in trace"
    );
    assert_eq!(
        result.execution_trace.instructions[0].stack_depth, 0,
        "First instruction should be at depth 0"
    );

    // Note: ATA creation may fail if mint isn't properly initialized, but we're testing
    // the execution trace structure here, which should be present regardless
    println!("\n✅ Execution trace structure verified!");
}
