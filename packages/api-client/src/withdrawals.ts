import {
  withdrawalIdSchema,
  type WithdrawalBankInput,
  type WithdrawalStartInput,
  type WithdrawalConfirmInput,
  type WithdrawalReviewInput,
  withdrawalBankInputSchema,
  withdrawalBankSchema,
  withdrawalConfirmSchema,
  withdrawalOverviewSchema,
  withdrawalPageSchema,
  withdrawalQuoteSchema,
  withdrawalReviewSchema,
  withdrawalSchema,
  withdrawalStartSchema,
} from '@auction-ng/shared/withdrawal-schemas';
import {
  pageInputSchema,
  type PageInput,
} from '@auction-ng/shared/catalogue-schemas';
import { ApiError } from './auth';
export function createWithdrawalClient(
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
    async overview() {
      return withdrawalOverviewSchema.parse(
        await request('/withdrawals/overview'),
      );
    },
    async retryBank() {
      return withdrawalBankSchema.parse(
        await request('/withdrawals/bank/retry', {}),
      );
    },
    async verifyBank(input: WithdrawalBankInput) {
      return withdrawalBankSchema.parse(
        await request(
          '/withdrawals/bank',
          withdrawalBankInputSchema.parse(input),
        ),
      );
    },
    async quote(amountKobo: number) {
      return withdrawalQuoteSchema.parse(
        await request('/withdrawals/quote', { amountKobo }),
      );
    },
    async start(input: WithdrawalStartInput) {
      return withdrawalSchema.parse(
        await request('/withdrawals/start', withdrawalStartSchema.parse(input)),
      );
    },
    async confirm(input: WithdrawalConfirmInput) {
      return withdrawalSchema.parse(
        await request(
          '/withdrawals/confirm',
          withdrawalConfirmSchema.parse(input),
        ),
      );
    },
    async get(id: string) {
      withdrawalIdSchema.parse(id);
      return withdrawalSchema.parse(await request('/withdrawals/' + id));
    },
    async history(input: PageInput = {}) {
      const page = pageInputSchema.parse(input),
        query = new URLSearchParams({ limit: String(page.limit) });
      if (page.cursor) query.set('cursor', page.cursor);
      return withdrawalPageSchema.parse(await request('/withdrawals?' + query));
    },
    async review(id: string, input: WithdrawalReviewInput) {
      withdrawalIdSchema.parse(id);
      return withdrawalSchema.parse(
        await request(
          `/admin/withdrawals/${id}/review`,
          withdrawalReviewSchema.parse(input),
        ),
      );
    },
  };
}
