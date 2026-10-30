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
  resolvePayoutAccount?(
    bankCode: string,
    accountNumber: string,
  ): Promise<{ accountName: string; bankName: string }>;
  payoutCustomer?(
    email: string,
    firstName: string,
    lastName: string,
  ): Promise<string>;
  validatePayoutCustomer?(
    customerCode: string,
    input: {
      bankCode: string;
      accountNumber: string;
      bvn: string;
      firstName: string;
      lastName: string;
    },
  ): Promise<void>;
  verifyPayoutCustomer?(customerCode: string, email: string): Promise<boolean>;
  payoutRecipient?(input: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
  }): Promise<string>;
  sendPayout?(input: {
    reference: string;
    recipientCode: string;
    amountKobo: number;
  }): Promise<void>;
  verifyPayout?(reference: string): Promise<{
    reference: string;
    recipientCode: string;
    amountKobo: number;
    feeKobo: number;
    currency: string;
    domain: string;
    status: string;
  } | null>;
  listBanks?(input: PageInput): Promise<PaymentBankPage>;
  initializeCard(input: {
    callbackUrl?: string;
    channel?: 'card' | 'bank_transfer';
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
