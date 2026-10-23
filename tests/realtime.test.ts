import { afterAll, beforeAll, expect, it } from 'vitest';
import { createRealtime } from '../apps/realtime/src/server';

let server: Awaited<ReturnType<typeof createRealtime>>;
let baseUrl: string;

beforeAll(async () => {
  server = await createRealtime(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
  );
  await new Promise<void>((resolve) =>
    server.http.listen(0, '127.0.0.1', resolve),
  );
  const address = server.http.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing HTTP address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await server?.close();
});

it('reports ready after connecting both Redis clients', async () => {
  const response = await fetch(`${baseUrl}/health`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

it('serves a Socket.IO handshake', async () => {
  const response = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('"sid"');
});

it('does not expose unimplemented endpoints', async () => {
  expect((await fetch(`${baseUrl}/lots`)).status).toBe(404);
});
