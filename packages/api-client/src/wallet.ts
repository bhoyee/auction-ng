import {
  walletBalanceSchema,
  walletHistorySchema,
  walletHistoryInputSchema,
  type WalletHistoryInput,
} from '@auction-ng/shared/wallet-schemas';
import { ApiError } from './auth';

export function createWalletClient(
  baseUrl: string,
  options: { accessToken: string; deviceId: string },
) {
  async function request(
    path: string,
    method = 'GET',
    query?: WalletHistoryInput,
  ): Promise<unknown> {
    const url = new URL(path, baseUrl);
    if (query) {
      const parsed = walletHistoryInputSchema.parse(query);
      url.searchParams.set('limit', String(parsed.limit));
      if (parsed.cursor) url.searchParams.set('cursor', parsed.cursor);
    }
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
        'X-Device-Id': options.deviceId,
      },
      body: method === 'POST' ? '{}' : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  }
  return {
    async openWallet() {
      return walletBalanceSchema.parse(await request('/wallet', 'POST'));
    },
    async getBalance() {
      return walletBalanceSchema.parse(await request('/wallet'));
    },
    async getHistory(query: WalletHistoryInput = {}) {
      return walletHistorySchema.parse(
        await request('/wallet/history', 'GET', query),
      );
    },
  };
}
