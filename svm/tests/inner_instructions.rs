/// Test execution trace with CPI capture
use quasar_svm::token::{create_keyed_associated_token_account, create_keyed_mint_account, Mint};
use quasar_svm::{QuasarSvm, SPL_TOKEN_PROGRAM_ID};
use solana_address::Address;

#[test]
fn test_execution_trace_with_cpis() {
    let mut svm = QuasarSvm::new();

    // Setup accounts
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

    let alice = create_keyed_associated_token_account(&authority, &mint_addr, 500_000);
    let bob = create_keyed_associated_token_account(&authority, &mint_addr, 0);

    // Create transfer instruction
    let transfer_ix = spl_token::instruction::transfer(
        &SPL_TOKEN_PROGRAM_ID,
        &alice.0,
        &bob.0,
        &authority,
        &[],
        100,
    )
    .unwrap();

    println!("\n🧪 Testing Execution Trace with CPIs\n");
    println!("Executing SPL Token Transfer...");

    // Execute
    let result = svm.process_instruction(&transfer_ix, &[authority_account, mint, alice, bob]);

    println!("\n📊 Execution Result:");
    println!("  Success: {}", result.is_ok());
    println!("  Compute units: {}", result.compute_units_consumed);
    println!("  Logs: {}", result.logs.len());

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
            "       {}  CUs: {}, Accounts: {}, Data: {} bytes",
            indent,
            exec_instr.compute_units_consumed,
            exec_instr.instruction.accounts.len(),
            exec_instr.instruction.data.len()
        );
    }

    // Show CPI analysis
    let cpis: Vec<_> = result
        .execution_trace
        .instructions
        .iter()
        .filter(|i| i.stack_depth > 0)
        .collect();

    if !cpis.is_empty() {
        println!("\n🔍 CPI Analysis:");
        println!("  Found {} CPI(s):", cpis.len());
        for cpi in &cpis {
            println!(
                "    Depth {}: {} ({} CUs)",
                cpi.stack_depth, cpi.instruction.program_id, cpi.compute_units_consumed
            );
        }
    } else {
        println!("\n🔍 CPI Analysis:");
        println!("  → No CPIs detected (direct instruction execution)");
    }

    if result.raw_result.is_err() {
        println!("\n❌ Execution halted at:");
        if let Some(last) = result.execution_trace.instructions.last() {
            println!("  Program: {}", last.instruction.program_id);
            println!("  Stack depth: {} (depth in CPI stack)", last.stack_depth);
            println!("  Error code: {}", last.result);

            // Show call stack by filtering instructions with depth <= current
            println!("\n  Call stack (parent callers):");
            let mut stack_instructions: Vec<_> = result
                .execution_trace
                .instructions
                .iter()
                .filter(|i| i.stack_depth <= last.stack_depth)
                .collect();
            stack_instructions.reverse();
            for instr in stack_instructions.iter().take(5) {
                println!(
                    "    Depth {} → {}",
                    instr.stack_depth, instr.instruction.program_id
                );
            }
        }
    }

    println!("\n📝 Transaction Logs:");
    for log in &result.logs {
        println!("  {}", log);
    }

    assert!(result.is_ok(), "Transfer should succeed");

    // Verify execution trace structure
    assert!(
        !result.execution_trace.instructions.is_empty(),
        "Should have at least one instruction"
    );
    assert_eq!(
        result.execution_trace.instructions[0].stack_depth, 0,
        "First instruction should be at depth 0"
    );
}
