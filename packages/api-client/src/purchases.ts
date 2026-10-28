import {
  purchaseInputSchema,
  purchaseStatusSchema,
  type PurchaseInput,
} from '@auction-ng/shared';
import { ApiError } from './auth';
export function createPurchaseClient(
  baseUrl: string,
  options: { accessToken: string; deviceId: string },
) {
  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
        'X-Device-Id': options.deviceId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ApiError(response.status);
    return purchaseStatusSchema.parse(await response.json());
  }
  return {
    start: (lotId: string, input: PurchaseInput) =>
      request(
        `/lots/${encodeURIComponent(lotId)}/purchases`,
        'POST',
        purchaseInputSchema.parse(input),
      ),
    get: (id: string) => request(`/purchases/${encodeURIComponent(id)}`),
    confirm: (id: string) =>
      request(`/purchases/${encodeURIComponent(id)}/confirm`, 'POST', {}),
    cancel: (id: string) =>
      request(`/purchases/${encodeURIComponent(id)}/cancel`, 'POST', {}),
  };
}
