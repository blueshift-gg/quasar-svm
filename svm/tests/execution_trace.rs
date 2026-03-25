/// Test execution trace for debugging and error analysis
use quasar_svm::token::{create_keyed_mint_account, Mint};
use quasar_svm::{QuasarSvm, SPL_TOKEN_PROGRAM_ID};
use solana_address::Address;

#[test]
fn test_execution_trace_simple_transfer() {
    let mut svm = QuasarSvm::new().with_token_program();

    let authority = Address::new_unique();
    let mint_addr = Address::new_unique();

    let authority_account = (
        authority,
        solana_account::Account {
            owner: quasar_svm::system_program::ID,
            lamports: 1_000_000_000,
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

    let alice =
        quasar_svm::token::create_keyed_associated_token_account(&authority, &mint_addr, 500_000);
    let bob = quasar_svm::token::create_keyed_associated_token_account(&authority, &mint_addr, 0);

    let transfer_ix = spl_token::instruction::transfer(
        &SPL_TOKEN_PROGRAM_ID,
        &alice.0,
        &bob.0,
        &authority,
        &[],
        100,
    )
    .unwrap();

    println!("\n🧪 Testing Execution Trace (Simple Transfer)\n");

    let result = svm.process_instruction(&transfer_ix, &[authority_account, mint, alice, bob]);

    println!("📊 Execution Result:");
    println!("  Success: {}", result.is_ok());
    println!("  Compute units: {}", result.compute_units_consumed);

    // Show execution trace
    println!("\n📊 Execution Trace:");
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
            "       {}  CUs: {}",
            indent, exec_instr.compute_units_consumed
        );
    }

    println!("\n📈 Analysis:");
    println!(
        "  Total instructions: {}",
        result.execution_trace.instructions.len()
    );
    let top_level: Vec<_> = result
        .execution_trace
        .instructions
        .iter()
        .filter(|i| i.stack_depth == 0)
        .collect();
    let cpis: Vec<_> = result
        .execution_trace
        .instructions
        .iter()
        .filter(|i| i.stack_depth == 1)
        .collect();
    println!("  Top-level only: {}", top_level.len());
    println!("  CPIs: {}", cpis.len());
    if cpis.is_empty() {
        println!("  → This is a direct instruction with no CPIs");
    }

    assert!(result.is_ok());
}

#[test]
fn test_execution_trace_on_error() {
    let mut svm = QuasarSvm::new().with_token_program();

    let authority = Address::new_unique();
    let wrong_authority = Address::new_unique();
    let mint_addr = Address::new_unique();

    // Create wrong authority account
    let wrong_authority_account = (
        wrong_authority,
        solana_account::Account {
            owner: quasar_svm::system_program::ID,
            lamports: 1_000_000_000,
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

    let alice = quasar_svm::token::create_keyed_associated_token_account(
        &authority, // Owned by correct authority
        &mint_addr, 500_000,
    );
    let bob = quasar_svm::token::create_keyed_associated_token_account(&authority, &mint_addr, 0);

    // Try to transfer with WRONG authority (should fail)
    let transfer_ix = spl_token::instruction::transfer(
        &SPL_TOKEN_PROGRAM_ID,
        &alice.0,
        &bob.0,
        &wrong_authority, // Wrong signer!
        &[],
        100,
    )
    .unwrap();

    println!("\n🧪 Testing Execution Trace on Error\n");
    println!("Attempting transfer with wrong authority (should fail)...");

    let result =
        svm.process_instruction(&transfer_ix, &[wrong_authority_account, mint, alice, bob]);

    println!("\n📊 Execution Result:");
    println!("  Success: {}", result.is_ok());
    println!("  Error: {:?}", result.raw_result);

    // Show execution trace
    println!("\n📊 Execution Trace:");
    if result.execution_trace.instructions.is_empty() {
        println!("  No execution trace available");
    } else {
        println!(
            "  Total executed instructions: {}",
            result.execution_trace.instructions.len()
        );
        for (idx, exec_instr) in result.execution_trace.instructions.iter().enumerate() {
            let indent = "  ".repeat(exec_instr.stack_depth as usize);
            let status = if exec_instr.result == 0 {
                "✅".to_string()
            } else {
                format!("❌({})", exec_instr.result)
            };
            println!(
                "  [{}] {}Depth={} {status} → {}",
                idx, indent, exec_instr.stack_depth, exec_instr.instruction.program_id
            );
        }

        if result.is_err() {
            if let Some(failure) = result.execution_trace.instructions.last() {
                println!("\n❌ Execution halted at:");
                println!("  Program: {}", failure.instruction.program_id);
                println!("  Stack depth: {}", failure.stack_depth);
                println!("  Error code: {}", failure.result);
            }
        }
    }

    // Show error debugging information
    if result.is_err() {
        println!("\n🔍 Error Debugging Information:");

        if let Some(failure_instr) = result.execution_trace.instructions.last() {
            println!(
                "  Stack depth: {} (depth in CPI stack)",
                failure_instr.stack_depth
            );
            println!(
                "  Program that failed: {}",
                failure_instr.instruction.program_id
            );
            println!("  Result code: {}", failure_instr.result);
            println!(
                "  Accounts in instruction: {}",
                failure_instr.instruction.accounts.len()
            );
            println!(
                "  Instruction data length: {} bytes",
                failure_instr.instruction.data.len()
            );
        }

        let call_stack: Vec<_> = result.execution_trace.instructions.iter().collect();
        println!("\n  Full call stack ({} instructions):", call_stack.len());
        for (idx, instr) in call_stack.iter().enumerate() {
            let indent = "    ".repeat(instr.stack_depth as usize);
            let status = if instr.result == 0 {
                "✅".to_string()
            } else {
                format!("❌({})", instr.result)
            };
            println!(
                "    {}[{}] Depth={} {status} {}",
                indent, idx, instr.stack_depth, instr.instruction.program_id
            );
        }
    }

    println!("\n📝 Transaction Logs:");
    for log in &result.logs {
        println!("  {}", log);
    }

    assert!(result.is_err(), "Transfer should fail with wrong authority");
}
