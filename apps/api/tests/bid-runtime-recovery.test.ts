import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { LedgerService } from '../src/ledger/ledger-service';
import { BidService } from '../src/bids/bid-service';
import { BidRuntimeRecovery } from '../src/bids/runtime-recovery';
import { encryptPii, hashPii } from '../src/security/pii';
import { PurchaseService } from '../src/purchases/purchase-service';
import { calculateFixedPrice } from '@auction-ng/shared';
import { actionProof } from './action-verification-helper';

let ledger: LedgerService;
// Offline recovery performs several full receipt audits; this is not the bid hot-path budget.
vi.setConfig({ testTimeout: 60000 });
let redis: ReturnType<typeof createClient>;
const services: BidService[] = [];
beforeAll(async () => {
  const url =
    process.env.BID_RECOVERY_TEST_DATABASE_URL ??
    process.env.BID_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated recovery database required.');
  ledger = new LedgerService(url);
  redis = createClient({
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await redis.connect();
});
afterAll(async () => {
  for (const service of services) await service.close();
  await redis?.quit();
  await ledger?.close();
});
async function fixture(pending = false, sold = false) {
  const prefix = `test:recovery:${randomUUID()}:`;
  const bids = new BidService(ledger, { prefix, enabled: true });
  services.push(bids);
  await bids.start();
  const category = await ledger.db.category.create({
    data: { name: 'Recovery test', slug: randomUUID() },
  });
  const location = await ledger.db.location.create({
    data: {
      name: 'Synthetic collection',
      code: randomUUID().slice(0, 24),
      address: 'Synthetic Lagos location',
      hours: {},
      capacityPerSlot: 20,
    },
  });
  const lot = await ledger.db.lot.create({
    data: {
      title: 'Synthetic recovery item',
      description: 'Not real stock',
      lotNumber: randomUUID(),
      categoryId: category.id,
      locationId: location.id,
      condition: 'open_box',
      retailPriceKobo: 1000000n,
      startPriceKobo: 50000n,
      status: 'open',
      startAt: new Date(Date.now() - 1000),
      endAt: new Date(Date.now() + 600000),
    },
  });
  const owners: { walletId: string }[] = [];
  let lastStream = '';
  let lastIntent = '';
  let lastBuyer: { userId: string; sessionId: string } | undefined;
  for (const amount of pending ? [200000] : [200000, 300000]) {
    const email = `${randomUUID()}@example.test`;
    const user = await ledger.db.user.create({
      data: {
        name: 'Synthetic buyer',
        emailHash: hashPii(email, 'email'),
        emailCiphertext: encryptPii(email, 'email'),
        emailVerifiedAt: new Date(),
      },
    });
    const wallet = await ledger.openWallet(user.id);
    await ledger.topup({
      walletId: wallet.id,
      amountKobo: 5000000n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    });
    owners.push({ walletId: wallet.id });
    const session = await ledger.db.authSession.create({
      data: {
        // Fixture: a completed password + email security check for bidding.
        bidVerifiedUntil: new Date(Date.now() + 30 * 60 * 1000),
        userId: user.id,
        familyId: randomUUID(),
        deviceHash: '0'.repeat(64),
        client: 'web',
        buyerMfa: true,
        accessHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        refreshHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        accessExpiresAt: new Date(Date.now() + 900000),
        expiresAt: new Date(Date.now() + 900000),
      },
    });
    const key = randomUUID(),
      token = randomUUID(),
      device = randomUUID();
    lastBuyer = { userId: user.id, sessionId: session.id };
    const prepared = await bids.prepare(
      { userId: user.id, sessionId: session.id },
      lot.id,
      { maxKobo: amount, mode: 'direct', idempotencyKey: key },
      token,
      device,
    );
    lastIntent = prepared.preparationId;
    if (!pending) {
      const result = await bids.accept(
        lot.id,
        { preparationId: prepared.preparationId, idempotencyKey: key },
        token,
        device,
      );
      lastStream = result.streamId;
      await bids.persist([result.streamId]);
      await bids.maintain();
    }
  }
  if (!pending) {
    // The bounded rotating maintenance scan may need another pass to release the displaced group.
    await bids.maintain();
    await bids.maintain();
  }
  if (sold) {
    if (!lastBuyer) throw Error('Synthetic buyer missing');
    const price = 1000000;
    await ledger.db.lot.update({
      where: { id: lot.id },
      data: { fixedPriceKobo: BigInt(price) },
    });
    const total = calculateFixedPrice(price);
    await new PurchaseService(ledger, bids).start(lastBuyer, lot.id, {
      idempotencyKey: randomUUID(),
      verificationId: await actionProof(
        ledger.db,
        lastBuyer,
        'buy-now',
        lot.id,
      ),
      method: 'wallet',
      acceptedPriceKobo: price,
      acceptedTaxKobo: total.taxKobo,
      acceptedProcessingFeeKobo: 0,
      acceptedTotalKobo: total.totalKobo,
    });
  }
  await bids.close();
  // Simulate an AOF-preserving process restart only inside this isolated fixture.
  const oldId = 'a'.repeat(40);
  const database = (
    await ledger.db.$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`
  )[0]?.name;
  await ledger.db.bidEngineRuntime.update({
    where: { namespace: prefix },
    data: { redisRunId: oldId },
  });
  const oldMarker = createHash('sha256')
    .update(JSON.stringify([database, prefix, oldId]))
    .digest('hex');
  await redis.set(prefix + 'runtime', oldMarker);
  const balances = async () => ({
    balances: await Promise.all(
      owners.map((owner) => ledger.balances(owner.walletId)),
    ),
    entries: await ledger.db.ledgerEntry.count({
      where: {
        account: { walletId: { in: owners.map((owner) => owner.walletId) } },
      },
    }),
    transactions: await ledger.db.ledgerTransaction.count({
      where: { walletId: { in: owners.map((owner) => owner.walletId) } },
    }),
  });
  const recovery = (hooks = {}) =>
    new BidRuntimeRecovery(ledger, redis, prefix, {
      assertOffline: async () => {},
      ...hooks,
    });
  const input = (fingerprint: string) => ({
    idempotencyKey: randomUUID(),
    reportFingerprint: fingerprint,
    operator: 'synthetic-operator',
    reason: 'Approved isolated restart recovery test.',
  });
  return {
    prefix,
    lot,
    lastIntent,
    lastStream,
    balances,
    recovery,
    input,
    oldMarker,
  };
}

it('dry-run validates durable events without moving funds or rebinding the runtime', async () => {
  const f = await fixture(),
    before = await f.balances();
  const report = await f.recovery().audit();
  expect(report.acceptedCount).toBe(2);
  expect(report.activeHoldCount).toBe(1);
  expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(await redis.get(f.prefix + 'runtime')).toBe(f.oldMarker);
  expect(await f.balances()).toEqual(before);
});
it('resumes exact preserved state once, with an immutable recovery receipt and audit', async () => {
  const f = await fixture(),
    before = await f.balances();
  const recovery = f.recovery(),
    report = await recovery.audit(),
    command = f.input(report.fingerprint);
  await recovery.apply(command);
  await recovery.apply(command);
  expect(await f.balances()).toEqual(before);
  expect(
    await ledger.db.auditLog.count({
      where: { entityId: f.prefix, action: 'bid.runtime.recovered' },
    }),
  ).toBe(1);
  const resumed = new BidService(ledger, { prefix: f.prefix, enabled: true });
  services.push(resumed);
  await resumed.start();
  expect((await resumed.snapshot(null, f.lot.id)).currentPriceKobo).toBe(
    300000,
  );
});
it('refuses a missing immutable stream event without releasing the winning reservation', async () => {
  const f = await fixture(),
    before = await f.balances();
  await redis.xDel(f.prefix + 'accepted', f.lastStream);
  await expect(f.recovery().audit()).rejects.toThrow();
  expect(await f.balances()).toEqual(before);
  expect(await redis.get(f.prefix + 'runtime')).toBe(f.oldMarker);
});
it('refuses a changed funded proof even when stream and receipt counts still match', async () => {
  const f = await fixture(),
    report = await f.recovery().audit(),
    before = await f.balances();
  const raw = await redis.get(f.prefix + 'proof:' + f.lastIntent);
  if (!raw) throw Error('Synthetic proof missing');
  const proof = JSON.parse(raw) as Record<string, unknown>;
  proof.maxKobo = 1;
  await redis.set(f.prefix + 'proof:' + f.lastIntent, JSON.stringify(proof));
  await expect(
    f.recovery().apply(f.input(report.fingerprint)),
  ).rejects.toThrow();
  expect(await f.balances()).toEqual(before);
  expect(await redis.get(f.prefix + 'runtime')).toBe(f.oldMarker);
});
it('keeps uncertain prepared funds fenced for separate review', async () => {
  const f = await fixture(true),
    before = await f.balances();
  await expect(f.recovery().audit()).rejects.toThrow();
  expect(await f.balances()).toEqual(before);
});
it('preserves an empty scheduled launch for the normal worker to resume', async () => {
  const f = await fixture();
  const launching = await ledger.db.lot.create({
    data: {
      title: 'Empty launch',
      description: 'Synthetic',
      lotNumber: randomUUID(),
      categoryId: f.lot.categoryId,
      locationId: f.lot.locationId,
      condition: 'open_box',
      retailPriceKobo: 1000000n,
      startPriceKobo: 50000n,
      status: 'scheduled',
      startAt: new Date(Date.now() - 1000),
      endAt: new Date(Date.now() + 600000),
      preBidsLaunching: true,
    },
  });
  const before = await f.balances();
  try {
    const report = await f.recovery().audit();
    await f.recovery().apply(f.input(report.fingerprint));
    expect(await f.balances()).toEqual(before);
    expect(
      (await ledger.db.lot.findUniqueOrThrow({ where: { id: launching.id } }))
        .preBidsLaunching,
    ).toBe(true);
  } finally {
    await ledger.db.lot.update({
      where: { id: launching.id },
      data: { preBidsLaunching: false },
    });
  }
});
it('rejects a launch flag on an already bid auction', async () => {
  const f = await fixture();
  await ledger.db.lot.update({
    where: { id: f.lot.id },
    data: { preBidsLaunching: true },
  });
  try {
    await expect(f.recovery().audit()).rejects.toThrow();
  } finally {
    await ledger.db.lot.update({
      where: { id: f.lot.id },
      data: { preBidsLaunching: false },
    });
  }
});
it('does not recover across an unfinished purchase barrier', async () => {
  const f = await fixture();
  await redis.set(
    f.prefix + 'purchase:' + f.lot.id,
    JSON.stringify({ id: randomUUID() }),
  );
  await expect(f.recovery().audit()).rejects.toThrow();
});
it('preserves a completed Buy Now marker only when its paid invoice, debit and released holds verify', async () => {
  const f = await fixture(false, true),
    before = await f.balances();
  const report = await f.recovery().audit();
  expect(report.activeHoldCount).toBe(0);
  await f.recovery().apply(f.input(report.fingerprint));
  expect(await f.balances()).toEqual(before);
  expect(
    (await ledger.db.lot.findUniqueOrThrow({ where: { id: f.lot.id } })).status,
  ).toBe('closed');
});
it('refuses a sold marker whose durable completion no longer matches', async () => {
  const f = await fixture(false, true),
    before = await f.balances();
  await ledger.db.purchase.updateMany({
    where: { lotId: f.lot.id },
    data: { holdsReleasedAt: null },
  });
  await expect(f.recovery().audit()).rejects.toThrow();
  expect(await f.balances()).toEqual(before);
  expect(await redis.get(f.prefix + 'runtime')).toBe(f.oldMarker);
});
it('serializes simultaneous exact operator retries without duplicating the recovery audit', async () => {
  const f = await fixture(),
    report = await f.recovery().audit(),
    command = f.input(report.fingerprint),
    before = await f.balances();
  await Promise.all([f.recovery().apply(command), f.recovery().apply(command)]);
  expect(
    await ledger.db.auditLog.count({
      where: { entityId: f.prefix, action: 'bid.runtime.recovered' },
    }),
  ).toBe(1);
  expect(await f.balances()).toEqual(before);
});
it('rejects a competing operator key without leaving a new fence after a successful recovery', async () => {
  const f = await fixture(),
    report = await f.recovery().audit();
  const results = await Promise.allSettled([
    f.recovery().apply(f.input(report.fingerprint)),
    f.recovery().apply(f.input(report.fingerprint)),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(await redis.get(f.prefix + 'recovery')).toBeNull();
  const resumed = new BidService(ledger, { prefix: f.prefix, enabled: true });
  services.push(resumed);
  await resumed.start();
});
it('keeps startup paused after an interrupted Redis commit and safely resumes the same request', async () => {
  const f = await fixture(),
    before = await f.balances();
  const recovery = f.recovery({
    afterMarkerCommitted: async () => {
      throw Error('Synthetic crash');
    },
  });
  const report = await recovery.audit(),
    command = f.input(report.fingerprint);
  await expect(recovery.apply(command)).rejects.toThrow('Synthetic crash');
  const paused = new BidService(ledger, { prefix: f.prefix, enabled: true });
  services.push(paused);
  await expect(paused.start()).rejects.toThrow();
  await f.recovery().apply(command);
  expect(await f.balances()).toEqual(before);
});
it('blocks startup until a committed recovery fence is safely removed on retry', async () => {
  const f = await fixture();
  const recovery = f.recovery({
    afterDatabaseCommitted: async () => {
      throw Error('Synthetic finalisation crash');
    },
  });
  const report = await recovery.audit(),
    command = f.input(report.fingerprint);
  await expect(recovery.apply(command)).rejects.toThrow();
  const paused = new BidService(ledger, { prefix: f.prefix, enabled: true });
  services.push(paused);
  await expect(paused.start()).rejects.toThrow();
  await f.recovery().apply(command);
  const resumed = new BidService(ledger, { prefix: f.prefix, enabled: true });
  services.push(resumed);
  await resumed.start();
});
it('requires confirmed offline services and rejects idempotency-key reuse for another reason', async () => {
  const f = await fixture(),
    report = await f.recovery().audit(),
    command = f.input(report.fingerprint);
  const denied = new BidRuntimeRecovery(ledger, redis, f.prefix, {
    assertOffline: async () => {
      throw Error('Services still running');
    },
  });
  await expect(denied.apply(command)).rejects.toThrow('Services still running');
  await f.recovery().apply(command);
  await expect(
    f.recovery().apply({
      ...command,
      reason: 'Different recovery request must be rejected.',
    }),
  ).rejects.toThrow();
});
