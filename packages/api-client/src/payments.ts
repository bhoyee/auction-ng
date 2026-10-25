import {
  topupQuoteInputSchema,
  topupQuoteSchema,
  virtualAccountInputSchema,
  virtualAccountResultSchema,
  type VirtualAccountInput,
  paymentHistorySchema,
  walletHistoryInputSchema,
  type WalletHistoryInput,
  cardQuoteInputSchema,
  cardQuoteSchema,
  cardFundingInputSchema,
  cardCheckoutSchema,
  cardConfirmInputSchema,
  cardConfirmationSchema,
  type CardFundingInput,
  fundingRefundInputSchema,
  fundingRefundSchema,
  type FundingRefundInput,
} from '@auction-ng/shared';
import { ApiError } from './auth';

const account = virtualAccountResultSchema;
export function createPaymentClient(
  baseUrl: string,
  options: { accessToken: string; deviceId: string },
) {
  async function request(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(new URL(path, baseUrl), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        'X-Device-Id': options.deviceId,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  }
  return {
    async requestRefund(input: FundingRefundInput) {
      return fundingRefundSchema.parse(
        await request(
          '/payments/refund-requests',
          fundingRefundInputSchema.parse(input),
        ),
      );
    },
    async quoteCard(amountKobo: number, cardType: 'local' | 'international') {
      return cardQuoteSchema.parse(
        await request(
          '/payments/card/quote',
          cardQuoteInputSchema.parse({ amountKobo, cardType }),
        ),
      );
    },
    async initializeCard(input: CardFundingInput) {
      return cardCheckoutSchema.parse(
        await request(
          '/payments/card/initialize',
          cardFundingInputSchema.parse(input),
        ),
      );
    },
    async confirmCard(paymentId: string) {
      return cardConfirmationSchema.parse(
        await request(
          '/payments/card/confirm',
          cardConfirmInputSchema.parse({ paymentId }),
        ),
      );
    },
    async getHistory(query: WalletHistoryInput = {}) {
      const parsed = walletHistoryInputSchema.parse(query);
      const params = new URLSearchParams({ limit: String(parsed.limit) });
      if (parsed.cursor) params.set('cursor', parsed.cursor);
      return paymentHistorySchema.parse(
        await request(`/payments/history?${params}`),
      );
    },
    async quote(transferKobo: number) {
      return topupQuoteSchema.parse(
        await request(
          '/payments/quote',
          topupQuoteInputSchema.parse({ transferKobo }),
        ),
      );
    },
    async assignAccount(input: VirtualAccountInput) {
      return account.parse(
        await request(
          '/payments/virtual-account',
          virtualAccountInputSchema.parse(input),
        ),
      );
    },
    async getAccount() {
      return account.parse(await request('/payments/virtual-account'));
    },
  };
}
