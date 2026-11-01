import {
  pickupCentrePageSchema,
  prepareVisitPassSchema,
  scanVisitPassSchema,
  pickupVisitPassSchema,
  pickupVisitSchema,
  pickupVisitPageSchema,
  pickupVisitItemsSchema,
  confirmCollectionSchema,
  collectionReceiptSchema,
  cancelVisitSchema,
  visitPageInputSchema,
  visitItemPageInputSchema,
  type CollectionInput,
} from '@auction-ng/shared/pickup-visit-schemas';
import { ApiError } from './auth';
export function createPickupVisitClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function request(path: string, body?: unknown) {
    const response = await fetch(new URL('/pickup/' + path, baseUrl), {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Device-Id': credentials.deviceId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  }
  function query(page: { limit?: number; cursor?: string }) {
    const p = visitPageInputSchema.parse(page),
      q = new URLSearchParams({ limit: String(p.limit) });
    if (p.cursor) q.set('cursor', p.cursor);
    return q;
  }
  return {
    async centres(page: { limit?: number; cursor?: string } = {}) {
      return pickupCentrePageSchema.parse(
        await request('centres?' + query(page)),
      );
    },
    async prepare(locationId: string, renew = false) {
      return pickupVisitPassSchema.parse(
        await request(
          'visit-pass',
          prepareVisitPassSchema.parse({ locationId, renew }),
        ),
      );
    },
    async pass(id: string) {
      return pickupVisitPassSchema.parse(
        await request('visit-pass/' + encodeURIComponent(id)),
      );
    },
    async scan(code: string) {
      return pickupVisitSchema.parse(
        await request('visits/scan', scanVisitPassSchema.parse({ code })),
      );
    },
    async queue(page: { limit?: number; cursor?: string } = {}) {
      return pickupVisitPageSchema.parse(
        await request('visits?' + query(page)),
      );
    },
    async items(
      id: string,
      page: { limit?: number; cursor?: string; itemNumber?: string } = {},
    ) {
      const parsed = visitItemPageInputSchema.parse(page),
        itemQuery = query({ limit: parsed.limit, cursor: parsed.cursor });
      if (parsed.itemNumber) itemQuery.set('itemNumber', parsed.itemNumber);
      return pickupVisitItemsSchema.parse(
        await request(`visits/${encodeURIComponent(id)}/items?${itemQuery}`),
      );
    },
    async collect(id: string, input: CollectionInput) {
      return collectionReceiptSchema.parse(
        await request(
          `visits/${encodeURIComponent(id)}/collect`,
          confirmCollectionSchema.parse(input),
        ),
      );
    },
    async cancel(id: string, reason: string) {
      return pickupVisitSchema.parse(
        await request(
          `visits/${encodeURIComponent(id)}/cancel`,
          cancelVisitSchema.parse({ reason }),
        ),
      );
    },
  };
}
