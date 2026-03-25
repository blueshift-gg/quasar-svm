use std::vec;
use quasar_lang::prelude::QuasarSerialize;
use solana_address::Address;
use solana_instruction::{AccountMeta, Instruction};

pub const ID: Address = solana_address::address!("22222222222222222222222222222222222222222222");

pub struct MakeInstruction {
    pub maker: Address,
    pub escrow: Address,
    pub mint_a: Address,
    pub mint_b: Address,
    pub maker_ta_a: Address,
    pub maker_ta_b: Address,
    pub vault_ta_a: Address,
    pub rent: Address,
    pub token_program: Address,
    pub system_program: Address,
    pub deposit: u64,
    pub receive: u64,
}

impl From<MakeInstruction> for Instruction {
    fn from(ix: MakeInstruction) -> Instruction {
        let accounts = vec![
            AccountMeta::new(ix.maker, true),
            AccountMeta::new(ix.escrow, false),
            AccountMeta::new_readonly(ix.mint_a, false),
            AccountMeta::new_readonly(ix.mint_b, false),
            AccountMeta::new(ix.maker_ta_a, false),
            AccountMeta::new(ix.maker_ta_b, false),
            AccountMeta::new(ix.vault_ta_a, false),
            AccountMeta::new_readonly(ix.rent, false),
            AccountMeta::new_readonly(ix.token_program, false),
            AccountMeta::new_readonly(ix.system_program, false),
        ];
        let mut data = vec![0];
        data.extend_from_slice(&ix.deposit.to_le_bytes());
        data.extend_from_slice(&ix.receive.to_le_bytes());
        Instruction {
            program_id: ID,
            accounts,
            data,
        }
    }
}

pub struct TakeInstruction {
    pub taker: Address,
    pub escrow: Address,
    pub maker: Address,
    pub mint_a: Address,
    pub mint_b: Address,
    pub taker_ta_a: Address,
    pub taker_ta_b: Address,
    pub maker_ta_b: Address,
    pub vault_ta_a: Address,
    pub rent: Address,
    pub token_program: Address,
    pub system_program: Address,
}

impl From<TakeInstruction> for Instruction {
    fn from(ix: TakeInstruction) -> Instruction {
        let accounts = vec![
            AccountMeta::new(ix.taker, true),
            AccountMeta::new(ix.escrow, false),
            AccountMeta::new(ix.maker, false),
            AccountMeta::new_readonly(ix.mint_a, false),
            AccountMeta::new_readonly(ix.mint_b, false),
            AccountMeta::new(ix.taker_ta_a, false),
            AccountMeta::new(ix.taker_ta_b, false),
            AccountMeta::new(ix.maker_ta_b, false),
            AccountMeta::new(ix.vault_ta_a, false),
            AccountMeta::new_readonly(ix.rent, false),
            AccountMeta::new_readonly(ix.token_program, false),
            AccountMeta::new_readonly(ix.system_program, false),
        ];
        let data = vec![1];
        Instruction {
            program_id: ID,
            accounts,
            data,
        }
    }
}

pub struct RefundInstruction {
    pub maker: Address,
    pub escrow: Address,
    pub mint_a: Address,
    pub maker_ta_a: Address,
    pub vault_ta_a: Address,
    pub rent: Address,
    pub token_program: Address,
    pub system_program: Address,
}

impl From<RefundInstruction> for Instruction {
    fn from(ix: RefundInstruction) -> Instruction {
        let accounts = vec![
            AccountMeta::new(ix.maker, true),
            AccountMeta::new(ix.escrow, false),
            AccountMeta::new_readonly(ix.mint_a, false),
            AccountMeta::new(ix.maker_ta_a, false),
            AccountMeta::new(ix.vault_ta_a, false),
            AccountMeta::new_readonly(ix.rent, false),
            AccountMeta::new_readonly(ix.token_program, false),
            AccountMeta::new_readonly(ix.system_program, false),
        ];
        let data = vec![2];
        Instruction {
            program_id: ID,
            accounts,
            data,
        }
    }
}

pub const ESCROW_ACCOUNT_DISCRIMINATOR: &[u8] = &[1];

#[derive(Clone, Copy, QuasarSerialize, serde::Serialize, serde::Deserialize)]
#[repr(C)]
pub struct Escrow {
    pub maker: Address,
    pub mint_a: Address,
    pub mint_b: Address,
    pub maker_ta_b: Address,
    pub receive: u64,
    pub bump: u8,
}

