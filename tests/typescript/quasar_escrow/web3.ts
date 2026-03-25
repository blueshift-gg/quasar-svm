import { Buffer } from "buffer";
import { Address, TransactionInstruction } from "@solana/web3.js";
import { fixCodecSize, getBytesCodec, getStructCodec, getU64Codec, getU8Codec, transformCodec } from "@solana/codecs";

function getPublicKeyCodec() {
  return transformCodec(
    fixCodecSize(getBytesCodec(), 32),
    (value: Address) => value.toBytes(),
    bytes => new Address(bytes),
  );
}

function matchDisc(data: Uint8Array, disc: Uint8Array): boolean {
  if (data.length < disc.length) return false;
  for (let i = 0; i < disc.length; i++) {
    if (data[i] !== disc[i]) return false;
  }
  return true;
}

/* Constants */
export const ESCROW_DISCRIMINATOR = new Uint8Array([1]);
export const MAKE_EVENT_DISCRIMINATOR = new Uint8Array([0]);
export const TAKE_EVENT_DISCRIMINATOR = new Uint8Array([1]);
export const REFUND_EVENT_DISCRIMINATOR = new Uint8Array([2]);
export const MAKE_INSTRUCTION_DISCRIMINATOR = new Uint8Array([0]);
export const TAKE_INSTRUCTION_DISCRIMINATOR = new Uint8Array([1]);
export const REFUND_INSTRUCTION_DISCRIMINATOR = new Uint8Array([2]);

/* Interfaces */
export interface Escrow {
  maker: Address;
  mintA: Address;
  mintB: Address;
  makerTaB: Address;
  receive: bigint;
  bump: number;
}

export interface MakeEvent {
  escrow: Address;
  maker: Address;
  mintA: Address;
  mintB: Address;
  deposit: bigint;
  receive: bigint;
}

export interface TakeEvent {
  escrow: Address;
}

export interface RefundEvent {
  escrow: Address;
}

export interface MakeInstructionArgs {
  deposit: bigint;
  receive: bigint;
}

export interface MakeInstructionInput {
  maker: Address;
  mintA: Address;
  mintB: Address;
  makerTaA: Address;
  makerTaB: Address;
  vaultTaA: Address;
  deposit: bigint;
  receive: bigint;
}

export interface TakeInstructionInput {
  taker: Address;
  maker: Address;
  mintA: Address;
  mintB: Address;
  takerTaA: Address;
  takerTaB: Address;
  makerTaB: Address;
  vaultTaA: Address;
}

export interface RefundInstructionInput {
  maker: Address;
  mintA: Address;
  makerTaA: Address;
  vaultTaA: Address;
}

/* Codecs */
export const EscrowCodec = getStructCodec([
  ["maker", getPublicKeyCodec()],
  ["mintA", getPublicKeyCodec()],
  ["mintB", getPublicKeyCodec()],
  ["makerTaB", getPublicKeyCodec()],
  ["receive", getU64Codec()],
  ["bump", getU8Codec()],
]);

export const MakeEventCodec = getStructCodec([
  ["escrow", getPublicKeyCodec()],
  ["maker", getPublicKeyCodec()],
  ["mintA", getPublicKeyCodec()],
  ["mintB", getPublicKeyCodec()],
  ["deposit", getU64Codec()],
  ["receive", getU64Codec()],
]);

export const TakeEventCodec = getStructCodec([
  ["escrow", getPublicKeyCodec()],
]);

export const RefundEventCodec = getStructCodec([
  ["escrow", getPublicKeyCodec()],
]);

/* Enums */
export enum ProgramEvent {
  MakeEvent = "MakeEvent",
  TakeEvent = "TakeEvent",
  RefundEvent = "RefundEvent",
}

export type DecodedEvent =
  | { type: ProgramEvent.MakeEvent; data: MakeEvent }
  | { type: ProgramEvent.TakeEvent; data: TakeEvent }
  | { type: ProgramEvent.RefundEvent; data: RefundEvent };

export enum ProgramInstruction {
  Make = "Make",
  Take = "Take",
  Refund = "Refund",
}

export type DecodedInstruction =
  | { type: ProgramInstruction.Make; args: MakeInstructionArgs }
  | { type: ProgramInstruction.Take }
  | { type: ProgramInstruction.Refund };

/* Client */
export class QuasarEscrowClient {
  static readonly programId = new Address("22222222222222222222222222222222222222222222");

  decodeEscrow(data: Uint8Array): Escrow {
    if (!matchDisc(data, ESCROW_DISCRIMINATOR)) throw new Error("Invalid Escrow discriminator");
    return EscrowCodec.decode(data.slice(ESCROW_DISCRIMINATOR.length));
  }

  decodeEvent(data: Uint8Array): DecodedEvent | null {
    if (matchDisc(data, MAKE_EVENT_DISCRIMINATOR))
      return { type: ProgramEvent.MakeEvent, data: MakeEventCodec.decode(data.slice(MAKE_EVENT_DISCRIMINATOR.length)) };
    if (matchDisc(data, TAKE_EVENT_DISCRIMINATOR))
      return { type: ProgramEvent.TakeEvent, data: TakeEventCodec.decode(data.slice(TAKE_EVENT_DISCRIMINATOR.length)) };
    if (matchDisc(data, REFUND_EVENT_DISCRIMINATOR))
      return { type: ProgramEvent.RefundEvent, data: RefundEventCodec.decode(data.slice(REFUND_EVENT_DISCRIMINATOR.length)) };
    return null;
  }

