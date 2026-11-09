import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  LiveBidProjection,
  liveBidMetric,
  monitorBidderKey,
} from '../apps/api/src/staff-admin/live-bid-projection';

const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { createClient } =
  require('redis') as typeof import('../apps/api/node_modules/redis');
const redis = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
});
const namespace = `test:live:${randomUUID()}:`;
const buyer = randomUUID();
const lot = randomUUID();
const now = Date.parse('2026-11-07T23:05:00Z');
const message = (at = now, extension = false) => ({
  lotId: lot,
  userId: buyer,
  maxKobo: '99999999',
  result: JSON.stringify({
    status: 'accepted',
    mode: 'direct',
    isLeader: true,
    serverTime: at,
    state: {
      startPriceKobo: 50000,
      currentPriceKobo: 70000,
      leader: { bidderId: buyer, maxKobo: 99999999 },
      endsAt: at + (extension ? 120000 : 3600000),
    },
  }),
});
beforeAll(async () => {
  redis.on('error', () => {});
  await redis.connect();
});
afterAll(async () => {
  if (redis.isOpen) await redis.quit();
});

it('removes private limits and replaces identifiers with a stable opaque bidder key', () => {
  const metric = liveBidMetric('123-1', message());
  expect(metric.bidder).toBe(monitorBidderKey(buyer));
  expect(JSON.stringify(metric)).not.toContain(buyer);
  expect(JSON.stringify(metric)).not.toContain('99999999');
  expect(metric.day).toBe('2026-11-08');
});

it('commits each batch once across concurrent refreshers and restarted consumers', async () => {
  const p = namespace + 'concurrency:';
  const projection = new LiveBidProjection(redis, p);
  await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      redis.xAdd(p + 'accepted', '*', message(now + i, i < 3)),
    ),
  );
  const results = await Promise.all(
    Array.from({ length: 8 }, () => new LiveBidProjection(redis, p).refresh()),
  );
  expect(results.reduce((sum, result) => sum + result.count, 0)).toBe(50);
  expect((await new LiveBidProjection(redis, p).refresh()).status).toBe('idle');
  const stats = await projection.read(now + 1000);
  expect(stats.bidsPerMinute).toBe(50);
  expect(stats.bidsPeak).toBe(50);
  expect(stats.extensionCount).toBe(3);
  expect(stats.extendedLotCount).toBe(1);
  expect(stats.points).toHaveLength(60);
  expect(stats.coverageStreamId).toBeTruthy();
});

it('keeps a 60-minute chart continuous across WAT midnight and scopes extension counts to today', async () => {
  const p = namespace + 'midnight:';
  const projection = new LiveBidProjection(redis, p);
  const midnight = Date.parse('2026-11-07T23:00:00Z');
  await redis.xAdd(p + 'accepted', '*', message(midnight - 60000, true));
  await redis.xAdd(p + 'accepted', '*', message(midnight + 60000, true));
  await projection.refresh();
  const stats = await projection.read(midnight + 120000);
  expect(stats.points.reduce((sum, point) => sum + point.value, 0)).toBe(2);
  expect(stats.extensionCount).toBe(1);
  expect(stats.bidsPerMinute).toBe(0);
});

it('retains the daily peak after its minute leaves the 60-minute chart', async () => {
  const p = namespace + 'peak:';
  const projection = new LiveBidProjection(redis, p);
  await redis.xAdd(p + 'accepted', '*', message(now));
  await redis.xAdd(p + 'accepted', '*', message(now + 1));
  await projection.refresh();
  const stats = await projection.read(now + 61 * 60000);
  expect(stats.points.reduce((sum, point) => sum + point.value, 0)).toBe(0);
  expect(stats.bidsPeak).toBe(2);
  expect(stats.bidsPeakAt).toBe(new Date(now).toISOString());
});

it('does not advance the cursor past malformed events or write a partial batch', async () => {
  const p = namespace + 'malformed:';
  const projection = new LiveBidProjection(redis, p);
  await redis.xAdd(p + 'accepted', '*', message());
  await redis.xAdd(p + 'accepted', '*', { ...message(), result: '{}' });
  await expect(projection.refresh()).rejects.toThrow();
  expect(await redis.get(projection.prefix + 'cursor')).toBeNull();
  expect((await projection.read(now)).coverageStreamId).toBeNull();
});

it('detects conflicting Redis key types before updating any counters', async () => {
  const p = namespace + 'corrupt:';
  const projection = new LiveBidProjection(redis, p);
  await redis.xAdd(p + 'accepted', '*', message());
  await redis.set(projection.prefix + 'extended:2026-11-08', 'invalid');
  await expect(projection.refresh()).rejects.toThrow(
    'Live metrics storage unavailable',
  );
  expect(await redis.get(projection.prefix + 'cursor')).toBeNull();
  expect(await redis.hLen(projection.prefix + 'minutes:2026-11-08')).toBe(0);
});

it('rejects malformed counter contents before making partial writes', async () => {
  const p = namespace + 'counter:';
  const projection = new LiveBidProjection(redis, p);
  await redis.xAdd(p + 'accepted', '*', message());
  await redis.hSet(
    projection.prefix + 'day:2026-11-08',
    'bids',
    'not-a-number',
  );
  await expect(projection.refresh()).rejects.toThrow(
    'Live metrics storage unavailable',
  );
  expect(await redis.get(projection.prefix + 'cursor')).toBeNull();
  expect(await redis.hLen(projection.prefix + 'minutes:2026-11-08')).toBe(0);
});
it('advances past validated cancellation receipts without counting them as bids', async () => {
  const p = namespace + 'cancellation:',
    projection = new LiveBidProjection(redis, p);
  await redis.xAdd(p + 'accepted', '*', {
    kind: 'cancellation',
    approvalId: randomUUID(),
    lotId: lot,
  });
  await redis.xAdd(p + 'accepted', '*', message());
  expect((await projection.refresh()).count).toBe(1);
  expect((await projection.read(now)).bidsPerMinute).toBe(1);
  expect((await projection.refresh()).status).toBe('idle');
});
