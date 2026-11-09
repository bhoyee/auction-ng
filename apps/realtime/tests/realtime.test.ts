import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createRealtime } from '../src/server';
import { createRealtimeClient } from '../../../packages/api-client/src/realtime';
import { liveLotSchema } from '../../../packages/shared/src/realtime';

const require = createRequire(
  new URL('../../../packages/api-client/package.json', import.meta.url),
);
const { io } =
  require('socket.io-client') as typeof import('../../../packages/api-client/node_modules/socket.io-client');
const redisRequire = createRequire(new URL('../package.json', import.meta.url));
const { createClient } = redisRequire(
  'redis',
) as typeof import('../node_modules/redis');
const redis = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
});
const namespace = `test:realtime:${randomUUID()}:`;
const lotId = randomUUID();
const leaderId = randomUUID();
const state = {
  open: true,
  startPriceKobo: 50000,
  currentPriceKobo: 50000,
  leader: { bidderId: leaderId, maxKobo: 1000000 },
  endsAt: Date.now() + 300000,
  streamId: '1-0',
};
let gateway: Awaited<ReturnType<typeof createRealtime>>;
let base: string;
beforeAll(async () => {
  redis.on('error', () => {});
  await redis.connect();
  await redis.set(`${namespace}lot:${lotId}`, JSON.stringify(state));
  gateway = await createRealtime(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    {
      namespace,
      authenticate: async (credentials) => {
        if (credentials.accessToken !== 'x'.repeat(43))
          throw new Error('Denied');
        return {
          userId: credentials.deviceId,
          sessionId: credentials.deviceId,
          expiresAt: new Date(Date.now() + 900000).toISOString(),
        };
      },
      snapshot: async (credentials, id) => {
        const current = JSON.parse(
          String(await redis.get(`${namespace}lot:${id}`)),
        ) as typeof state;
        return liveLotSchema.parse({
          lotId: id,
          currentPriceKobo: current.currentPriceKobo,
          endsAt: new Date(current.endsAt).toISOString(),
          streamId: current.streamId,
          serverTime: new Date().toISOString(),
          isLeader: current.leader.bidderId === credentials.deviceId,
        });
      },
    },
  );
  await new Promise<void>((resolve) =>
    gateway.http.listen(0, '127.0.0.1', resolve),
  );
  const address = gateway.http.address();
  if (!address || typeof address === 'string')
    throw new Error('No gateway port');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await gateway?.close();
  if (redis.isOpen) await redis.quit();
});
async function until(check: () => boolean, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Realtime condition not reached');
}
async function update(
  sequence: number,
  price: number,
  previousLeaderId = leaderId,
  newLeaderId = randomUUID(),
) {
  state.streamId = `${sequence}-0`;
  state.currentPriceKobo = price;
  state.leader = { bidderId: newLeaderId, maxKobo: price + 100000 };
  await redis.set(`${namespace}lot:${lotId}`, JSON.stringify(state));
  await redis.publish(
    `${namespace}personal-updates`,
    JSON.stringify({
      lotId,
      streamId: state.streamId,
      currentPriceKobo: price,
      endsAt: state.endsAt,
      serverTime: Date.now(),
      previousLeaderId,
      leaderId: newLeaderId,
      requesterId: newLeaderId,
    }),
  );
}
it('rejects missing credentials and cross-user subscription fields', async () => {
  const invalid = io(base, { auth: {}, reconnection: false });
  try {
    await new Promise<void>((resolve) =>
      invalid.once('connect_error', () => resolve()),
    );
    expect(invalid.connected).toBe(false);
  } finally {
    invalid.disconnect();
  }
  const socket = io(base, {
    auth: { accessToken: 'x'.repeat(43), deviceId: randomUUID() },
    reconnection: false,
  });
  try {
    await new Promise<void>((resolve) => socket.once('connect', resolve));
    const result: unknown = await socket
      .timeout(5000)
      .emitWithAck('lot:subscribe', { lotId, userId: leaderId });
    expect(result).toMatchObject({ ok: false, code: 'invalid' });
  } finally {
    socket.disconnect();
  }
});
it('sends private leader/outbid messages without revealing identities or spending limits', async () => {
  const events: unknown[] = [];
  const client = createRealtimeClient(base, {
    credentials: () => ({ accessToken: 'x'.repeat(43), deviceId: leaderId }),
    onOutbid: (event) => events.push(event),
  });
  const stop = client.watchLot(lotId);
  try {
    await until(() => client.getSnapshot(lotId).status === 'live');
    expect(client.getSnapshot(lotId).lot?.isLeader).toBe(true);
    await update(2, 60000);
    await until(() => events.length === 1);
    expect(client.getSnapshot(lotId).lot?.isLeader).toBe(false);
    expect(JSON.stringify(client.getSnapshot(lotId))).not.toContain('maxKobo');
    expect(JSON.stringify(events)).not.toContain(leaderId);
    await redis.publish(
      `${namespace}personal-updates`,
      JSON.stringify({
        lotId,
        streamId: '1-0',
        currentPriceKobo: 50000,
        endsAt: state.endsAt,
        serverTime: Date.now(),
        previousLeaderId: leaderId,
        leaderId: state.leader.bidderId,
        requesterId: state.leader.bidderId,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(client.getSnapshot(lotId).lot?.currentPriceKobo).toBe(60000);
    expect(events).toHaveLength(1);
  } finally {
    stop();
    client.close();
  }
});
it('rejects unapproved browser origins', async () => {
  const socket = io(base, {
    auth: { accessToken: 'x'.repeat(43), deviceId: randomUUID() },
    extraHeaders: { Origin: 'https://unapproved.example.test' },
    reconnection: false,
  });
  try {
    await new Promise<void>((resolve) =>
      socket.once('connect_error', () => resolve()),
    );
    expect(socket.connected).toBe(false);
  } finally {
    socket.disconnect();
  }
});
it('bounds 51 simultaneous subscriptions to 50 rooms', async () => {
  const ids = Array.from({ length: 51 }, () => randomUUID());
  await Promise.all(
    ids.map((id) => redis.set(`${namespace}lot:${id}`, JSON.stringify(state))),
  );
  const socket = io(base, {
    auth: { accessToken: 'x'.repeat(43), deviceId: randomUUID() },
    reconnection: false,
  });
  try {
    await new Promise<void>((resolve) => socket.once('connect', resolve));
    const replies: unknown[] = await Promise.all(
      ids.map((id) =>
        socket.timeout(5000).emitWithAck('lot:subscribe', { lotId: id }),
      ),
    );
    expect(
      replies.filter(
        (reply) =>
          reply &&
          typeof reply === 'object' &&
          'ok' in reply &&
          reply.ok === true,
      ),
    ).toHaveLength(50);
    expect(
      replies.filter(
        (reply) =>
          reply &&
          typeof reply === 'object' &&
          'ok' in reply &&
          reply.ok === false,
      ),
    ).toHaveLength(1);
  } finally {
    socket.disconnect();
  }
});
it('clears stale prices, reconnects, resubscribes and fetches the current snapshot', async () => {
  const client = createRealtimeClient(base, {
    credentials: () => ({
      accessToken: 'x'.repeat(43),
      deviceId: randomUUID(),
    }),
  });
  const stop = client.watchLot(lotId);
  try {
    await until(() => client.getSnapshot(lotId).status === 'live');
    for (const socket of gateway.io.of('/').sockets.values())
      socket.conn.close();
    await until(() => client.getSnapshot(lotId).status !== 'live');
    expect(client.getSnapshot(lotId).lot).toBeNull();
    await update(3, 70000);
    await until(
      () =>
        client.getSnapshot(lotId).status === 'live' &&
        client.getSnapshot(lotId).lot?.currentPriceKobo === 70000,
    );
  } finally {
    stop();
    client.close();
  }
});
it('delivers an actual Redis price change to 1,000 socket viewers below p95 500 ms', async () => {
  const sockets: ReturnType<typeof io>[] = [];
  try {
    for (let batch = 0; batch < 20; batch++)
      await Promise.all(
        Array.from({ length: 50 }, async () => {
          const socket = io(base, {
            auth: { accessToken: 'x'.repeat(43), deviceId: randomUUID() },
            transports: ['websocket'],
            reconnection: false,
          });
          sockets.push(socket);
          await new Promise<void>((resolve, reject) => {
            socket.once('connect', resolve);
            socket.once('connect_error', reject);
          });
          const ready: unknown = await socket
            .timeout(10000)
            .emitWithAck('lot:subscribe', { lotId });
          expect(ready).toMatchObject({ ok: true });
        }),
      );
    const timings: number[] = [];
    let start = 0;
    const delivered = Promise.all(
      sockets.map(
        (socket) =>
          new Promise<void>((resolve) =>
            socket.once('lot:update', () => {
              timings.push(performance.now() - start);
              resolve();
            }),
          ),
      ),
    );
    start = performance.now();
    await update(4, 80000);
    await delivered;
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.floor(timings.length * 0.95)] ?? Infinity;
    console.log(`1,000-viewer Redis-to-socket p95: ${p95.toFixed(2)} ms.`);
    expect(timings).toHaveLength(1000);
    expect(p95).toBeLessThan(500);
  } finally {
    sockets.forEach((socket) => socket.disconnect());
  }
}, 120000);
