import {
  purchaseUnlockChallengeSchema,
  purchaseUnlockFinishSchema,
  purchaseUnlockStartSchema,
  purchaseUnlockStatusSchema,
} from '@auction-ng/shared/purchase-unlock';
import { ApiError } from './auth';

/** Confirm it's the account owner before bidding or buying. */
export function createPurchaseUnlockClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function request(path = '', body?: unknown): Promise<unknown> {
    const response = await fetch(
      new URL('/auth/purchase-unlock' + path, baseUrl),
      {
        method: body === undefined ? 'GET' : 'POST',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'X-Device-Id': credentials.deviceId,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      const value: unknown = await response.json().catch(() => undefined);
      const record =
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)
          : {};
      // These messages are written for buyers: show them as they are.
      throw new ApiError(
        response.status,
        typeof record.code === 'string' ? record.code : undefined,
        typeof record.field === 'string' ? record.field : undefined,
        typeof record.message === 'string' ? record.message : undefined,
      );
    }
    return response.json();
  }
  return {
    async status() {
      return purchaseUnlockStatusSchema.parse(await request());
    },
    async start(input: { password: string }) {
      return purchaseUnlockChallengeSchema.parse(
        await request('/start', purchaseUnlockStartSchema.parse(input)),
      );
    },
    async finish(input: {
      id: string;
      code: string;
      factor?: { method: 'authenticator' | 'recovery'; code: string };
    }) {
      return purchaseUnlockStatusSchema.parse(
        await request('/finish', purchaseUnlockFinishSchema.parse(input)),
      );
    },
  };
}
