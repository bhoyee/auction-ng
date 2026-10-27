import {
  liveLotSchema,
  realtimeSessionSchema,
  subscribeLotSchema,
  type RealtimeCredentials,
} from '@auction-ng/shared';
export class RealtimeApiError extends Error {
  constructor(readonly status: number) {
    super('Realtime authorization/state unavailable.');
  }
}
export function createRealtimeApiClient(baseUrl: string) {
  const api = new URL(baseUrl);
  if (
    api.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', 'api'].includes(api.hostname) ||
    api.username ||
    api.password ||
    api.pathname !== '/' ||
    api.search ||
    api.hash
  )
    throw new Error('Use the private API address.');
  async function request(path: string, credentials: RealtimeCredentials) {
    const response = await fetch(new URL(path, api), {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new RealtimeApiError(response.status);
    return response.json() as Promise<unknown>;
  }
  return {
    publicSnapshot: async (lotId: string) => {
      subscribeLotSchema.parse({ lotId });
      const response = await fetch(
        new URL(`/lots/${encodeURIComponent(lotId)}/public-live-state`, api),
        {
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) throw new RealtimeApiError(response.status);
      return liveLotSchema.parse(await response.json());
    },
    authenticate: async (credentials: RealtimeCredentials) =>
      realtimeSessionSchema.parse(
        await request('/auth/realtime-session', credentials),
      ),
    snapshot: async (credentials: RealtimeCredentials, lotId: string) => {
      subscribeLotSchema.parse({ lotId });
      return liveLotSchema.parse(
        await request(
          `/lots/${encodeURIComponent(lotId)}/live-state`,
          credentials,
        ),
      );
    },
  };
}
