import type { VirtualAccountInput } from '@auction-ng/shared';

export type VerifiedTransfer = {
  reference: string;
  customerCode: string;
  amountKobo: number;
  feeKobo: number;
  currency: string;
  domain: string;
  status: string;
  channel: string;
};
export type ProviderAccount = {
  customerCode: string;
  bankName: string;
  accountNumber: string;
  identified: boolean;
};
export interface PaymentProvider {
  verifySignature(raw: Buffer, signature: string): boolean;
  assignAccount(input: VirtualAccountInput & { email: string }): Promise<void>;
  getAccount(email: string): Promise<ProviderAccount | null>;
  verifyTransfer(reference: string): Promise<VerifiedTransfer>;
  listTransfers(from: Date, to: Date): Promise<string[]>;
}
