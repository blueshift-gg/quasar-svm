import { Address } from "@solana/web3.js";
import type { KeyedAccountInfo } from "@solana/web3.js";
import type { Decoder } from "@solana/codecs-core";
import { ExecutionResultBase } from "../internal/result.js";
import type { InternalResult } from "../internal/types.js";

export class ExecutionResult extends ExecutionResultBase {
  readonly accounts: KeyedAccountInfo[];

  constructor(data: InternalResult) {
    super(data);
    this.accounts = data.accounts.map(a => {
      const accountData = Buffer.from(a.data);
      return {
        accountId: new Address(a.address),
        accountInfo: {
          owner: new Address(a.owner),
          lamports: a.lamports,
          data: accountData,
          executable: a.executable,
          rentEpoch: 0n,
          space: BigInt(accountData.length),
        },
      };
    });
  }

  account(address: Address): KeyedAccountInfo | null;
  account<T>(address: Address, decoder: Decoder<T>): T | null;
  account<T>(address: Address, decoder?: Decoder<T>): KeyedAccountInfo | T | null {
    const acct = this.accounts.find(a => a.accountId.equals(address)) ?? null;
    if (acct && decoder) {
      return decoder.decode(acct.accountInfo.data);
    }
    return acct;
  }
}