  decodeInstruction(data: Uint8Array): DecodedInstruction | null {
    if (matchDisc(data, MAKE_INSTRUCTION_DISCRIMINATOR)) {
      const argsCodec = getStructCodec([
        ["deposit", getU64Codec()],
        ["receive", getU64Codec()],
      ]);
      return { type: ProgramInstruction.Make, args: argsCodec.decode(data.slice(MAKE_INSTRUCTION_DISCRIMINATOR.length)) };
    }
    if (matchDisc(data, TAKE_INSTRUCTION_DISCRIMINATOR))
      return { type: ProgramInstruction.Take };
    if (matchDisc(data, REFUND_INSTRUCTION_DISCRIMINATOR))
      return { type: ProgramInstruction.Refund };
    return null;
  }

  createMakeInstruction(input: MakeInstructionInput): TransactionInstruction {
    const accountsMap: Record<string, Address> = {};
    accountsMap["rent"] = new Address("SysvarRent111111111111111111111111111111111");
    accountsMap["tokenProgram"] = new Address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    accountsMap["systemProgram"] = new Address("11111111111111111111111111111111");
    accountsMap["escrow"] = Address.findProgramAddressSync(
      [
        new Uint8Array([101, 115, 99, 114, 111, 119]),
        input.maker.toBytes(),
      ],
      QuasarEscrowClient.programId,
    )[0];
    const argsCodec = getStructCodec([
      ["deposit", getU64Codec()],
      ["receive", getU64Codec()],
    ]);
    const data = Buffer.from([0, ...argsCodec.encode({ deposit: input.deposit, receive: input.receive })]);
    return new TransactionInstruction({
      programId: QuasarEscrowClient.programId,
      keys: [
        { pubkey: input.maker, isSigner: true, isWritable: true },
        { pubkey: accountsMap["escrow"], isSigner: false, isWritable: true },
        { pubkey: input.mintA, isSigner: false, isWritable: false },
        { pubkey: input.mintB, isSigner: false, isWritable: false },
        { pubkey: input.makerTaA, isSigner: false, isWritable: true },
        { pubkey: input.makerTaB, isSigner: false, isWritable: true },
        { pubkey: input.vaultTaA, isSigner: false, isWritable: true },
        { pubkey: accountsMap["rent"], isSigner: false, isWritable: false },
        { pubkey: accountsMap["tokenProgram"], isSigner: false, isWritable: false },
        { pubkey: accountsMap["systemProgram"], isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  createTakeInstruction(input: TakeInstructionInput): TransactionInstruction {
    const accountsMap: Record<string, Address> = {};
    accountsMap["rent"] = new Address("SysvarRent111111111111111111111111111111111");
    accountsMap["tokenProgram"] = new Address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    accountsMap["systemProgram"] = new Address("11111111111111111111111111111111");
    accountsMap["escrow"] = Address.findProgramAddressSync(
      [
        new Uint8Array([101, 115, 99, 114, 111, 119]),
        input.maker.toBytes(),
      ],
      QuasarEscrowClient.programId,
    )[0];
    const data = Buffer.from([1]);
    return new TransactionInstruction({
      programId: QuasarEscrowClient.programId,
      keys: [
        { pubkey: input.taker, isSigner: true, isWritable: true },
        { pubkey: accountsMap["escrow"], isSigner: false, isWritable: true },
        { pubkey: input.maker, isSigner: false, isWritable: true },
        { pubkey: input.mintA, isSigner: false, isWritable: false },
        { pubkey: input.mintB, isSigner: false, isWritable: false },
        { pubkey: input.takerTaA, isSigner: false, isWritable: true },
        { pubkey: input.takerTaB, isSigner: false, isWritable: true },
        { pubkey: input.makerTaB, isSigner: false, isWritable: true },
        { pubkey: input.vaultTaA, isSigner: false, isWritable: true },
        { pubkey: accountsMap["rent"], isSigner: false, isWritable: false },
        { pubkey: accountsMap["tokenProgram"], isSigner: false, isWritable: false },
        { pubkey: accountsMap["systemProgram"], isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  createRefundInstruction(input: RefundInstructionInput): TransactionInstruction {
    const accountsMap: Record<string, Address> = {};
    accountsMap["rent"] = new Address("SysvarRent111111111111111111111111111111111");
    accountsMap["tokenProgram"] = new Address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    accountsMap["systemProgram"] = new Address("11111111111111111111111111111111");
    accountsMap["escrow"] = Address.findProgramAddressSync(
      [
        new Uint8Array([101, 115, 99, 114, 111, 119]),
        input.maker.toBytes(),
      ],
      QuasarEscrowClient.programId,
    )[0];
    const data = Buffer.from([2]);
    return new TransactionInstruction({
      programId: QuasarEscrowClient.programId,
      keys: [
        { pubkey: input.maker, isSigner: true, isWritable: true },
        { pubkey: accountsMap["escrow"], isSigner: false, isWritable: true },
        { pubkey: input.mintA, isSigner: false, isWritable: false },
        { pubkey: input.makerTaA, isSigner: false, isWritable: true },
        { pubkey: input.vaultTaA, isSigner: false, isWritable: true },
        { pubkey: accountsMap["rent"], isSigner: false, isWritable: false },
        { pubkey: accountsMap["tokenProgram"], isSigner: false, isWritable: false },
        { pubkey: accountsMap["systemProgram"], isSigner: false, isWritable: false },
      ],
      data,
    });
  }
}

