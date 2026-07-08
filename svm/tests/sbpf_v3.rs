use quasar_svm::{loader_keys, Instruction, Pubkey, QuasarSvm, QuasarSvmConfig};

const SBPF_V3_NOOP_ELF: &[u8] = include_bytes!("../programs/sbpf_v3_noop.so");
const EM_BPF: u16 = 247;
const EM_SBPF: u16 = 263;
const SBPF_V3: u32 = 3;

fn elf_machine(elf: &[u8]) -> u16 {
    assert_eq!(&elf[0..4], b"\x7FELF");
    u16::from_le_bytes([elf[18], elf[19]])
}

fn elf_flags(elf: &[u8]) -> u32 {
    u32::from_le_bytes([elf[48], elf[49], elf[50], elf[51]])
}

#[test]
fn generated_noop_program_is_sbpf_v3() {
    assert!(matches!(elf_machine(SBPF_V3_NOOP_ELF), EM_BPF | EM_SBPF));
    assert_eq!(elf_flags(SBPF_V3_NOOP_ELF), SBPF_V3);
}

#[test]
fn executes_generated_sbpf_v3_program() {
    let mut svm = QuasarSvm::new_with_config(QuasarSvmConfig {
        token: false,
        token_2022: false,
        associated_token: false,
    });
    let program_id = Pubkey::new_unique();
    svm.add_program(&program_id, &loader_keys::LOADER_V3, SBPF_V3_NOOP_ELF);

    let instruction = Instruction {
        program_id,
        accounts: vec![],
        data: vec![1, 2, 3],
    };
    let result = svm.process_instruction(&instruction, &[]);

    assert!(
        result.is_ok(),
        "SBPF v3 fixture failed: {:?}\nlogs:\n{}",
        result.raw_result,
        result.logs.join("\n")
    );

    let trace = &result.execution_trace.instructions;
    assert_eq!(trace.len(), 1);
    assert_eq!(trace[0].stack_depth, 0);
    assert_eq!(trace[0].instruction.program_id, program_id);
    assert_eq!(trace[0].instruction.data, instruction.data);
}
