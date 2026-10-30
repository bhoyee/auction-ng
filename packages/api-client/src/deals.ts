import {
  dealListInputSchema,
  dealPageSchema,
  type DealListInput,
} from '@auction-ng/shared';
import { ApiError } from './auth';
export async function browseDeals(
  baseUrl: string,
  input: DealListInput,
  signal?: AbortSignal,
) {
  const parsed = dealListInputSchema.parse(input),
    url = new URL('/browse-lots', baseUrl);
  for (const [key, value] of Object.entries(parsed))
    if (
      value !== undefined &&
      (!Array.isArray(value) || value.length || key === 'conditions')
    )
      url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'error',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new ApiError(response.status);
  return dealPageSchema.parse(await response.json());
}
