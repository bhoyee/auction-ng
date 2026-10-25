import { healthSchema, type HealthResponse } from '@auction-ng/shared';
export { createAuthClient, ApiError, type AuthClientOptions } from './auth';
export { createWalletClient } from './wallet';
export { createPaymentClient } from './payments';
export { createCatalogueClient } from './catalogue';
export { createSearchClient } from './search';

export async function getHealth(baseUrl: string): Promise<HealthResponse> {
  const response = await fetch(new URL('/health', baseUrl), {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Health check failed (${response.status})`);
  return healthSchema.parse(await response.json());
}
