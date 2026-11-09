import {
  walletControlsSchema,
  walletControlsUpdateSchema,
  type WalletControlsUpdate,
} from '@auction-ng/shared/wallet-controls-schemas';
import { ApiError } from './auth';
export function createWalletControlsClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function request(path: string, body?: WalletControlsUpdate) {
    const result = await fetch(new URL(path, baseUrl), {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
        'Content-Type': 'application/json',
      },
      body: body
        ? JSON.stringify(walletControlsUpdateSchema.parse(body))
        : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (!result.ok) throw new ApiError(result.status);
    return walletControlsSchema.parse(await result.json());
  }
  return {
    get: () => request('/wallet/controls'),
    admin: () => request('/admin/wallet-controls'),
    update: (value: WalletControlsUpdate) =>
      request('/admin/wallet-controls', value),
  };
}
