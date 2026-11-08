import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { LOT_CONTROL_LUA } from '../apps/api/src/bids/lot-control-lua';
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
async function fixture() {
  const p = 'test:lot-control:' + randomUUID() + ':',
    lot = randomUUID(),
    end = Date.now() + 600000;
  await redis.set(
    p + 'lot:' + lot,
    JSON.stringify({
      open: true,
      endsAt: end,
      startPriceKobo: 50000,
      currentPriceKobo: null,
      leader: null,
      groupId: null,
      feeVersion: 'v1',
      streamId: '0-0',
    }),
  );
  return { p, lot, end };
}
async function control(
  p: string,
  lot: string,
  op: string,
  id: string,
  stage = 'begin',
  extra = '0',
  confirm = '',
) {
  return JSON.parse(
    String(
      await redis.eval(LOT_CONTROL_LUA, {
        keys: [p],
        arguments: [lot, id, op, stage, '0-0', extra, confirm],
      }),
    ),
  ) as {
    status: string;
    endsAt: number;
    pausedAt?: number;
    remainingMs?: number;
  };
}
it('freezes one lot, blocks bids/purchases/closing and resumes with exactly its remaining time', async () => {
  const { p, lot, end } = await fixture(),
    pause = randomUUID();
  const plan = await control(p, lot, 'pause', pause);
  expect(plan.status).toBe('fenced');
  await control(p, lot, 'pause', pause, 'commit');
  await control(p, lot, 'pause', pause, 'open');
  expect(
    JSON.parse(
      String(
        await redis.eval(CLOSE_LUA, {
          keys: [p],
          arguments: [lot, String(end + 1)],
        }),
      ),
    ).status,
  ).toBe('paused');
  expect(
    JSON.parse(
      String(
        await redis.eval(PURCHASE_LUA, {
          keys: [p],
          arguments: [lot, randomUUID(), 'reserve', String(end)],
        }),
      ),
    ).status,
  ).toBe('paused');
  const resume = randomUUID(),
    next = await control(p, lot, 'resume', resume);
  expect(next.remainingMs).toBe(plan.remainingMs);
  const done = await control(p, lot, 'resume', resume, 'commit');
  expect(done.endsAt).toBe(next.endsAt);
  expect(await control(p, lot, 'resume', resume, 'commit')).toEqual(done);
  expect((await control(p, lot, 'resume', resume, 'open')).status).toBe(
    'needs_finalization',
  );
  const final = await control(p, lot, 'resume', resume, 'finalize');
  expect((await control(p, lot, 'resume', resume, 'open')).endsAt).toBe(
    final.endsAt,
  );
});
it('races a cancellation fence against funded bids and a reservation; one side wins, never both', async () => {
  for (let round = 0; round < 10; round++) {
    const { p, lot, end } = await fixture(),
      proof = randomUUID(),
      command = randomUUID();
    await redis.hSet(p + 'auction-fees', { version: 'v1' });
    await redis.set(
      p + 'proof:' + proof,
      JSON.stringify({
        status: 'ready',
        binding: 'bound',
        lotId: lot,
        userId: randomUUID(),
        mode: 'direct',
        maxKobo: 50000,
        totalKobo: 50000,
        reservedKobo: 50000,
        baseMaxKobo: null,
        groupId: randomUUID(),
        expiresAt: end,
        feeVersion: 'v1',
      }),
    );
    const submitBid = () =>
      redis.eval(BID_LUA, {
        keys: [p],
        arguments: ['accept', proof, 'bound', lot],
      });
    const reservePurchase = () =>
      redis.eval(PURCHASE_LUA, {
        keys: [p],
        arguments: [lot, randomUUID(), 'reserve', String(end)],
      });
    let fencePromise: ReturnType<typeof control>,
      bidPromise: ReturnType<typeof submitBid>,
      purchasePromise: ReturnType<typeof reservePurchase>;
    if (round % 3 === 0) {
      fencePromise = control(p, lot, 'cancel', command);
      bidPromise = submitBid();
      purchasePromise = reservePurchase();
    } else if (round % 3 === 1) {
      bidPromise = submitBid();
      fencePromise = control(p, lot, 'cancel', command);
      purchasePromise = reservePurchase();
    } else {
      purchasePromise = reservePurchase();
      fencePromise = control(p, lot, 'cancel', command);
      bidPromise = submitBid();
    }
    const results = await Promise.all([
      fencePromise,
      bidPromise,
      purchasePromise,
    ]);
    const plan = results[0],
      bid = JSON.parse(String(results[1])),
      purchase = JSON.parse(String(results[2]));
    if (plan.status === 'fenced') {
      expect(bid.status).toBe('rejected');
      expect(purchase.status).toBe('reserved');
      await control(p, lot, 'cancel', command, 'commit');
      expect(JSON.parse(String(await redis.get(p + 'lot:' + lot))).open).toBe(
        false,
      );
    } else expect(['busy', 'stale']).toContain(plan.status);
  }
});
it('serializes final closing against a cancellation without reopening a frozen outcome', async () => {
  for (let i = 0; i < 4; i++) {
    const { p, lot, end } = await fixture(),
      id = randomUUID();
    const close = () =>
      redis.eval(CLOSE_LUA, { keys: [p], arguments: [lot, String(end + 1)] });
    const first = i % 2 ? close() : control(p, lot, 'cancel', id);
    const second = i % 2 ? control(p, lot, 'cancel', id) : close();
    const values = await Promise.all([first, second]);
    const statuses = values.map((v) =>
      typeof v === 'string'
        ? JSON.parse(v).status
        : (v as { status: string }).status,
    );
    expect(statuses.includes('fenced') && statuses.includes('frozen')).toBe(
      false,
    );
    expect(statuses).toContain(i % 2 ? 'frozen' : 'fenced');
  }
});
it('requires the second confirmation inside two minutes, rejects stale revisions and cannot revive closed lots', async () => {
  const { p, lot } = await fixture();
  const raw = JSON.parse(String(await redis.get(p + 'lot:' + lot)));
  raw.endsAt = Date.now() + 60000;
  await redis.set(p + 'lot:' + lot, JSON.stringify(raw));
  expect((await control(p, lot, 'cancel', randomUUID())).status).toBe(
    'confirm',
  );
  const id = randomUUID();
  expect(
    (await control(p, lot, 'cancel', id, 'begin', '0', 'CANCEL')).status,
  ).toBe('fenced');
  await control(p, lot, 'cancel', id, 'commit');
  await control(p, lot, 'cancel', id, 'open');
  expect(
    (await control(p, lot, 'extend', randomUUID(), 'begin', '120000')).status,
  ).toBe('stale');
});
