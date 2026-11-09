import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { LiveIssues } from '../apps/api/src/staff-admin/live-issues';
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
it('keeps missing telemetry unavailable and reports measured zero only after heartbeat', async () => {
  const issues = new LiveIssues(redis, `test:issues:${randomUUID()}:`);
  expect(await issues.read(Date.now())).toBeNull();
  await issues.heartbeat();
  expect(await issues.read(Date.now())).toMatchObject({
    wallet: 0,
    release: 0,
  });
});
it('deduplicates concurrent retries without exposing request identifiers', async () => {
  const issues = new LiveIssues(redis, `test:issues:${randomUUID()}:`);
  await issues.heartbeat();
  await Promise.all(
    Array.from({ length: 30 }, () =>
      issues.record('wallet', 'private-buyer:request'),
    ),
  );
  await issues.record('wallet', 'different-request');
  await Promise.all(
    Array.from({ length: 20 }, () => issues.record('release', 'private-hold')),
  );
  expect(await issues.read(Date.now())).toMatchObject({
    wallet: 2,
    release: 1,
  });
  const day = Math.floor((Date.now() + 3600000) / 86400000);
  expect(
    JSON.stringify(await redis.sMembers(issues.prefix + day + ':wallet')),
  ).not.toContain('private-buyer');
});
it('uses independent WAT-day buckets and refuses stale telemetry', async () => {
  const issues = new LiveIssues(redis, `test:issues:${randomUUID()}:`);
  await issues.heartbeat();
  await issues.record('release', 'one');
  const now = Date.now(),
    day = Math.floor((now + 3600000) / 86400000);
  await redis.sAdd(issues.prefix + (day - 1) + ':wallet', 'yesterday');
  expect(await issues.read(now)).toMatchObject({ wallet: 0, release: 1 });
  expect(await issues.read(now + 30000)).toBeNull();
  const midnight = (day + 1) * 86400000 - 3600000;
  await redis.set(issues.prefix + 'heartbeat', String(midnight));
  await redis.set(issues.prefix + (day + 1) + ':since', String(midnight));
  expect(await issues.read(midnight)).toMatchObject({ wallet: 0, release: 0 });
});
it('keeps corrupt tracking unavailable rather than reporting a zero', async () => {
  const issues = new LiveIssues(redis, `test:issues:${randomUUID()}:`);
  await issues.heartbeat();
  const day = Math.floor((Date.now() + 3600000) / 86400000);
  await redis.set(issues.prefix + day + ':wallet', 'invalid-set');
  await expect(issues.record('wallet', 'retry')).resolves.toBeUndefined();
  expect(await issues.read(Date.now())).toBeNull();
});