impl Escrow {
    /// Serialize the Escrow account to bytes (including discriminator).
    /// Uses bincode for automatic serialization.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut data = vec![];
        data.extend_from_slice(ESCROW_ACCOUNT_DISCRIMINATOR);
        bincode::serialize_into(&mut data, self).expect("Failed to serialize Escrow");
        data
    }

    /// Deserialize Escrow account from bytes (including discriminator).
    /// Uses bincode for automatic deserialization.
    pub fn from_bytes(data: &[u8]) -> Option<Self> {
        if !data.starts_with(ESCROW_ACCOUNT_DISCRIMINATOR) {
            return None;
        }
        bincode::deserialize(&data[ESCROW_ACCOUNT_DISCRIMINATOR.len()..]).ok()
    }
}

pub enum ProgramAccount {
    Escrow(Escrow),
}

pub fn decode_account(data: &[u8]) -> Option<ProgramAccount> {
    if data.starts_with(ESCROW_ACCOUNT_DISCRIMINATOR) {
        let data = &data[ESCROW_ACCOUNT_DISCRIMINATOR.len()..];
        let mut offset = 0usize;
        let maker = Address::from(<[u8; 32]>::try_from(&data[offset..offset + 32]).ok()?);
        offset += 32;
        let mint_a = Address::from(<[u8; 32]>::try_from(&data[offset..offset + 32]).ok()?);
        offset += 32;
        let mint_b = Address::from(<[u8; 32]>::try_from(&data[offset..offset + 32]).ok()?);
        offset += 32;
        let maker_ta_b = Address::from(<[u8; 32]>::try_from(&data[offset..offset + 32]).ok()?);
        offset += 32;
        let receive = u64::from_le_bytes(data[offset..offset + 8].try_into().ok()?);
        offset += 8;
        let bump = data[offset];
        offset += 1;
        return Some(ProgramAccount::Escrow(Escrow { maker, mint_a, mint_b, maker_ta_b, receive, bump }));
    }
    None
}

pub const MAKE_EVENT_EVENT_DISCRIMINATOR: &[u8] = &[0];
pub const TAKE_EVENT_EVENT_DISCRIMINATOR: &[u8] = &[1];
pub const REFUND_EVENT_EVENT_DISCRIMINATOR: &[u8] = &[2];

pub struct MakeEvent {
    pub escrow: Address,
    pub maker: Address,
    pub mint_a: Address,
    pub mint_b: Address,
    pub deposit: u64,
    pub receive: u64,
}

pub struct TakeEvent {
    pub escrow: Address,
}

pub struct RefundEvent {
    pub escrow: Address,
}

pub enum ProgramEvent {
    MakeEvent(MakeEvent),
    TakeEvent(TakeEvent),
    RefundEvent(RefundEvent),
}

pub fn decode_event(data: &[u8]) -> Option<ProgramEvent> {
    if data.starts_with(MAKE_EVENT_EVENT_DISCRIMINATOR) {
        let data = &data[MAKE_EVENT_EVENT_DISCRIMINATOR.len()..];
        let mut offset = 0usize;
        let escrow = Address::from(<[u8; 32]>::try_from(&data[offset..offset + 32]).ok()?);
        offset += 32;
        let maker = Address::from(<[u8; 32]>::try_from(&data[offset..offset + 32]).ok()?);
        offset += 32;
        let mint_a = Address::from(<[u8; 32]>::try_from(&data[offset..offset + 32]).ok()?);
        offset += 32;
        let mint_b = Address::from(<[u8; 32]>::try_from(&data[offset..offset + 32]).ok()?);
        offset += 32;
        let deposit = u64::from_le_bytes(data[offset..offset + 8].try_into().ok()?);
        offset += 8;
        let receive = u64::from_le_bytes(data[offset..offset + 8].try_into().ok()?);
        offset += 8;
        return Some(ProgramEvent::MakeEvent(MakeEvent { escrow, maker, mint_a, mint_b, deposit, receive }));
    }
    if data.starts_with(TAKE_EVENT_EVENT_DISCRIMINATOR) {
        let data = &data[TAKE_EVENT_EVENT_DISCRIMINATOR.len()..];
        let mut offset = 0usize;
        let escrow = Address::from(<[u8; 32]>::try_from(&data[offset..offset + 32]).ok()?);
        offset += 32;
        return Some(ProgramEvent::TakeEvent(TakeEvent { escrow }));
    }
    if data.starts_with(REFUND_EVENT_EVENT_DISCRIMINATOR) {
        let data = &data[REFUND_EVENT_EVENT_DISCRIMINATOR.len()..];
        let mut offset = 0usize;
        let escrow = Address::from(<[u8; 32]>::try_from(&data[offset..offset + 32]).ok()?);
        offset += 32;
        return Some(ProgramEvent::RefundEvent(RefundEvent { escrow }));
    }
    None
}

