import {
  cataloguePageSchema,
  catalogueDetailSchema,
} from '@auction-ng/shared/catalogue-schemas';
import {
  preBidChangeSchema,
  preBidCancelSchema,
  preBidResponseSchema,
  preBidScheduleSchema,
  preBidScheduleResultSchema,
  type PreBidChange,
  type PreBidCancel,
  type PreBidSchedule,
} from '@auction-ng/shared/prebid-schemas';
import { ApiError, apiErrorFromResponse } from './auth';
async function json(
  baseUrl: string,
  path: string,
  options?: { accessToken: string; deviceId: string },
  body?: unknown,
) {
  const response = await fetch(new URL(path, baseUrl), {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: options
      ? {
          Authorization: 'Bearer ' + options.accessToken,
          'X-Device-Id': options.deviceId,
          'Content-Type': 'application/json',
        }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const value: unknown = await response
      .clone()
      .json()
      .catch(() => undefined);
    if (
      value &&
      typeof value === 'object' &&
      'code' in value &&
      value.code === 'INSUFFICIENT_FUNDS'
    )
      throw new ApiError(response.status, 'INSUFFICIENT_FUNDS');
    throw await apiErrorFromResponse(response);
  }
  return response.json() as Promise<unknown>;
}
export async function readUpcomingDeals(baseUrl: string, cursor?: string) {
  return cataloguePageSchema.parse(
    await json(
      baseUrl,
      '/upcoming-lots?limit=24' +
        (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
    ),
  );
}
/** Coming soon, date to be announced: view and watch only (2026-11-14). */
export async function readComingSoonDeals(
  baseUrl: string,
  cursor?: string,
  limit = 24,
) {
  return cataloguePageSchema.parse(
    await json(
      baseUrl,
      `/coming-soon-lots?limit=${Math.min(50, Math.max(1, limit))}` +
        (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
    ),
  );
}
export async function readUpcomingLot(baseUrl: string, id: string) {
  return catalogueDetailSchema.parse(
    await json(baseUrl, '/lots/' + encodeURIComponent(id)),
  );
}
export function createPreBidClient(
  baseUrl: string,
  options: { accessToken: string; deviceId: string },
) {
  return {
    read: async (id: string) =>
      preBidResponseSchema.parse(
        await json(baseUrl, `/lots/${encodeURIComponent(id)}/prebid`, options),
      ),
    change: async (id: string, input: PreBidChange) =>
      preBidResponseSchema.parse(
        await json(
          baseUrl,
          `/lots/${encodeURIComponent(id)}/prebid`,
          options,
          preBidChangeSchema.parse(input),
        ),
      ),
    cancel: async (id: string, input: PreBidCancel) =>
      preBidResponseSchema.parse(
        await json(
          baseUrl,
          `/lots/${encodeURIComponent(id)}/prebid/cancel`,
          options,
          preBidCancelSchema.parse(input),
        ),
      ),
    schedule: async (id: string, input: PreBidSchedule) =>
      preBidScheduleResultSchema.parse(
        await json(
          baseUrl,
          `/admin/lots/${encodeURIComponent(id)}/schedule`,
          options,
          preBidScheduleSchema.parse(input),
        ),
      ),
  };
}
