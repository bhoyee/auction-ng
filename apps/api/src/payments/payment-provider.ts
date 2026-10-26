import type {
  VirtualAccountInput,
  PageInput,
  PaymentBankPage,
} from '@auction-ng/shared';

export type VerifiedTransfer = {
  reference: string;
  customerCode: string;
  amountKobo: number;
  feeKobo: number | null;
  currency: string;
  domain: string;
  status: string;
  channel: string;
  customerEmail?: string;
  cardCountry?: string;
};
export type ProviderAccount = {
  customerCode: string;
  bankName: string;
  accountNumber: string;
  identified: boolean;
};
export interface PaymentProvider {
  listBanks?(input: PageInput): Promise<PaymentBankPage>;
  initializeCard(input: {
    email: string;
    reference: string;
    amountKobo: number;
  }): Promise<{ authorizationUrl: string }>;
  verifySignature(raw: Buffer, signature: string): boolean;
  assignAccount(input: VirtualAccountInput & { email: string }): Promise<void>;
  getAccount(email: string): Promise<ProviderAccount | null>;
  verifyTransfer(reference: string): Promise<VerifiedTransfer>;
  listTransfers(from: Date, to: Date): Promise<string[]>;
}
