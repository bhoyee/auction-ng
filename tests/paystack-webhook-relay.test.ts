import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createWebhookRelay } from '../scripts/paystack-webhook-relay';
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  servers.length = 0;
});
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No local port');
  return `http://127.0.0.1:${address.port}`;
}
it('forwards exact signed bytes only to the webhook, without forwarding credentials or other routes', async () => {
  const received: {
    body: Buffer;
    signature?: string;
    authorization?: string;
    url?: string;
  }[] = [];
  const upstream = await listen(
    createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      received.push({
        body: Buffer.concat(chunks),
        signature: req.headers['x-paystack-signature'] as string,
        authorization: req.headers.authorization,
        url: req.url,
      });
      res.writeHead(200).end('{"received":true}');
    }),
  );
  const relay = await listen(createWebhookRelay(upstream));
  const body =
    '{ "event": "charge.success", "data": {"reference":"synthetic"} }\n';
  const signature = 'a'.repeat(128);
  const headers = {
    'Content-Type': 'application/json',
    'x-paystack-signature': signature,
    Authorization: 'Bearer do-not-forward',
  };
  expect(
    (
      await fetch(`${relay}/payments/webhook`, {
        method: 'POST',
        headers,
        body,
      })
    ).status,
  ).toBe(200);
  expect(received[0]?.body).toEqual(Buffer.from(body));
  expect(received[0]).toMatchObject({
    signature,
    url: '/payments/webhook',
    authorization: undefined,
  });
  for (const path of [
    '/auth/refresh',
    '/wallet',
    '/docs',
    '/payments/reconcile',
    '/payments/webhook?other=1',
  ])
    expect(
      (await fetch(relay + path, { method: 'POST', headers, body })).status,
    ).toBe(404);
  expect((await fetch(relay + '/payments/webhook')).status).toBe(404);
  expect(
    (
      await fetch(relay + '/payments/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    ).status,
  ).toBe(401);
  expect(received).toHaveLength(1);
});
it('rejects oversized bodies and preserves retryable API errors', async () => {
  let calls = 0;
  const upstream = await listen(
    createServer((_req, res) => {
      calls++;
      res.writeHead(503).end('sensitive internal details');
    }),
  );
  const relay = await listen(createWebhookRelay(upstream));
  const headers = {
    'Content-Type': 'application/json',
    'x-paystack-signature': 'a'.repeat(128),
  };
  expect(
    (
      await fetch(relay + '/payments/webhook', {
        method: 'POST',
        headers,
        body: 'x'.repeat(102401),
      })
    ).status,
  ).toBe(413);
  const response = await fetch(relay + '/payments/webhook', {
    method: 'POST',
    headers,
    body: '{}',
  });
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('sensitive');
  expect(calls).toBe(1);
});
