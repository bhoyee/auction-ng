import {
  auctionFeeQuoteSchema,
  auctionFeeSettingsSchema,
  auctionFeeUpdateSchema,
  type AuctionFeeUpdate,
} from '@auction-ng/shared/auction-fee-schemas';
import { ApiError } from './auth';
export async function readAuctionFees(baseUrl: string, lotId: string) {
  const response = await fetch(
    new URL('/lots/' + encodeURIComponent(lotId) + '/auction-fees', baseUrl),
    { cache: 'no-store', signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok) throw new ApiError(response.status);
  return auctionFeeQuoteSchema.parse(await response.json());
}
export function createAuctionFeeClient(
  baseUrl: string,
  options: { accessToken: string; deviceId: string },
) {
  async function request(input?: AuctionFeeUpdate) {
    const response = await fetch(new URL('/admin/auction-fees', baseUrl), {
      method: input ? 'POST' : 'GET',
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + options.accessToken,
        'X-Device-Id': options.deviceId,
        'Content-Type': 'application/json',
      },
      ...(input
        ? { body: JSON.stringify(auctionFeeUpdateSchema.parse(input)) }
        : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ApiError(response.status);
    return auctionFeeSettingsSchema.parse(await response.json());
  }
  return {
    read: () => request(),
    update: (input: AuctionFeeUpdate) => request(input),
  };
}
