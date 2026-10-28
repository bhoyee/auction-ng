import {
  buyerBidPageSchema,
  buyerNotificationPageSchema,
  buyerInvoiceDetailSchema,
  buyerInvoicePageSchema,
  watchInputSchema,
  watchPageSchema,
  watchStatusInputSchema,
  watchStatusSchema,
  lotBidHistorySchema,
} from '@auction-ng/shared/buyer-schemas';
import {
  pageInputSchema,
  type PageInput,
} from '@auction-ng/shared/catalogue-schemas';
import { ApiError } from './auth';

export function createBuyerClient(
  baseUrl: string,
  options: { accessToken: string; deviceId: string },
) {
  async function request(
    path: string,
    query?: PageInput,
    body?: unknown,
  ): Promise<unknown> {
    const url = new URL(`/buyers/${path}`, baseUrl);
    if (query) {
      const page = pageInputSchema.parse(query);
      url.searchParams.set('limit', String(page.limit));
      if (page.cursor) url.searchParams.set('cursor', page.cursor);
    }
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
        'X-Device-Id': options.deviceId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  }
  return {
    async notifications(page: PageInput = {}) {
      return buyerNotificationPageSchema.parse(
        await request('notifications', page),
      );
    },
    async lotHistory(lotId: string, page: PageInput = {}) {
      return lotBidHistorySchema.parse(
        await request(`lots/${encodeURIComponent(lotId)}/bid-history`, page),
      );
    },
    async lotBids(lotId: string, page: PageInput = {}) {
      return buyerBidPageSchema.parse(
        await request(`lots/${encodeURIComponent(lotId)}/my-bids`, page),
      );
    },
    async watched(lotIds: string[]) {
      return watchStatusSchema.parse(
        await request(
          'watchlist/status',
          undefined,
          watchStatusInputSchema.parse({ lotIds }),
        ),
      );
    },
    async watchlist(page: PageInput = {}) {
      return watchPageSchema.parse(await request('watchlist', page));
    },
    async watch(lotId: string, watching: boolean) {
      return watchInputSchema.parse(
        await request(`watchlist/${encodeURIComponent(lotId)}`, undefined, {
          watching,
        }),
      );
    },
    async bids(page: PageInput = {}) {
      return buyerBidPageSchema.parse(await request('bids', page));
    },
    async invoices(page: PageInput = {}) {
      return buyerInvoicePageSchema.parse(await request('invoices', page));
    },
    async invoice(id: string) {
      return buyerInvoiceDetailSchema.parse(
        await request(`invoices/${encodeURIComponent(id)}`),
      );
    },
  };
}
