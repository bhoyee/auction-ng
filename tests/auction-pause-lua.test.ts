import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  AUCTION_PAUSE_LUA,
  AUCTION_RESUME_LOT_LUA,
} from '../apps/api/src/bids/auction-pause-lua';
import { BID_LUA } from '../apps/api/src/bids/bid-lua';
import { CLOSE_LUA } from '../apps/api/src/closing/close-lua';
import { PURCHASE_LUA } from '../apps/api/src/purchases/purchase-lua';
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
it('serializes a pause racing funded bid acceptance and rejects every later attempt', async () => {
  const p = 'test:pause-race:' + randomUUID() + ':',
    lot = randomUUID(),
    now = Date.now();
  await redis.hSet(p + 'auction-fees', { version: 'v1' });
  await redis.set(
    p + 'lot:' + lot,
    JSON.stringify({
      open: true,
      endsAt: now + 600000,
      leader: null,
      currentPriceKobo: null,
      startPriceKobo: 50000,
      groupId: null,
      feeVersion: 'v1',
    }),
  );
  const ids = Array.from({ length: 20 }, () => randomUUID());
  await Promise.all(
    ids.map((id, i) =>
      redis.set(
        p + 'proof:' + id,
        JSON.stringify({
          status: 'ready',
          binding: 'bound',
          lotId: lot,
          userId: randomUUID(),
          mode: 'direct',
          maxKobo: 50000 + i,
          totalKobo: 50000 + i,
          reservedKobo: 50000 + i,
          baseMaxKobo: null,
          groupId: randomUUID(),
          expiresAt: now + 60000,
          feeVersion: 'v1',
        }),
      ),
    ),
  );
  const results = await Promise.all([
    ...ids.slice(0, 10).map((id) =>
      redis.eval(BID_LUA, {
        keys: [p],
        arguments: ['accept', id, 'bound', lot],
      }),
    ),
    redis.eval(AUCTION_PAUSE_LUA, {
      keys: [p],
      arguments: ['pause', randomUUID()],
    }),
    ...ids.slice(10).map((id) =>
      redis.eval(BID_LUA, {
        keys: [p],
        arguments: ['accept', id, 'bound', lot],
      }),
    ),
  ]);
  const pause = JSON.parse(String(results[10]));
  for (const raw of results) {
    const result = JSON.parse(String(raw));
    if (result.status === 'accepted')
      expect(result.serverTime).toBeLessThanOrEqual(pause.pausedAt);
  }
  const later = JSON.parse(
    String(
      await redis.eval(BID_LUA, {
        keys: [p],
        arguments: ['accept', ids[19] ?? '', 'bound', lot],
      }),
    ),
  );
  expect(later.status === 'accepted' || later.reason === 'paused').toBe(true);
  const stream = await redis.xRange(p + 'accepted', '-', '+');
  expect(
    stream.every(
      (entry) =>
        JSON.parse(entry.message.result ?? '{}').serverTime <= pause.pausedAt,
    ),
  ).toBe(true);
});
it('atomically rejects new bids, closing and purchases while allowing an existing payment to commit', async () => {
  const p = 'test:pause:' + randomUUID() + ':',
    lot = randomUUID(),
    proof = randomUUID(),
    order = randomUUID(),
    now = Date.now();
  await redis.set(
    p + 'lot:' + lot,
    JSON.stringify({
      open: true,
      endsAt: now + 600000,
      leader: null,
      currentPriceKobo: null,
      startPriceKobo: 50000,
      groupId: null,
      feeVersion: 'v1',
    }),
  );
  await redis.hSet(p + 'auction-fees', { version: 'v1' });
  await redis.set(
    p + 'proof:' + proof,
    JSON.stringify({
      binding: 'bound',
      lotId: lot,
      userId: randomUUID(),
      status: 'ready',
      mode: 'direct',
      expiresAt: now + 60000,
    }),
  );
  await redis.eval(PURCHASE_LUA, {
    keys: [p],
    arguments: [lot, order, 'reserve', String(now + 300000)],
  });
  await redis.eval(AUCTION_PAUSE_LUA, {
    keys: [p],
    arguments: ['pause', randomUUID()],
  });
  const bid = JSON.parse(
    String(
      await redis.eval(BID_LUA, {
        keys: [p],
        arguments: ['accept', proof, 'bound', lot],
      }),
    ),
  );
  expect(bid.reason).toBe('paused');
  expect(
    JSON.parse(
      String(
        await redis.eval(CLOSE_LUA, {
          keys: [p],
          arguments: [lot, String(now + 900000)],
        }),
      ),
    ).status,
  ).toBe('reserved');
  const other = randomUUID();
  await redis.set(
    p + 'lot:' + other,
    JSON.stringify({ open: true, endsAt: now + 600000 }),
  );
  expect(
    JSON.parse(
      String(
        await redis.eval(CLOSE_LUA, {
          keys: [p],
          arguments: [other, String(now + 900000)],
        }),
      ),
    ).status,
  ).toBe('paused');
  expect(
    JSON.parse(
      String(
        await redis.eval(PURCHASE_LUA, {
          keys: [p],
          arguments: [lot, randomUUID(), 'reserve', String(now + 300000)],
        }),
      ),
    ).status,
  ).toBe('paused');
  expect(
    JSON.parse(
      String(
        await redis.eval(PURCHASE_LUA, {
          keys: [p],
          arguments: [lot, order, 'commit'],
        }),
      ),
    ).status,
  ).toBe('ok');
  expect(
    JSON.parse(
      String(
        await redis.eval(PURCHASE_LUA, {
          keys: [p],
          arguments: [lot, order, 'sold'],
        }),
      ),
    ).status,
  ).toBe('sold');
});
it('freezes one timestamp across concurrent exact retries and resumes only after the durable lot work', async () => {
  const p = 'test:pause:' + randomUUID() + ':',
    id = randomUUID();
  const call = (op: string, key: string) =>
    redis.eval(AUCTION_PAUSE_LUA, { keys: [p], arguments: [op, key] });
  const paused = await Promise.all(
    Array.from({ length: 8 }, () => call('pause', id)),
  );
  expect(new Set(paused).size).toBe(1);
  const first = JSON.parse(String(paused[0]));
  expect(first.phase).toBe('paused');
  const resumeId = randomUUID();
  const resumed = JSON.parse(String(await call('resume_begin', resumeId)));
  expect(resumed.phase).toBe('resuming');
  expect(resumed.pausedAt).toBe(first.pausedAt);
  const lotId = randomUUID(),
    end = first.pausedAt + 60000;
  await redis.set(
    p + 'lot:' + lotId,
    JSON.stringify({
      open: true,
      endsAt: end,
      currentPriceKobo: 123456789012345,
      leader: null,
    }),
  );
  const args = [lotId, randomUUID(), String(end), String(end + 50000)];
  const apply = () =>
    redis.eval(AUCTION_RESUME_LOT_LUA, { keys: [p], arguments: args });
  await Promise.all([apply(), apply()]);
  const lot = JSON.parse(String(await redis.get(p + 'lot:' + lotId)));
  expect(lot.endsAt).toBe(end + 50000);
  expect(lot.currentPriceKobo).toBe(123456789012345);
  const finished = JSON.parse(String(await call('resume_finish', resumeId)));
  expect(finished.phase).toBe('resuming');
  expect(JSON.parse(String(await call('resume_open', resumeId))).phase).toBe(
    'live',
  );
});
it('does not revive a closed or already-expired lot during resume', async () => {
  const p = 'test:pause:' + randomUUID() + ':';
  const pause = JSON.parse(
    String(
      await redis.eval(AUCTION_PAUSE_LUA, {
        keys: [p],
        arguments: ['pause', randomUUID()],
      }),
    ),
  );
  await redis.eval(AUCTION_PAUSE_LUA, {
    keys: [p],
    arguments: ['resume_begin', randomUUID()],
  });
  for (const open of [false, true]) {
    const id = randomUUID(),
      end = pause.pausedAt - 1000;
    await redis.set(p + 'lot:' + id, JSON.stringify({ open, endsAt: end }));
    await redis.eval(AUCTION_RESUME_LOT_LUA, {
      keys: [p],
      arguments: [id, randomUUID(), String(end), String(end + 50000)],
    });
    expect(JSON.parse(String(await redis.get(p + 'lot:' + id))).endsAt).toBe(
      end,
    );
  }
});
it('finalizes 3,000 paused clocks atomically and does not add restoration time twice', async () => {
  const p = 'test:pause-volume:' + randomUUID() + ':',
    pauseId = randomUUID(),
    resumeId = randomUUID();
  const paused = JSON.parse(
    String(
      await redis.eval(AUCTION_PAUSE_LUA, {
        keys: [p],
        arguments: ['pause', pauseId],
      }),
    ),
  );
  await redis.eval(AUCTION_PAUSE_LUA, {
    keys: [p],
    arguments: ['resume_begin', resumeId],
  });
  const root = 'lotvanta:auction-control:' + p,
    oldEnd = paused.pausedAt + 60000;
  const batch = redis.multi();
  for (let i = 0; i < 3000; i++) {
    batch.set(
      p + 'lot:' + i,
      JSON.stringify({
        open: true,
        endsAt: oldEnd,
        pauseId,
        pauseEndsAt: oldEnd,
        currentPriceKobo: 123456789012345,
      }),
    );
    batch.hSet(root + 'resume:' + resumeId, String(i), String(i));
  }
  await batch.exec();
  const start = performance.now();
  const finish = String(
    await redis.eval(AUCTION_PAUSE_LUA, {
      keys: [p],
      arguments: ['resume_finish', resumeId],
    }),
  );
  console.log(
    `3,000 paused clocks finalized in ${(performance.now() - start).toFixed(2)}ms`,
  );
  const final = JSON.parse(finish);
  expect(
    String(
      await redis.eval(AUCTION_PAUSE_LUA, {
        keys: [p],
        arguments: ['resume_finish', resumeId],
      }),
    ),
  ).toBe(finish);
  for (const id of [0, 2999]) {
    const lot = JSON.parse(String(await redis.get(p + 'lot:' + id)));
    expect(lot.endsAt).toBe(oldEnd + final.finalAdditionMs);
    expect(lot.currentPriceKobo).toBe(123456789012345);
  }
});
