import { afterAll, beforeAll, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import {
  io,
  type Socket,
} from '../packages/api-client/node_modules/socket.io-client';
import { createRealtime } from '../apps/realtime/src/server';
import { liveMonitorPrefix } from '../packages/shared/src';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { createClient } =
  require('redis') as typeof import('../apps/api/node_modules/redis');
const redis = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
});
const prefix = `test:live-room:${randomUUID()}:`,
  sessions = { buyer: randomUUID(), staff: randomUUID() },
  staffId = randomUUID();
let gateway: Awaited<ReturnType<typeof createRealtime>>, origin: string;
const clients: Socket[] = [];
beforeAll(async () => {
  redis.on('error', () => {});
  await redis.connect();
  gateway = await createRealtime(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    {
      namespace: prefix,
      authenticate: async (credentials) => ({
        userId: credentials.accessToken.startsWith('s')
          ? staffId
          : randomUUID(),
        sessionId: credentials.accessToken.startsWith('s')
          ? sessions.staff
          : sessions.buyer,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        ...(credentials.accessToken.startsWith('s')
          ? { staffWorkspace: true, staffLive: true }
          : {}),
      }),
    },
  );
  await new Promise<void>((resolve) =>
    gateway.http.listen(0, '127.0.0.1', resolve),
  );
  const address = gateway.http.address();
  if (!address || typeof address === 'string')
    throw Error('No test gateway port');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  clients.forEach((socket) => socket.disconnect());
  await gateway?.close();
  if (redis.isOpen) await redis.quit();
});
async function connect(role: 'buyer' | 'staff') {
  const socket = io(origin, {
    auth: {
      accessToken: (role === 'staff' ? 's' : 'b').repeat(43),
      deviceId: randomUUID(),
    },
    transports: ['websocket'],
    forceNew: true,
  });
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}
it('rejects buyers and delivers only validated monitor signals and public prices to permitted staff', async () => {
  const buyer = await connect('buyer'),
    staff = await connect('staff');
  expect(
    await buyer.timeout(2000).emitWithAck('admin:live:subscribe', {}),
  ).toEqual({ ok: false, code: 'forbidden' });
  expect(
    await staff.timeout(2000).emitWithAck('admin:live:subscribe', {}),
  ).toMatchObject({ ok: true });
  const buyerEvents: unknown[] = [];
  buyer.on('admin:live:changed', (value) => buyerEvents.push(value));
  const signal = { revision: 1, serverTime: new Date().toISOString() };
  const received = new Promise<unknown>((resolve) =>
    staff.once('admin:live:changed', resolve),
  );
  await redis.publish(
    liveMonitorPrefix(prefix) + 'updates',
    JSON.stringify(signal),
  );
  expect(await received).toEqual(signal);
  expect(buyerEvents).toHaveLength(0);
  const patch = new Promise<Record<string, unknown>>((resolve) =>
    staff.once('admin:live:lot', resolve),
  );
  await redis.publish(
    prefix + 'personal-updates',
    JSON.stringify({
      lotId: randomUUID(),
      streamId: '1-0',
      currentPriceKobo: 60000,
      endsAt: Date.now() + 60000,
      serverTime: Date.now(),
      leaderId: staffId,
      previousLeaderId: null,
      requesterId: randomUUID(),
    }),
  );
  const value = await patch;
  expect(value.currentPriceKobo).toBe(60000);
  expect(value).not.toHaveProperty('leaderId');
  expect(value).not.toHaveProperty('requesterId');
  expect(value).not.toHaveProperty('maxKobo');
});
it('fences a revoked staff session before the next monitor signal', async () => {
  const staff = await connect('staff');
  await staff.timeout(2000).emitWithAck('admin:live:subscribe', {});
  const disconnected = new Promise<void>((resolve) =>
    staff.once('disconnect', () => resolve()),
  );
  await redis.hSet(prefix + 'revoked', sessions.staff, '1');
  await redis.publish(
    liveMonitorPrefix(prefix) + 'updates',
    JSON.stringify({ revision: 2, serverTime: new Date().toISOString() }),
  );
  await disconnected;
  expect(staff.connected).toBe(false);
});
