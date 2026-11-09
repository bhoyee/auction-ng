import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  liveMonitorPrefix,
  LIVE_PRESENCE_LEASE_MS,
} from '../packages/shared/src/admin-live-schemas';
import { LivePresence } from '../apps/realtime/src/live-presence';
import { readLivePresence } from '../apps/api/src/staff-admin/live-presence-reader';
import { monitorBidderKey } from '../apps/api/src/staff-admin/live-bid-projection';

const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { createClient } =
  require('redis') as typeof import('../apps/api/node_modules/redis');
const redis = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
});
beforeAll(async () => {
  redis.on('error', () => {});
  await redis.connect();
});
afterAll(async () => {
  if (redis.isOpen) await redis.quit();
});
const peer = () => ({
  socketId: randomUUID(),
  userId: randomUUID(),
  deviceId: randomUUID(),
});

it('counts distinct authenticated buyers across devices and measures who bid today', async () => {
  const namespace = `test:presence:${randomUUID()}:`;
  const presence = new LivePresence(redis, namespace);
  const a = peer(),
    b = { ...peer(), userId: a.userId },
    c = peer();
  await presence.connect(a);
  await presence.connect(b);
  const now = await presence.connect(c);
  const day = new Date(now + 3600000).toISOString().slice(0, 10);
  await redis.sAdd(
    liveMonitorPrefix(namespace) + 'bids:bidders:' + day,
    monitorBidderKey(a.userId),
  );
  expect(await readLivePresence(redis, namespace, now)).toMatchObject({
    online: 2,
    haveBid: 1,
    recovered: 0,
  });
  await presence.disconnect(a, 'client namespace disconnect');
  expect(
    await readLivePresence(redis, namespace, await presence.heartbeat([b, c])),
  ).toMatchObject({ online: 2 });
  const stored = JSON.stringify(
    await redis.hGetAll(presence.prefix + 'buyers'),
  );
  expect(stored).not.toContain(a.userId);
  expect(stored).not.toContain(a.deviceId);
});

it('counts an unexpected recovered connection once across concurrent reconnects', async () => {
  const namespace = `test:presence:${randomUUID()}:`;
  const presence = new LivePresence(redis, namespace),
    a = peer();
  await presence.connect(a);
  await presence.disconnect(a, 'transport close');
  const times = await Promise.all([
    presence.connect({ ...a, socketId: randomUUID() }),
    presence.connect({ ...a, socketId: randomUUID() }),
  ]);
  expect(
    await readLivePresence(redis, namespace, Math.max(...times)),
  ).toMatchObject({ online: 1, recovered: 1 });
  await presence.disconnect(a, 'client namespace disconnect');
  const now = await presence.connect(a);
  expect(await readLivePresence(redis, namespace, now)).toMatchObject({
    recovered: 1,
  });
});

it('reports missing, stale and corrupted telemetry as unavailable, never zero', async () => {
  const namespace = `test:presence:${randomUUID()}:`;
  const presence = new LivePresence(redis, namespace);
  expect(await readLivePresence(redis, namespace, Date.now())).toBeNull();
  const now = await presence.heartbeat([]);
  expect(await readLivePresence(redis, namespace, now)).toMatchObject({
    online: 0,
  });
  expect(
    await readLivePresence(redis, namespace, now + LIVE_PRESENCE_LEASE_MS),
  ).toBeNull();
  await redis.set(presence.prefix + 'observed', '-1');
  expect(await readLivePresence(redis, namespace, now)).toBeNull();
});

it('rejects malformed Redis types before changing a presence lease', async () => {
  const namespace = `test:presence:${randomUUID()}:`;
  const presence = new LivePresence(redis, namespace);
  await redis.sAdd(presence.prefix + 'heartbeat', 'invalid');
  await expect(presence.connect(peer())).rejects.toThrow(
    'Presence telemetry unavailable',
  );
  expect(await redis.exists(presence.prefix + 'leases')).toBe(0);
});
