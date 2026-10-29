import {
  watchInputSchema,
  watchCountSchema,
  watchStatusInputSchema,
  watchStatusSchema,
} from '@auction-ng/shared/watch-status-schemas';
import { ApiError } from './auth';

export function createWatchStatusClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function request(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(new URL(`/buyers/${path}`, baseUrl), {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  }
  return {
    async count() {
      return watchCountSchema.parse(await request('watchlist/count'));
    },
    async watched(lotIds: string[]) {
      return watchStatusSchema.parse(
        await request(
          'watchlist/status',
          watchStatusInputSchema.parse({ lotIds }),
        ),
      );
    },
    async watch(lotId: string, watching: boolean) {
      return watchInputSchema.parse(
        await request(
          `watchlist/${encodeURIComponent(lotId)}`,
          watchInputSchema.parse({ watching }),
        ),
      );
    },
  };
}
