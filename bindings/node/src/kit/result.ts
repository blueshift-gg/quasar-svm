import type { Address } from "@solana/addresses";
import { getAddressDecoder } from "@solana/addresses";
import type { Account } from "@solana/accounts";
import type { Decoder } from "@solana/codecs-core";
import { lamports } from "@solana/rpc-types";
import { ExecutionResultBase } from "../internal/result.js";
import type { InternalResult } from "../internal/types.js";

export type { Mint, Token } from "@solana-program/token";
export { AccountState } from "@solana-program/token";

export class ExecutionResult extends ExecutionResultBase {
  readonly accounts: Account<Uint8Array>[];

  constructor(data: InternalResult) {
    super(data);
    this.accounts = data.accounts.map(a => ({
      address: getAddressDecoder().decode(a.address) as Address,
      programAddress: getAddressDecoder().decode(a.owner) as Address,
      lamports: lamports(a.lamports),
      data: a.data,
      executable: a.executable,
      space: BigInt(a.data.length),
    }));
  }

  account(address: Address): Account<Uint8Array> | null;
  account<T>(address: Address, decoder: Decoder<T>): T | null;
  account<T>(address: Address, decoder?: Decoder<T>): Account<Uint8Array> | T | null {
    const acct = this.accounts.find(a => a.address === address) ?? null;
    if (acct && decoder) {
      return decoder.decode(acct.data);
    }
    return acct;
  }
}
