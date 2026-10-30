import { z } from 'zod';
export function paymentReturnUrl(
  kind: 'wallet' | 'wallet_transfer' | 'purchase',
  id: string,
) {
  z.uuid().parse(id);
  const origin = new URL(
    process.env.PAYMENT_RETURN_ORIGIN ?? 'http://localhost:3300',
  );
  const local = ['localhost', '127.0.0.1'].includes(origin.hostname);
  if (
    (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local)) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw Error(
      'PAYMENT_RETURN_ORIGIN must be a trusted HTTPS origin (HTTP loopback is allowed for local testing).',
    );
  const url = new URL('/payments/return', origin);
  url.searchParams.set('kind', kind);
  url.searchParams.set('id', id);
  return url.href;
}
