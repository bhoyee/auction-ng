import {
  buyerBidPageSchema,
  lotBidHistorySchema,
} from '@auction-ng/shared/buyer-schemas';
import {
  pageInputSchema,
  type PageInput,
} from '@auction-ng/shared/page-schemas';
import { ApiError } from './auth';

// The item page only reads bid history. These two reads match the catalogue
// and buyer clients exactly, without bundling their admin/account endpoints.
async function read(url: URL, init: RequestInit, timeout: number) {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<unknown>;
}
function withPage(url: URL, page: PageInput) {
  const parsed = pageInputSchema.parse(page);
  url.searchParams.set('limit', String(parsed.limit));
  if (parsed.cursor) url.searchParams.set('cursor', parsed.cursor);
  return url;
}

/** Public, recorded bid history for an item (same as catalogue lotHistory). */
export async function readLotHistory(
  baseUrl: string,
  lotId: string,
  page: PageInput = {},
) {
  const url = withPage(
    new URL(`/lots/${encodeURIComponent(lotId)}/bid-history`, baseUrl),
    page,
  );
  return lotBidHistorySchema.parse(
    await read(url, { headers: { 'Content-Type': 'application/json' } }, 60000),
  );
}

/** The signed-in buyer's own bids on an item (same as buyers lotBids). */
export async function readMyLotBids(
  baseUrl: string,
  options: { accessToken: string; deviceId: string },
  lotId: string,
  page: PageInput = {},
) {
  const url = withPage(
    new URL(`/buyers/lots/${encodeURIComponent(lotId)}/my-bids`, baseUrl),
    page,
  );
  return buyerBidPageSchema.parse(
    await read(
      url,
      {
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.accessToken}`,
          'X-Device-Id': options.deviceId,
        },
      },
      10000,
    ),
  );
}
