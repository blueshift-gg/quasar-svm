"""Generated client for the quasar_escrow program."""
from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Optional

from solders.pubkey import Pubkey
from solders.instruction import Instruction, AccountMeta

PROGRAM_ID = Pubkey.from_string("22222222222222222222222222222222222222222222")

MAKE_DISCRIMINATOR = bytes([0])
TAKE_DISCRIMINATOR = bytes([1])
REFUND_DISCRIMINATOR = bytes([2])

ESCROW_ACCOUNT_DISCRIMINATOR = bytes([1])

MAKE_EVENT_EVENT_DISCRIMINATOR = bytes([0])
TAKE_EVENT_EVENT_DISCRIMINATOR = bytes([1])
REFUND_EVENT_EVENT_DISCRIMINATOR = bytes([2])


@dataclass
class Escrow:
    maker: Pubkey
    mint_a: Pubkey
    mint_b: Pubkey
    maker_ta_b: Pubkey
    receive: int
    bump: int

    @classmethod
    def decode(cls, data: bytes) -> Escrow:
        offset = 0
        maker = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32
        mint_a = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32
        mint_b = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32
        maker_ta_b = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32
        receive = struct.unpack_from("<Q", data, offset)[0]
        offset += 8
        bump = data[offset]
        offset += 1
        return cls(maker=maker, mint_a=mint_a, mint_b=mint_b, maker_ta_b=maker_ta_b, receive=receive, bump=bump)


@dataclass
class MakeEvent:
    escrow: Pubkey
    maker: Pubkey
    mint_a: Pubkey
    mint_b: Pubkey
    deposit: int
    receive: int

    @classmethod
    def decode(cls, data: bytes) -> MakeEvent:
        offset = 0
        escrow = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32
        maker = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32
        mint_a = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32
        mint_b = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32
        deposit = struct.unpack_from("<Q", data, offset)[0]
        offset += 8
        receive = struct.unpack_from("<Q", data, offset)[0]
        offset += 8
        return cls(escrow=escrow, maker=maker, mint_a=mint_a, mint_b=mint_b, deposit=deposit, receive=receive)


@dataclass
class TakeEvent:
    escrow: Pubkey

    @classmethod
    def decode(cls, data: bytes) -> TakeEvent:
        offset = 0
        escrow = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32
        return cls(escrow=escrow)


@dataclass
class RefundEvent:
    escrow: Pubkey

    @classmethod
    def decode(cls, data: bytes) -> RefundEvent:
        offset = 0
        escrow = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32
        return cls(escrow=escrow)


@dataclass
class MakeInput:
    maker: Pubkey
    mint_a: Pubkey
    mint_b: Pubkey
    maker_ta_a: Pubkey
    maker_ta_b: Pubkey
    vault_ta_a: Pubkey
    deposit: int
    receive: int


def create_make_instruction(input: MakeInput) -> Instruction:
    accounts = [
        AccountMeta(input.maker, is_signer=True, is_writable=True),
        AccountMeta(Pubkey.find_program_address([bytes([101, 115, 99, 114, 111, 119]), bytes(input.maker)], PROGRAM_ID)[0], is_signer=False, is_writable=True),
        AccountMeta(input.mint_a, is_signer=False, is_writable=False),
        AccountMeta(input.mint_b, is_signer=False, is_writable=False),
        AccountMeta(input.maker_ta_a, is_signer=False, is_writable=True),
        AccountMeta(input.maker_ta_b, is_signer=False, is_writable=True),
        AccountMeta(input.vault_ta_a, is_signer=False, is_writable=True),
        AccountMeta(Pubkey.from_string("SysvarRent111111111111111111111111111111111"), is_signer=False, is_writable=False),
        AccountMeta(Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), is_signer=False, is_writable=False),
        AccountMeta(Pubkey.from_string("11111111111111111111111111111111"), is_signer=False, is_writable=False),
    ]
    data = bytearray(MAKE_DISCRIMINATOR)
    data += struct.pack("<Q", input.deposit)
    data += struct.pack("<Q", input.receive)
    data = bytes(data)
    return Instruction(PROGRAM_ID, data, accounts)


