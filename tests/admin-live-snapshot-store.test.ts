import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { LiveSnapshotStore } from '../apps/api/src/staff-admin/live-snapshot-store';
import { liveMonitorPrefix, type MonitorLot } from '../packages/shared/src';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { createClient } =
  require('redis') as typeof import('../apps/api/node_modules/redis');
const redis = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
});
const now = Date.now(),
  categoryId = randomUUID(),
  locationId = randomUUID();
function row(): MonitorLot {
  return {
    id: randomUUID(),
    reference: 'LV8Q2X7P',
    title: 'Synthetic snapshot test',
    thumbnail: null,
    categoryId,
    category: 'Phones',
    locationId,
    location: 'Lekki',
    runTimeMs: 86400000,
    endsAt: new Date(now + 60000).toISOString(),
    currentPriceKobo: 50000,
    bidCount: 0,
    watchers: 0,
    extensions: 0,
    leading: null,
    area: null,
    paused: false,
    remainingMs: null,
    revision: '0-0',
    streamId: '0-0',
    serverTime: new Date(now).toISOString(),
  };
}
const values = {
  summary: {
    serverTime: new Date(now).toISOString(),
    revision: now,
    count: 3000,
  },
  series: { points: [] },
  issues: { items: [] },
  filters: { locations: [], categories: [] },
};
beforeAll(async () => {
  redis.on('error', () => {});
  await redis.connect();
});
afterAll(async () => {
  if (redis.isOpen) await redis.quit();
});
it('writes only a small freshness signal when 3,000 item rows have not changed', async () => {
  const prefix = liveMonitorPrefix('test:store:' + randomUUID() + ':'),
    store = new LiveSnapshotStore(redis, prefix),
    rows = Array.from({ length: 3000 }, row);
  const first = await store.save({
    rows,
    closed: [],
    values,
    clock: { revision: now, serverTime: new Date(now).toISOString() },
  });
  expect(first.applied).toBe(true);
  const idle = await store.save({
    rows: rows.map((row) => ({
      ...row,
      serverTime: new Date(now + 1000).toISOString(),
    })),
    closed: [],
    values: {
      ...values,
      summary: {
        ...values.summary,
        serverTime: new Date(now + 1000).toISOString(),
        revision: now + 1000,
      },
    },
    clock: {
      revision: now + 1000,
      serverTime: new Date(now + 1000).toISOString(),
    },
  });
  expect(idle.commands).toBe(3);
  expect(await redis.hLen(store.key + ':rows')).toBe(3000);
  expect(
    await redis.zCard(store.key + ':order:' + categoryId + ':' + locationId),
  ).toBe(3000);
});
it('updates only changed rows, removes confirmed closures and rejects stale producers', async () => {
  const prefix = liveMonitorPrefix('test:store:' + randomUUID() + ':'),
    a = new LiveSnapshotStore(redis, prefix),
    b = new LiveSnapshotStore(redis, prefix),
    item = row();
  await a.save({
    rows: [item],
    closed: [],
    values,
    clock: { revision: now, serverTime: new Date(now).toISOString() },
  });
  const newer = { ...item, currentPriceKobo: 90000, streamId: '2-0' };
  await b.save({
    rows: [newer],
    closed: [],
    values,
    clock: { revision: now + 2, serverTime: new Date(now + 2).toISOString() },
  });
  expect(
    (
      await a.save({
        rows: [item],
        closed: [],
        values,
        clock: {
          revision: now + 1,
          serverTime: new Date(now + 1).toISOString(),
        },
      })
    ).applied,
  ).toBe(false);
  expect(
    JSON.parse((await redis.hGet(a.key + ':rows', item.id)) ?? 'null')
      .currentPriceKobo,
  ).toBe(90000);
  const closed = {
    id: item.id,
    reference: item.reference,
    title: item.title,
    winner: 'Ad***e',
    bidCount: 2,
    status: 'sold' as const,
    hammerKobo: 90000,
    closedAt: new Date(now + 3).toISOString(),
  };
  await b.save({
    rows: [],
    closed: [closed],
    values,
    clock: { revision: now + 3, serverTime: new Date(now + 3).toISOString() },
  });
  expect(await redis.hLen(b.key + ':rows')).toBe(0);
  expect(await redis.zCard(b.key + ':order:all:all')).toBe(0);
  expect(await redis.zCard(b.key + ':closed-order')).toBe(1);
});
