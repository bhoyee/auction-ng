import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolveBid, type AuctionState } from '../packages/shared/src';
import { BID_LUA } from '../apps/api/src/bids/bid-lua';

const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { createClient } =
  require('redis') as typeof import('../apps/api/node_modules/redis');
const redis = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
});
const prefix = `test:bids:${randomUUID()}:`;
let scriptSha: string;
beforeAll(async () => {
  redis.on('error', () => {});
  await redis.connect();
  scriptSha = await redis.scriptLoad(BID_LUA);
});
afterAll(async () => {
  if (redis.isOpen) await redis.quit();
});
let seed = 192837;
const random = (max: number) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % max;
};
it('matches shared mixed-mode rules over 10,000 deterministic random cases, including rejection', async () => {
  for (let batch = 0; batch < 100; batch++) {
    await Promise.all(
      Array.from({ length: 100 }, async (_, offset) => {
        const id = `${batch * 100 + offset}`;
        const now = Date.now();
        const price =
          offset === 0
            ? Number.MAX_SAFE_INTEGER - 2000000
            : 50000 + random(100000000);
        const empty = random(5) === 0;
        const state: AuctionState = {
          startPriceKobo: 50000,
          currentPriceKobo: empty ? null : price,
          leader: empty
            ? null
            : { bidderId: 'leader', maxKobo: price + random(1000000) },
          endsAt: now + (random(5) === 0 ? -1 : 1 + random(300000)),
        };
        const bid = {
          bidderId: random(4) === 0 ? 'leader' : 'challenger',
          maxKobo: price + random(2000000),
          mode: offset % 2 === 0 ? ('direct' as const) : ('automatic' as const),
        };
        const group = randomUUID();
        const own = state.leader?.bidderId === bid.bidderId;
        await redis.set(
          `${prefix}lot:${id}`,
          JSON.stringify({
            ...state,
            groupId: 'old',
            heldKobo: state.leader?.maxKobo ?? 0,
            feeVersion: 'v1',
            open: true,
          }),
        );
        await redis.set(
          `${prefix}proof:${id}`,
          JSON.stringify({
            userId: bid.bidderId,
            maxKobo: bid.maxKobo,
            mode: bid.mode,
            totalKobo: bid.maxKobo,
            reservedKobo: own
              ? Math.max(0, bid.maxKobo - (state.leader?.maxKobo ?? 0))
              : bid.maxKobo,
            lotId: id,
            groupId: own ? 'old' : group,
            baseMaxKobo: own ? state.leader?.maxKobo : null,
            expiresAt: now + 60000,
            binding: 'bound',
            status: 'ready',
            feeVersion: 'v1',
          }),
        );
        let expected: AuctionState | undefined;
        try {
          expected = resolveBid(state, bid, now);
        } catch {
          /* Rejections are compared too. */
        }
        const raw = await redis.evalSha(scriptSha, {
          keys: [prefix],
          arguments: ['accept', id, 'bound', id, String(now)],
        });
        const result = JSON.parse(String(raw)) as {
          status: string;
          state?: AuctionState;
        };
        if (expected) expect(result.state).toEqual(expected);
        else expect(result.status).toBe('rejected');
      }),
    );
  }
}, 60000);
it('serializes 500 simultaneous mixed-mode funded contenders and retains exactly one leading group', async () => {
  const lotId = randomUUID();
  const now = Date.now();
  await redis.set(
    `${prefix}lot:${lotId}`,
    JSON.stringify({
      startPriceKobo: 50000,
      currentPriceKobo: null,
      leader: null,
      endsAt: now + 300000,
      groupId: null,
      heldKobo: 0,
      feeVersion: 'v1',
      open: true,
    }),
  );
  const contenders = Array.from({ length: 500 }, (_, index) => ({
    id: randomUUID(),
    groupId: randomUUID(),
    maxKobo: 100000 + index * 500000,
    mode: index % 2 === 0 ? 'direct' : 'automatic',
    userId: `buyer-${index}`,
  }));
  await Promise.all(
    contenders.map((who) =>
      redis.set(
        `${prefix}proof:${who.id}`,
        JSON.stringify({
          ...who,
          totalKobo: who.maxKobo,
          reservedKobo: who.maxKobo,
          lotId,
          binding: 'bound',
          status: 'ready',
          baseMaxKobo: null,
          feeVersion: 'v1',
          expiresAt: now + 60000,
        }),
      ),
    ),
  );
  const results = await Promise.all(
    contenders.map((who) =>
      redis.evalSha(scriptSha, {
        keys: [prefix],
        arguments: ['accept', who.id, 'bound', lotId],
      }),
    ),
  );
  expect(
    results.every(
      (raw) =>
        (JSON.parse(String(raw)) as { status: string }).status === 'accepted',
    ),
  ).toBe(true);
  const state = JSON.parse(
    String(await redis.get(`${prefix}lot:${lotId}`)),
  ) as AuctionState & { groupId: string };
  expect(state.leader?.bidderId).toBe('buyer-499');
  expect(state.currentPriceKobo).toBe(249600000);
  const statuses = await Promise.all(
    contenders.map((who) => redis.hGet(`${prefix}groups`, who.groupId)),
  );
  expect(statuses.filter((status) => status === 'active')).toHaveLength(1);
});
it('keeps sequential durable Lua acceptance p95 below 50 ms locally', async () => {
  const lotId = randomUUID();
  const now = Date.now();
  await redis.set(
    `${prefix}lot:${lotId}`,
    JSON.stringify({
      startPriceKobo: 50000,
      currentPriceKobo: null,
      leader: null,
      endsAt: now + 300000,
      groupId: null,
      heldKobo: 0,
      feeVersion: 'v1',
      open: true,
    }),
  );
  const timings: number[] = [];
  for (let index = 0; index < 200; index++) {
    const id = randomUUID();
    await redis.set(
      `${prefix}proof:${id}`,
      JSON.stringify({
        userId: id,
        maxKobo: 100000 + index * 500000,
        mode: index % 2 === 0 ? 'direct' : 'automatic',
        totalKobo: 100000 + index * 500000,
        reservedKobo: 100000 + index * 500000,
        lotId,
        groupId: id,
        baseMaxKobo: null,
        expiresAt: now + 60000,
        binding: 'bound',
        status: 'ready',
        feeVersion: 'v1',
      }),
    );
    const started = performance.now();
    const result = await redis.evalSha(scriptSha, {
      keys: [prefix],
      arguments: ['accept', id, 'bound', lotId],
    });
    timings.push(performance.now() - started);
    expect((JSON.parse(String(result)) as { status: string }).status).toBe(
      'accepted',
    );
  }
  timings.sort((a, b) => a - b);
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1] ?? Infinity;
  console.log(
    `Durable Lua acceptance p95: ${p95.toFixed(2)} ms (${timings.length} requests).`,
  );
  expect(p95).toBeLessThan(50);
});
it('keeps the earlier equal maximum, extends the close and records exact retries once', async () => {
  const id = randomUUID();
  const now = Date.now();
  const item = {
    startPriceKobo: 50000,
    currentPriceKobo: 50000,
    leader: { bidderId: 'first', maxKobo: 100000 },
    groupId: 'first-group',
    heldKobo: 100000,
    endsAt: now + 100,
    feeVersion: 'v1',
    open: true,
  };
  await redis.set(`${prefix}lot:${id}`, JSON.stringify(item));
  await redis.set(
    `${prefix}proof:${id}`,
    JSON.stringify({
      userId: 'second',
      maxKobo: 100000,
      totalKobo: 100000,
      reservedKobo: 100000,
      groupId: id,
      baseMaxKobo: null,
      lotId: id,
      binding: 'bound',
      status: 'ready',
      feeVersion: 'v1',
      expiresAt: now + 60000,
    }),
  );
  const before = await redis.xLen(`${prefix}accepted`);
  const result = await redis.evalSha(scriptSha, {
    keys: [prefix],
    arguments: ['accept', id, 'bound', id, String(now)],
  });
  const parsed = JSON.parse(String(result)) as {
    isLeader: boolean;
    state: AuctionState;
  };
  expect(parsed.isLeader).toBe(false);
  expect(parsed.state.leader?.bidderId).toBe('first');
  expect(parsed.state.currentPriceKobo).toBe(100000);
  expect(parsed.state.endsAt).toBe(now + 120000);
  expect(
    JSON.parse(
      String(
        await redis.evalSha(scriptSha, {
          keys: [prefix],
          arguments: ['accept', id, 'bound', id, String(now + 999999)],
        }),
      ),
    ),
  ).toEqual(JSON.parse(String(result)));
  expect(await redis.xLen(`${prefix}accepted`)).toBe(before + 1);
});
it('rejects an incomplete hold proof and a corrupted stream before mutating the lot', async () => {
  for (const corrupt of [false, true]) {
    const ns = `test:invalid:${randomUUID()}:`;
    const id = randomUUID();
    const now = Date.now();
    const state = {
      startPriceKobo: 50000,
      currentPriceKobo: null,
      leader: null,
      heldKobo: 0,
      groupId: null,
      endsAt: now + 300000,
      feeVersion: 'v1',
      open: true,
    };
    await redis.set(`${ns}lot:${id}`, JSON.stringify(state));
    await redis.set(
      `${ns}proof:${id}`,
      JSON.stringify({
        userId: id,
        maxKobo: 100000,
        totalKobo: 100000,
        reservedKobo: corrupt ? 100000 : 1,
        lotId: id,
        groupId: id,
        baseMaxKobo: null,
        binding: 'bound',
        status: 'ready',
        feeVersion: 'v1',
        expiresAt: now + 60000,
      }),
    );
    if (corrupt) await redis.set(`${ns}accepted`, 'invalid-type');
    const result = JSON.parse(
      String(
        await redis.evalSha(scriptSha, {
          keys: [ns],
          arguments: ['accept', id, 'bound', id],
        }),
      ),
    ) as { status: string; reason: string };
    expect(result).toEqual({
      status: 'rejected',
      reason: corrupt ? 'unavailable' : 'funding',
    });
    expect(JSON.parse(String(await redis.get(`${ns}lot:${id}`)))).toEqual(
      state,
    );
  }
});
it('preserves legacy automatic proofs and rejects unknown modes without accepting a bid', async () => {
  for (const mode of [undefined, 'automatic', 'direct', 'unknown']) {
    const id = randomUUID();
    const now = Date.now();
    const initial = {
      startPriceKobo: 50000,
      currentPriceKobo: null,
      leader: null,
      groupId: null,
      endsAt: now + 300000,
      feeVersion: 'v1',
      open: true,
    };
    await redis.set(`${prefix}lot:${id}`, JSON.stringify(initial));
    await redis.set(
      `${prefix}proof:${id}`,
      JSON.stringify({
        mode,
        userId: id,
        maxKobo: 1000000,
        totalKobo: 1000000,
        reservedKobo: 1000000,
        lotId: id,
        groupId: id,
        baseMaxKobo: null,
        binding: 'bound',
        status: 'ready',
        feeVersion: 'v1',
        expiresAt: now + 60000,
      }),
    );
    const before = await redis.xLen(`${prefix}accepted`);
    const result = JSON.parse(
      String(
        await redis.evalSha(scriptSha, {
          keys: [prefix],
          arguments: ['accept', id, 'bound', id],
        }),
      ),
    ) as { status: string; mode?: string; state?: AuctionState };
    if (mode === 'unknown') {
      expect(result.status).toBe('rejected');
      expect(await redis.xLen(`${prefix}accepted`)).toBe(before);
      expect(JSON.parse(String(await redis.get(`${prefix}lot:${id}`)))).toEqual(
        initial,
      );
    } else {
      expect(result.mode).toBe(mode ?? 'automatic');
      expect(result.state?.currentPriceKobo).toBe(
        mode === 'direct' ? 1000000 : 50000,
      );
    }
  }
});
