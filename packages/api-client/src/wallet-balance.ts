import { walletBalanceSchema } from '@auction-ng/shared/wallet-balance-schema';
import { ApiError } from './auth';

export async function readWalletBalance(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  const response = await fetch(new URL('/wallet', baseUrl), {
    cache: 'no-store',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'X-Device-Id': credentials.deviceId,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new ApiError(response.status);
  return walletBalanceSchema.parse(await response.json());
}
