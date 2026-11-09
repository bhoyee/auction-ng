import { serverTimeSchema } from '@auction-ng/shared/realtime';
import { ApiError } from './auth';
export async function readServerTime(baseUrl: string) {
  const response = await fetch(new URL('/time', baseUrl), {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new ApiError(response.status);
  return serverTimeSchema.parse(await response.json());
}
