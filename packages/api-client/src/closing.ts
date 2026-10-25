import { closingReportSchema, pickupPassSchema } from '@auction-ng/shared';
export async function readPickupPass(
  baseUrl: string,
  invoiceId: string,
  accessToken: string,
  deviceId: string,
) {
  const id = pickupPassSchema.shape.invoiceId.parse(invoiceId);
  pickupPassSchema.shape.invoiceId.parse(deviceId);
  const response = await fetch(
    new URL(`/invoices/${id}/pickup-pass`, baseUrl),
    {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Device-Id': deviceId,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new Error(
      'Pickup pass unavailable. Sign in and check that your invoice is paid.',
    );
  return pickupPassSchema.parse(await response.json());
}
export function createClosingClient(baseUrl: string, token: string) {
  const api = new URL(baseUrl);
  if (
    token.length < 32 ||
    api.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', 'api'].includes(api.hostname) ||
    api.username ||
    api.password ||
    api.pathname !== '/' ||
    api.search ||
    api.hash
  )
    throw new Error('Invalid private closing configuration.');
  return async () => {
    const response = await fetch(new URL('/internal/lots/close', api), {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(180000),
    });
    if (!response.ok) throw new Error('Closing batch unavailable.');
    return closingReportSchema.parse(await response.json());
  };
}
