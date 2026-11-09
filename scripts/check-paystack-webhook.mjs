import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHmac, randomUUID } from 'node:crypto';
const key = parseEnv(readFileSync('.env', 'utf8')).PAYSTACK_SECRET_KEY ?? '';
if (!/^sk_test_[A-Za-z0-9]+$/.test(key))
  throw Error('A Paystack test key in .env is required.');
const origin = new URL(process.argv[2]);
if (
  origin.protocol !== 'https:' ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash ||
  !['/', '/payments/webhook'].includes(origin.pathname)
)
  throw Error('Supply the HTTPS tunnel origin or its /payments/webhook URL.');
const provider = await fetch('https://api.paystack.co/balance', {
  headers: { Authorization: `Bearer ${key}` },
  redirect: 'error',
  signal: AbortSignal.timeout(15000),
});
if (!provider.ok || (await provider.json()).status !== true)
  throw Error(
    'Paystack did not accept the test credentials. Check your test key and IP allowlist.',
  );
console.log('Paystack test credentials accepted.');
// Unknown signed events are ignored: this connection check cannot credit a wallet.
const raw = JSON.stringify({
  event: 'auction_ng.connection_check',
  data: { reference: randomUUID() },
});
const signature = createHmac('sha512', key).update(raw).digest('hex');
for (const [path, sig, expected] of [
  ['/payments/webhook', signature, 200],
  ['/payments/webhook', '0'.repeat(128), 401],
  ['/auth/refresh', signature, 404],
]) {
  const result = await fetch(new URL(path, origin), {
    method: 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      'x-paystack-signature': sig,
    },
    body: raw,
    signal: AbortSignal.timeout(30000),
  });
  await result.body?.cancel();
  if (result.status !== expected)
    throw Error(
      `Connection check expected ${expected}, received ${result.status}.`,
    );
  console.log(`${path}: ${expected} as expected.`);
}
console.log(`Webhook URL: ${new URL('/payments/webhook', origin).href}`);
console.log(
  'Connection checks passed. No transaction was created and no wallet was credited.',
);
