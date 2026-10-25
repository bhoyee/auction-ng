import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const baseUrl = new URL(process.argv[2] ?? 'http://localhost:4000');
const inboxUrl = new URL(process.argv[3] ?? 'http://localhost:8025');
for (const url of [baseUrl, inboxUrl])
  if (!['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('This smoke check is only for local services.');
const deviceId = randomUUID();
const device = { client: 'mobile', deviceId };
const email = `smoke-${randomUUID()}@example.test`;
async function post(path, body) {
  const response = await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200, `Unexpected status at ${path}`);
  return response.json();
}
try {
  const challenge = await post('/auth/request-code', { ...device, email });
  const search = new URL('/api/v1/search', inboxUrl);
  search.searchParams.set('query', `to:${email}`);
  const messages = await (
    await fetch(search, { signal: AbortSignal.timeout(5000) })
  ).json();
  const messageId = messages.messages?.[0]?.ID;
  assert.ok(messageId, 'The local test email was not captured.');
  const message = await (
    await fetch(
      new URL(`/api/v1/message/${encodeURIComponent(messageId)}`, inboxUrl),
      { signal: AbortSignal.timeout(5000) },
    )
  ).json();
  const code = message.Text?.match(/\b\d{6}\b/)?.[0];
  assert.ok(code, 'The test email has no sign-in code.');
  assert.ok(
    message.HTML?.includes('Your sign-in code'),
    'The captured email has no branded HTML version.',
  );
  assert.ok(
    message.HTML?.includes(code),
    'The HTML email is missing the sign-in code.',
  );
  const session = await post('/auth/verify-code', {
    ...device,
    challengeId: challenge.challengeId,
    code,
  });
  assert.equal(session.user.emailVerified, true);
  assert.equal(session.user.phoneVerified, false);
  const profile = await fetch(new URL('/auth/profile', baseUrl), {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'X-Device-Id': deviceId,
    },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(profile.status, 200);
  const walletHeaders = {
    Authorization: `Bearer ${session.accessToken}`,
    'X-Device-Id': deviceId,
    'Content-Type': 'application/json',
  };
  const opened = await fetch(new URL('/wallet', baseUrl), {
    method: 'POST',
    headers: walletHeaders,
    body: '{}',
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(opened.status, 200);
  const wallet = await opened.json();
  assert.equal(wallet.availableKobo, 0);
  assert.equal(wallet.heldKobo, 0);
  assert.equal(wallet.totalKobo, 0);
  const balance = await fetch(new URL('/wallet', baseUrl), {
    headers: walletHeaders,
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(balance.status, 200);
  assert.deepEqual(await balance.json(), wallet);
  const history = await fetch(new URL('/wallet/history?limit=20', baseUrl), {
    headers: walletHeaders,
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(history.status, 200);
  assert.deepEqual(await history.json(), { items: [], nextCursor: null });
  const quote = await fetch(new URL('/payments/quote', baseUrl), {
    method: 'POST',
    headers: walletHeaders,
    body: JSON.stringify({ transferKobo: 1000000 }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(quote.status, 200);
  assert.deepEqual(await quote.json(), {
    transferKobo: 1000000,
    feeKobo: 10000,
    creditKobo: 990000,
    currency: 'NGN',
    feePolicy: 'paystack-dva-v1',
  });
  const rotated = await post('/auth/refresh', {
    ...device,
    refreshToken: session.refreshToken,
  });
  assert.notEqual(rotated.refreshToken, session.refreshToken);
  const logout = await fetch(new URL('/auth/logout', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...device, refreshToken: rotated.refreshToken }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(logout.status, 204);
  console.log(
    'Local email capture, sign-in, empty wallet, history, refresh and logout passed. Phone remains unverified.',
  );
} catch {
  console.error(
    'Local authentication check failed. Check that migrations, encryption keys, API local auth and Mailpit are configured.',
  );
  process.exitCode = 1;
}
