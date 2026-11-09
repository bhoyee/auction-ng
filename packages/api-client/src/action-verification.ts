import {
  type ActionVerifyFinishInput,
  type ActionVerifyStartInput,
  actionVerifyChallengeSchema,
  actionVerifyFinishSchema,
  actionVerifyResultSchema,
  actionVerifyStartSchema,
  actionVerifyStatusSchema,
} from '@auction-ng/shared/action-verification';
import { apiErrorFromResponse } from './auth';

// Password + email code (+ authenticator) before bidding, Buy Now and bid
// cancellation requests.
export function createActionVerificationClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function request(path = '', body?: unknown) {
    const response = await fetch(
      new URL('/auth/verify-action' + path, baseUrl),
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
    if (!response.ok) throw await apiErrorFromResponse(response);
    return response.json();
  }
  return {
    async status() {
      return actionVerifyStatusSchema.parse(await request());
    },
    async start(input: ActionVerifyStartInput) {
      return actionVerifyChallengeSchema.parse(
        await request('/start', actionVerifyStartSchema.parse(input)),
      );
    },
    async finish(input: ActionVerifyFinishInput) {
      return actionVerifyResultSchema.parse(
        await request('/finish', actionVerifyFinishSchema.parse(input)),
      );
    },
  };
}