@dataclass
class TakeInput:
    taker: Pubkey
    maker: Pubkey
    mint_a: Pubkey
    mint_b: Pubkey
    taker_ta_a: Pubkey
    taker_ta_b: Pubkey
    maker_ta_b: Pubkey
    vault_ta_a: Pubkey


def create_take_instruction(input: TakeInput) -> Instruction:
    accounts = [
        AccountMeta(input.taker, is_signer=True, is_writable=True),
        AccountMeta(Pubkey.find_program_address([bytes([101, 115, 99, 114, 111, 119]), bytes(input.maker)], PROGRAM_ID)[0], is_signer=False, is_writable=True),
        AccountMeta(input.maker, is_signer=False, is_writable=True),
        AccountMeta(input.mint_a, is_signer=False, is_writable=False),
        AccountMeta(input.mint_b, is_signer=False, is_writable=False),
        AccountMeta(input.taker_ta_a, is_signer=False, is_writable=True),
        AccountMeta(input.taker_ta_b, is_signer=False, is_writable=True),
        AccountMeta(input.maker_ta_b, is_signer=False, is_writable=True),
        AccountMeta(input.vault_ta_a, is_signer=False, is_writable=True),
        AccountMeta(Pubkey.from_string("SysvarRent111111111111111111111111111111111"), is_signer=False, is_writable=False),
        AccountMeta(Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), is_signer=False, is_writable=False),
        AccountMeta(Pubkey.from_string("11111111111111111111111111111111"), is_signer=False, is_writable=False),
    ]
    data = TAKE_DISCRIMINATOR
    return Instruction(PROGRAM_ID, data, accounts)


@dataclass
class RefundInput:
    maker: Pubkey
    mint_a: Pubkey
    maker_ta_a: Pubkey
    vault_ta_a: Pubkey


def create_refund_instruction(input: RefundInput) -> Instruction:
    accounts = [
        AccountMeta(input.maker, is_signer=True, is_writable=True),
        AccountMeta(Pubkey.find_program_address([bytes([101, 115, 99, 114, 111, 119]), bytes(input.maker)], PROGRAM_ID)[0], is_signer=False, is_writable=True),
        AccountMeta(input.mint_a, is_signer=False, is_writable=False),
        AccountMeta(input.maker_ta_a, is_signer=False, is_writable=True),
        AccountMeta(input.vault_ta_a, is_signer=False, is_writable=True),
        AccountMeta(Pubkey.from_string("SysvarRent111111111111111111111111111111111"), is_signer=False, is_writable=False),
        AccountMeta(Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), is_signer=False, is_writable=False),
        AccountMeta(Pubkey.from_string("11111111111111111111111111111111"), is_signer=False, is_writable=False),
    ]
    data = REFUND_DISCRIMINATOR
    return Instruction(PROGRAM_ID, data, accounts)


def decode_event(data: bytes) -> Optional[tuple[str, object]]:
    """Decode an event from raw log data. Returns (event_name, event_data) or None."""
    if data[:1] == MAKE_EVENT_EVENT_DISCRIMINATOR:
        return ("MakeEvent", MakeEvent.decode(data[1:]))
    if data[:1] == TAKE_EVENT_EVENT_DISCRIMINATOR:
        return ("TakeEvent", TakeEvent.decode(data[1:]))
    if data[:1] == REFUND_EVENT_EVENT_DISCRIMINATOR:
        return ("RefundEvent", RefundEvent.decode(data[1:]))
    return None


class QuasarEscrowClient:
    program_id = PROGRAM_ID

    @staticmethod
    def make(input: MakeInput) -> Instruction:
        return create_make_instruction(input)

    @staticmethod
    def take(input: TakeInput) -> Instruction:
        return create_take_instruction(input)

    @staticmethod
    def refund(input: RefundInput) -> Instruction:
        return create_refund_instruction(input)

    @staticmethod
    def decode_event(data: bytes) -> Optional[tuple[str, object]]:
        return decode_event(data)

