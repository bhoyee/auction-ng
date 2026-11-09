import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { ACTIVATE_AUCTION_FEES_LUA } from '../apps/api/src/bids/auction-fee-lua';
import { BID_LUA } from '../apps/api/src/bids/bid-lua';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { createClient } =
  require('redis') as typeof import('../apps/api/node_modules/redis');
const redis = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
});
beforeAll(async () => {
  await redis.connect();
});
afterAll(async () => {
  await redis.quit();
});
it('never rolls policy activation backwards when concurrent updates finish out of order', async () => {
  const key = `test:auction-fees:${randomUUID()}`;
  const activate = (revision: number) =>
    redis.eval(ACTIVATE_AUCTION_FEES_LUA, {
      keys: [key],
      arguments: [String(revision), `policy-${revision}`],
    });
  await Promise.all([
    activate(1),
    activate(3),
    activate(2),
    activate(3),
    activate(0),
  ]);
  expect(await redis.hGetAll(key)).toEqual({
    revision: '3',
    version: 'policy-3',
  });
  await expect(
    redis.eval(ACTIVATE_AUCTION_FEES_LUA, {
      keys: [key],
      arguments: ['3', 'different-policy'],
    }),
  ).rejects.toThrow('Fee revision conflict');
  expect(await redis.hGetAll(key)).toEqual({
    revision: '3',
    version: 'policy-3',
  });
});
it('serializes a first bid against activation: freeze the agreed policy or reject the stale quote', async () => {
  for (let n = 0; n < 50; n++) {
    const p = `test:fee-race:${randomUUID()}:`,
      id = randomUUID(),
      now = Date.now();
    await redis.hSet(p + 'auction-fees', { version: 'old', revision: '0' });
    await redis.set(
      p + 'lot:' + id,
      JSON.stringify({
        open: true,
        startPriceKobo: 50000,
        currentPriceKobo: null,
        leader: null,
        groupId: null,
        endsAt: now + 300000,
        feeVersion: 'old',
      }),
    );
    const proof = {
      userId: 'buyer',
      lotId: id,
      maxKobo: 100000,
      totalKobo: 120000,
      reservedKobo: 120000,
      baseMaxKobo: null,
      groupId: randomUUID(),
      binding: 'bound',
      status: 'ready',
      mode: 'direct',
      feeVersion: 'old',
      expiresAt: now + 60000,
    };
    await redis.set(p + 'proof:' + id, JSON.stringify(proof));
    const activate = () =>
      redis.eval(ACTIVATE_AUCTION_FEES_LUA, {
        keys: [p + 'auction-fees'],
        arguments: ['1', 'new'],
      });
    const accept = () =>
      redis.eval(BID_LUA, {
        keys: [p],
        arguments: ['accept', id, 'bound', id],
      });
    const results =
      n % 2
        ? await Promise.all([activate(), accept()])
        : await Promise.all([accept(), activate()]);
    const result = JSON.parse(String(results[n % 2 ? 1 : 0]));
    expect(await redis.hGet(p + 'auction-fees', 'version')).toBe('new');
    if (result.status === 'accepted') {
      expect(
        JSON.parse(String(await redis.get(p + 'lot:' + id))).feeVersion,
      ).toBe('old');
      expect(await redis.xLen(p + 'accepted')).toBe(1);
      // A later bid on a led lot still uses its agreed old policy.
      const next = randomUUID();
      await redis.set(
        p + 'proof:' + next,
        JSON.stringify({
          ...proof,
          userId: 'other',
          groupId: randomUUID(),
          maxKobo: 150000,
          totalKobo: 180000,
          reservedKobo: 180000,
        }),
      );
      expect(
        JSON.parse(
          String(
            await redis.eval(BID_LUA, {
              keys: [p],
              arguments: ['accept', next, 'bound', id],
            }),
          ),
        ).status,
      ).toBe('accepted');
    } else {
      expect(result).toEqual({ status: 'rejected', reason: 'stale' });
      expect(await redis.xLen(p + 'accepted')).toBe(0);
    }
  }
});
