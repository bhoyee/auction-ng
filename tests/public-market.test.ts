import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createRealtime } from '../apps/realtime/src/server';
import { createRealtimeClient } from '../packages/api-client/src/realtime';
import { BidController } from '../apps/api/src/bids/bid-controller';
import type { BidService } from '../apps/api/src/bids/bid-service';
import type { AuthService } from '../apps/api/src/auth/auth-service';
import type { ServerResponse } from 'node:http';

const apiRequire = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
apiRequire('reflect-metadata');
const { createClient } = apiRequire(
  'redis',
) as typeof import('../apps/api/node_modules/redis');
const clientRequire = createRequire(
  new URL('../packages/api-client/package.json', import.meta.url),
);
const { io } = clientRequire(
  'socket.io-client',
) as typeof import('../packages/api-client/node_modules/socket.io-client');

it('serves public prices separately, strips personal fields, reconnects and keeps authenticated sockets protected', async () => {
  const prefix = `test:public-market:${randomUUID()}:`;
  const id = randomUUID();
  let price = 50000;
  const gateway = await createRealtime(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    {
      namespace: prefix,
      publicSnapshot: async (lotId) => {
        if (lotId !== id) throw new Error('Not public');
        return {
          lotId,
          currentPriceKobo: price,
          endsAt: new Date(Date.now() + 60_000).toISOString(),
          serverTime: new Date().toISOString(),
          streamId: '0-0',
          isLeader: false,
        };
      },
    },
  );
  await new Promise<void>((resolve) =>
    gateway.http.listen(0, '127.0.0.1', resolve),
  );
  const address = gateway.http.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  const base = `http://127.0.0.1:${address.port}`;
  const client = createRealtimeClient(base, {});
  const raw = io(`${base}/public`, { transports: ['websocket'] });
  const protectedSocket = io(base, {
    transports: ['websocket'],
    autoConnect: false,
  });
  const redis = createClient({
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  try {
    await redis.connect();
    const denied = new Promise<void>((resolve) =>
      protectedSocket.on('connect_error', () => resolve()),
    );
    protectedSocket.connect();
    const release = client.watchLot(id);
    await expect.poll(() => client.getSnapshot(id).status).toBe('live');
    expect(client.getSnapshot(id).lot?.currentPriceKobo).toBe(price);
    await denied;
    expect(protectedSocket.connected).toBe(false);
    if (!raw.connected)
      await new Promise<void>((resolve) => raw.once('connect', resolve));
    const unknown: unknown = await raw
      .timeout(3000)
      .emitWithAck('lot:subscribe', { lotId: randomUUID() });
    expect(unknown).toEqual({ ok: false, code: 'unavailable' });
    const invalid: unknown = await raw
      .timeout(3000)
      .emitWithAck('lot:subscribe', { lotId: id, maxKobo: 1 });
    expect(invalid).toEqual({ ok: false, code: 'invalid' });
    const subscription: unknown = await raw
      .timeout(3000)
      .emitWithAck('lot:subscribe', { lotId: id });
    expect(subscription).toMatchObject({ ok: true });
    const received = new Promise<unknown>((resolve) =>
      raw.once('lot:update', resolve),
    );
    price = 75000;
    await redis.publish(
      `${prefix}personal-updates`,
      JSON.stringify({
        lotId: id,
        streamId: '100-1',
        currentPriceKobo: price,
        endsAt: Date.now() + 60_000,
        serverTime: Date.now(),
        leaderId: randomUUID(),
        previousLeaderId: randomUUID(),
        requesterId: randomUUID(),
      }),
    );
    const update = await received;
    expect(Object.keys(update as object).sort()).toEqual([
      'currentPriceKobo',
      'endsAt',
      'isLeader',
      'lotId',
      'serverTime',
      'streamId',
    ]);
    expect(update).toMatchObject({ currentPriceKobo: price, isLeader: false });
    await expect
      .poll(() => client.getSnapshot(id).lot?.currentPriceKobo)
      .toBe(price);
    client.reauthenticate();
    await expect.poll(() => client.getSnapshot(id).status).toBe('live');
    expect(client.getSnapshot(id).lot?.currentPriceKobo).toBe(price);
    release();
  } finally {
    client.close();
    raw.disconnect();
    protectedSocket.disconnect();
    await redis.close();
    await gateway.close();
  }
});

it('validates public snapshot inputs, disables caching and passes no buyer identity', async () => {
  const calls: unknown[] = [];
  const bids = {
    snapshot: async (...args: unknown[]) => {
      calls.push(args);
      return {};
    },
  } as unknown as BidService;
  const controller = new BidController(bids, {} as AuthService);
  const headers: unknown[] = [];
  const response = {
    setHeader: (...args: unknown[]) => headers.push(args),
  } as unknown as ServerResponse;
  const id = randomUUID();
  await controller.publicSnapshot(id, {}, response);
  expect(calls).toEqual([[null, id]]);
  expect(headers).toEqual([['Cache-Control', 'no-store']]);
  expect(() => controller.publicSnapshot('bad', {}, response)).toThrow();
  expect(() =>
    controller.publicSnapshot(id, { accessToken: 'bad' }, response),
  ).toThrow();
});
