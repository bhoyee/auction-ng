import {
  bidCancellationRequestSchema,
  bidCancellationStateSchema,
  type BidCancellationRequestInput,
} from '@auction-ng/shared/bid-cancellation-state';
import { apiErrorFromResponse } from './auth';

type Credentials = { accessToken: string; deviceId: string };

// The item page's only support calls: check and request a bid cancellation.
// Same requests, headers and session renewal as createSupportClient, without
// bundling the customer-service chat client and schemas.
export function createBidCancellationClient(
  baseUrl: string,
  credentials: Credentials,
  renew?: (failedToken: string) => Promise<Credentials | null>,
) {
  async function request(lotId: string, body?: unknown) {
    const url = new URL(
      `/support/lots/${encodeURIComponent(lotId)}/bid-cancellation`,
      baseUrl,
    );
    const send = (auth: Credentials) =>
      fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          'X-Device-Id': auth.deviceId,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        redirect: 'error',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(20000),
      });
    let response = await send(credentials);
    if (response.status === 401 && renew) {
      const fresh = await renew(credentials.accessToken);
      if (fresh) {
        credentials = fresh;
        response = await send(fresh);
      }
    }
    if (!response.ok) throw await apiErrorFromResponse(response);
    return bidCancellationStateSchema.parse(await response.json());
  }
  return {
    async bidCancellation(lotId: string) {
      return request(lotId);
    },
    async requestBidCancellation(
      lotId: string,
      input: BidCancellationRequestInput,
    ) {
      return request(lotId, bidCancellationRequestSchema.parse(input));
    },
  };
}
