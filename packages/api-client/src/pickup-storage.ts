import {
  storagePageQuerySchema,
  storageCasePageSchema,
  storageCentrePageSchema,
  storageCentreSaveSchema,
  storageReadySchema,
  storageAdjustSchema,
  storagePaymentStartSchema,
  storagePaymentConfirmSchema,
  storagePaymentSchema,
  storageResultSchema,
  storageExceptionPageSchema,
  storageErrorCodeSchema,
  type StoragePageInput,
  type StorageCentreInput,
  type StorageReadyInput,
  type StorageAdjustInput,
  type StorageQuoteInput,
  type StorageConfirmInput,
} from '@auction-ng/shared';
import { ApiError } from './auth';

export function createPickupStorageClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function request(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(new URL('/pickup/storage/' + path, baseUrl), {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const error: unknown = await response.json().catch(() => null);
      const code =
        error && typeof error === 'object' && 'code' in error
          ? storageErrorCodeSchema.safeParse(error.code).data
          : undefined;
      throw new ApiError(response.status, code);
    }
    return response.json();
  }
  function query(input: StoragePageInput) {
    const v = storagePageQuerySchema.parse(input);
    const q = new URLSearchParams({
      limit: String(v.limit),
      search: v.search,
      view: v.view,
    });
    if (v.cursor) q.set('cursor', v.cursor);
    return q;
  }
  return {
    async pendingPayment(caseId: string) {
      return storagePaymentSchema
        .nullable()
        .parse(
          await request('cases/' + encodeURIComponent(caseId) + '/payment'),
        );
    },
    async mine(input: StoragePageInput = {}) {
      return storageCasePageSchema.parse(await request('mine?' + query(input)));
    },
    async cases(input: StoragePageInput = {}) {
      return storageCasePageSchema.parse(
        await request('cases?' + query(input)),
      );
    },
    async centres(cursor?: string) {
      const value = await request(
        'centres' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
      );
      return storageCentrePageSchema.parse(value);
    },
    async configure(input: StorageCentreInput) {
      return storageResultSchema.parse(
        await request('centres', storageCentreSaveSchema.parse(input)),
      );
    },
    async ready(input: StorageReadyInput) {
      return storageResultSchema.parse(
        await request('ready', storageReadySchema.parse(input)),
      );
    },
    async adjust(input: StorageAdjustInput) {
      return storageResultSchema.parse(
        await request('adjust', storageAdjustSchema.parse(input)),
      );
    },
    async exceptions(cursor?: string) {
      return storageExceptionPageSchema.parse(
        await request(
          'exceptions' +
            (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
        ),
      );
    },
    async quote(input: StorageQuoteInput) {
      return storagePaymentSchema.parse(
        await request('quote', storagePaymentStartSchema.parse(input)),
      );
    },
    async confirm(input: StorageConfirmInput) {
      return storagePaymentSchema.parse(
        await request('confirm', storagePaymentConfirmSchema.parse(input)),
      );
    },
    async payment(id: string) {
      return storagePaymentSchema.parse(
        await request('payments/' + encodeURIComponent(id)),
      );
    },
    async verify(id: string) {
      return storagePaymentSchema.parse(
        await request('payments/' + encodeURIComponent(id) + '/verify', {}),
      );
    },
    async cancel(id: string) {
      return storagePaymentSchema.parse(
        await request('payments/' + encodeURIComponent(id) + '/cancel', {}),
      );
    },
  };
}
