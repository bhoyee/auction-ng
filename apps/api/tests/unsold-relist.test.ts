import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { randomUUID, randomInt } from 'node:crypto';
import { createClient } from 'redis';
import { BidService } from '../src/bids/bid-service';
import { LedgerService } from '../src/ledger/ledger-service';
import { ClosingService } from '../src/closing/closing-service';
import { CLOSE_LUA } from '../src/closing/close-lua';
import { RelistService } from '../src/closing/relist-service';
import { RelistSettingsService } from '../src/closing/relist-settings-service';
import { encryptPii, hashPii } from '../src/security/pii';

// Unsold review (owner decisions 2026-11-13): admin-set relist rules, manual
// relists at a staff-chosen price, and one relist per unsold item.
let ledger: LedgerService;
let bids: BidService;
let closer: ClosingService;
let relists: RelistService;
let settings: RelistSettingsService;
let redis: ReturnType<typeof createClient>;
let categoryId: string;
let locationId: string;
const staff = {} as Record<'admin' | 'manager' | 'intake', string>;

beforeAll(async () => {
  const url = process.env.UNSOLD_RELIST_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw new Error('Isolated unsold relist database required.');
  ledger = new LedgerService(url);
  bids = new BidService(ledger, {
    enabled: true,
    prefix: `test:relist:${randomUUID()}:`,
  });
  await bids.start();
  closer = new ClosingService(ledger, bids);
  relists = new RelistService(ledger, bids);
  settings = new RelistSettingsService(ledger);
  redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();
  categoryId = (
    await ledger.db.category.create({
      data: { name: `Relist ${randomUUID().slice(0, 8)}`, slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        code: randomUUID().slice(0, 30),
        name: `Yaba test hub ${randomUUID().slice(0, 8)}`,
        address: 'Synthetic Lagos address',
        hours: {},
        capacityPerSlot: 20,
      },
    })
  ).id;
  for (const role of ['admin', 'manager', 'intake'] as const) {
    const email = `${randomUUID()}@example.test`;
    const phone = `+234${randomInt(1000000000, 9999999999)}`;
    staff[role] = (
      await ledger.db.user.create({
        data: {
          name: `Test ${role}`,
          role,
          emailCiphertext: encryptPii(email, 'email'),
          emailHash: hashPii(email, 'email'),
          phoneCiphertext: encryptPii(phone, 'phone'),
          phoneHash: hashPii(phone, 'phone'),
          emailVerifiedAt: new Date(),
        },
      })
    ).id;
  }
});
afterAll(async () => {
  // Leave the default rules for any other suite sharing this database.
  if (settings) await setRules(2, 24, 0);
  await redis?.quit();
  await bids?.close();
  await ledger?.close();
});

async function setRules(maxRetries: number, runHours: number, cut: number) {
  const current = await settings.read(staff.admin);
  return settings.update(staff.admin, {
    maxRetries,
    runHours,
    priceCutPercent: cut,
    expectedRevision: current.revision,
    reason: 'Test rule change',
    idempotencyKey: randomUUID(),
  });
}
beforeEach(async () => {
  await setRules(2, 24, 0);
});

async function lot(extra: Record<string, unknown> = {}) {
  const row = await ledger.db.lot.create({
    data: {
      title: 'Binatone blender',
      description: 'Synthetic relist fixture',
      condition: 'open_box',
      retailPriceKobo: 4_000_000n,
      startPriceKobo: 1_250_000n,
      status: 'open',
      startAt: new Date(Date.now() - 1000),
      endAt: new Date(Date.now() + 300000),
      categoryId,
      locationId,
      ...extra,
    },
  });
  await ledger.db.lotImage.create({
    data: {
      lotId: row.id,
      url: 'https://example.test/blender.webp',
      sortOrder: 0,
    },
  });
  return row;
}
async function closeUnsold(id: string) {
  await bids.snapshot(null, id);
  await redis.eval(CLOSE_LUA, {
    keys: [bids.prefix],
    arguments: [id, String(Date.now() + 8 * 86400000)],
  });
  await closer.closeLot(id);
  return ledger.db.lotSettlement.findUniqueOrThrow({ where: { lotId: id } });
}
const relistInput = (
  item: { updatedAt: Date },
  extra: Record<string, unknown> = {},
) => ({
  startPriceKobo: 1_000_000,
  fixedPriceKobo: null,
  startsAt: null,
  runHours: 12,
  expectedUpdatedAt: item.updatedAt.toISOString(),
  idempotencyKey: randomUUID(),
  reason: 'Relist after review',
  ...extra,
});

it('lets only fee managers change the rules, checks the revision and audits it', async () => {
  const before = await settings.read(staff.admin);
  expect(before).toMatchObject({
    maxRetries: 2,
    runHours: 24,
    priceCutPercent: 0,
  });
  await expect(settings.read(staff.intake)).rejects.toThrow(/permission/);
  const key = randomUUID();
  const input = {
    maxRetries: 3,
    runHours: 48,
    priceCutPercent: 10,
    expectedRevision: before.revision,
    reason: 'Slower stock this month',
    idempotencyKey: key,
  };
  const saved = await settings.update(staff.admin, input);
  expect(saved).toMatchObject({
    maxRetries: 3,
    runHours: 48,
    priceCutPercent: 10,
  });
  expect(saved.revision).toBe(before.revision + 1);
  // An exact retry replays; a stale revision is refused.
  expect(await settings.update(staff.admin, input)).toEqual(saved);
  await expect(
    settings.update(staff.admin, { ...input, idempotencyKey: randomUUID() }),
  ).rejects.toThrow(/changed/);
  await expect(
    settings.update(staff.manager, { ...input, idempotencyKey: randomUUID() }),
  ).rejects.toThrow(/permission/);
  expect(
    await ledger.db.auditLog.count({
      where: { action: 'auctions.relist_settings_updated', entityId: key },
    }),
  ).toBe(1);
});

it('relists automatically by the admin rules, keeping bin, brand and item details', async () => {
  await setRules(1, 6, 10);
  const bin = await ledger.db.bin.create({
    data: { locationId, code: 'R-01' },
  });
  const brand = await ledger.db.brand.create({
    data: { name: `Binatone ${randomUUID().slice(0, 6)}` },
  });
  const original = await lot({
    binId: bin.id,
    brandId: brand.id,
    details: { model: 'BLG-450', colour: 'White' },
  });
  const first = await closeUnsold(original.id);
  const next = await ledger.db.lot.findUniqueOrThrow({
    where: { id: first.relistLotId ?? '' },
  });
  expect(next).toMatchObject({
    status: 'open',
    autoRelistCount: 1,
    binId: bin.id,
    brandId: brand.id,
    details: { model: 'BLG-450', colour: 'White' },
    startPriceKobo: 1_125_000n, // ₦12,500 less 10%
  });
  expect(next.endAt.getTime() - next.startAt.getTime()).toBe(6 * 3_600_000);
  // One automatic relist allowed: the second no-bid close goes to review.
  const second = await closeUnsold(next.id);
  expect(second.relistLotId).toBeNull();
  const page = await relists.list(staff.manager, {});
  expect(page.items.map((i) => i.id)).toContain(next.id);
  expect(page.items.find((i) => i.id === next.id)).toMatchObject({
    binCode: 'R-01',
    autoRelistCount: 1,
    startPriceKobo: 1_125_000,
  });
  expect((await relists.count(staff.manager)).count).toBe(page.total);
});

it('relists by hand at the chosen price through scheduling, once, and replays retries', async () => {
  await setRules(0, 24, 0);
  const item = await lot({ fixedPriceKobo: 3_000_000n });
  await closeUnsold(item.id);
  const fresh = await ledger.db.lot.findUniqueOrThrow({
    where: { id: item.id },
  });
  const countBefore = (await relists.count(staff.admin)).count;
  const input = relistInput(fresh, { fixedPriceKobo: 2_500_000 });
  const result = await relists.relist(staff.manager, item.id, input);
  const created = await ledger.db.lot.findUniqueOrThrow({
    where: { id: result.lotId },
    include: { images: true },
  });
  expect(created).toMatchObject({
    status: 'scheduled',
    startPriceKobo: 1_000_000n,
    fixedPriceKobo: 2_500_000n,
    autoRelistCount: 0,
    title: item.title,
  });
  expect(created.images).toHaveLength(1);
  expect(created.endAt.getTime() - created.startAt.getTime()).toBe(
    12 * 3_600_000,
  );
  expect(
    await ledger.db.unsoldRelist.findUniqueOrThrow({
      where: { lotId: item.id },
    }),
  ).toMatchObject({ relistLotId: result.lotId, actorId: staff.manager });
  // The auction result itself is never changed.
  expect(
    (
      await ledger.db.lotSettlement.findUniqueOrThrow({
        where: { lotId: item.id },
      })
    ).relistLotId,
  ).toBeNull();
  expect((await relists.count(staff.admin)).count).toBe(countBefore - 1);
  // Same key: same answer, no second lot. New key: refused.
  expect(await relists.relist(staff.manager, item.id, input)).toEqual(result);
  await expect(
    relists.relist(staff.manager, item.id, relistInput(fresh)),
  ).rejects.toThrow(/already been relisted/);
  expect(
    await ledger.db.auditLog.count({
      where: { action: 'lots.unsold_relisted', entityId: item.id },
    }),
  ).toBe(1);
});

it('creates exactly one lot when two staff relist the same item at once', async () => {
  await setRules(0, 24, 0);
  const item = await lot();
  await closeUnsold(item.id);
  const fresh = await ledger.db.lot.findUniqueOrThrow({
    where: { id: item.id },
  });
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      relists.relist(staff.admin, item.id, relistInput(fresh)),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    await ledger.db.lot.count({
      where: { unsoldRelistOf: { is: { lotId: item.id } } },
    }),
  ).toBe(1);
});

it('refuses staff without the relist permission, stale items and past start times', async () => {
  await setRules(0, 24, 0);
  const item = await lot();
  await closeUnsold(item.id);
  const fresh = await ledger.db.lot.findUniqueOrThrow({
    where: { id: item.id },
  });
  await expect(relists.list(staff.intake, {})).rejects.toThrow(/permission/);
  await expect(
    relists.relist(staff.intake, item.id, relistInput(fresh)),
  ).rejects.toThrow(/permission/);
  await expect(
    relists.relist(
      staff.admin,
      item.id,
      relistInput(fresh, { expectedUpdatedAt: new Date(0).toISOString() }),
    ),
  ).rejects.toThrow(/changed/);
  await expect(
    relists.relist(
      staff.admin,
      item.id,
      relistInput(fresh, {
        startsAt: new Date(Date.now() - 3_600_000).toISOString(),
      }),
    ),
  ).rejects.toMatchObject({ status: 400 });
  // A lot that is still live is not in Unsold review.
  const live = await lot();
  await expect(
    relists.relist(staff.admin, live.id, relistInput(live)),
  ).rejects.toThrow(/Only unsold items/);
});

it('lets a relist-only role relist but not change the buy-now price', async () => {
  await setRules(0, 24, 0);
  const role = await ledger.db.staffRole.create({
    data: {
      name: 'Relist desk',
      key: `relist-${randomUUID()}`,
      permissions: ['lots.relist'],
    },
  });
  await ledger.db.staffMembership.create({
    data: { userId: staff.intake, roleId: role.id },
  });
  try {
    const item = await lot({ fixedPriceKobo: 3_000_000n });
    await closeUnsold(item.id);
    const fresh = await ledger.db.lot.findUniqueOrThrow({
      where: { id: item.id },
    });
    await expect(
      relists.relist(
        staff.intake,
        item.id,
        relistInput(fresh, { fixedPriceKobo: 100 }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    // Keeping the buy-now price is fine; the starting price may change.
    const result = await relists.relist(
      staff.intake,
      item.id,
      relistInput(fresh, { fixedPriceKobo: 3_000_000 }),
    );
    expect(
      await ledger.db.lot.findUniqueOrThrow({ where: { id: result.lotId } }),
    ).toMatchObject({ startPriceKobo: 1_000_000n, fixedPriceKobo: 3_000_000n });
  } finally {
    await ledger.db.staffMembership.delete({ where: { userId: staff.intake } });
  }
});

it('never cuts an automatic relist below the category lowest start price', async () => {
  await setRules(1, 24, 50);
  const category = await ledger.db.category.create({
    data: {
      name: `Floor ${randomUUID().slice(0, 8)}`,
      slug: randomUUID(),
      minStartPriceKobo: 1_000_000n,
    },
  });
  const item = await lot({ categoryId: category.id });
  const settled = await closeUnsold(item.id);
  expect(
    (
      await ledger.db.lot.findUniqueOrThrow({
        where: { id: settled.relistLotId ?? '' },
      })
    ).startPriceKobo,
  ).toBe(1_000_000n); // ₦12,500 less 50% would be ₦6,250
});

async function unsoldItem(extra: Record<string, unknown> = {}) {
  const item = await lot(extra);
  await closeUnsold(item.id);
  return ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } });
}
const bulkInput = (
  items: { id: string; updatedAt: Date }[],
  extra: Record<string, unknown> = {},
) => ({
  items: items.map((item) => ({
    id: item.id,
    expectedUpdatedAt: item.updatedAt.toISOString(),
  })),
  startsAt: null,
  runHours: 12,
  idempotencyKey: randomUUID(),
  ...extra,
});
const relistsOf = (ids: string[]) =>
  ledger.db.unsoldRelist.findMany({
    where: { lotId: { in: ids } },
    include: { relistLot: true },
  });

it('relists many items at their own prices, skips the rest and replays safely', async () => {
  await setRules(0, 24, 0);
  const a = await unsoldItem();
  const b = await unsoldItem({
    startPriceKobo: 2_000_000n,
    fixedPriceKobo: 3_000_000n,
  });
  const stale = await unsoldItem();
  const gone = await unsoldItem();
  await ledger.db.lot.update({
    where: { id: gone.id },
    data: { archivedAt: new Date() },
  });
  const done = await unsoldItem();
  await relists.relist(staff.admin, done.id, relistInput(done));
  const missing = { id: randomUUID(), updatedAt: new Date() };
  const input = bulkInput([
    a,
    { ...stale, updatedAt: new Date(0) },
    gone,
    done,
    missing,
    b,
  ]);
  const result = await relists.relistMany(staff.manager, input);
  expect(result.done).toBe(2);
  expect(result.skipped.map((item) => item.id)).toEqual([
    stale.id,
    gone.id,
    done.id,
    missing.id,
  ]);
  const links = await relistsOf([a.id, b.id]);
  expect(links).toHaveLength(2);
  expect(links.find((l) => l.lotId === a.id)?.relistLot).toMatchObject({
    status: 'scheduled',
    startPriceKobo: 1_250_000n,
    fixedPriceKobo: null,
    autoRelistCount: 0,
  });
  expect(links.find((l) => l.lotId === b.id)?.relistLot).toMatchObject({
    startPriceKobo: 2_000_000n,
    fixedPriceKobo: 3_000_000n,
  });
  // The same batch again reports the same and creates nothing.
  expect(await relists.relistMany(staff.manager, input)).toEqual(result);
  expect(await relistsOf([a.id, b.id, stale.id, gone.id])).toHaveLength(2);
  // The same key with other terms is not replayed.
  expect(
    await relists.relistMany(staff.manager, { ...input, runHours: 24 }),
  ).toMatchObject({ done: 0 });
});

it('relists each item once when staff bulk relist the same items together', async () => {
  await setRules(0, 24, 0);
  const items = [await unsoldItem(), await unsoldItem(), await unsoldItem()];
  const results = await Promise.all(
    [staff.admin, staff.manager, staff.admin, staff.manager].map((actor) =>
      relists.relistMany(actor, bulkInput(items)),
    ),
  );
  expect(results.reduce((sum, r) => sum + r.done, 0)).toBe(3);
  expect(await relistsOf(items.map((i) => i.id))).toHaveLength(3);
});

it('reports items relisted earlier when a retry comes after the start time', async () => {
  await setRules(0, 24, 0);
  const late = await unsoldItem();
  const early = await unsoldItem();
  const startsAt = new Date(Date.now() - 54_000).toISOString();
  const input = bulkInput([late, early], { startsAt });
  // First attempt: one item is refused, the other is relisted, and the
  // answer is lost. The refusal clears before the retry.
  await ledger.db.lot.update({
    where: { id: late.id },
    data: { archivedAt: new Date(), updatedAt: late.updatedAt },
  });
  expect(await relists.relistMany(staff.admin, input)).toMatchObject({
    done: 1,
  });
  await ledger.db.lot.update({
    where: { id: late.id },
    data: { archivedAt: null, updatedAt: late.updatedAt },
  });
  await new Promise((resolve) => setTimeout(resolve, 6_500));
  expect(await relists.relistMany(staff.admin, input)).toMatchObject({
    done: 1,
    skipped: [{ id: late.id, reason: expect.stringMatching(/start time/) }],
  });
});

it('refuses a bad bulk request before any item changes', async () => {
  await setRules(0, 24, 0);
  const item = await unsoldItem();
  await expect(
    relists.relistMany(staff.intake, bulkInput([item])),
  ).rejects.toThrow(/permission/);
  await expect(
    relists.dismiss(staff.intake, { ids: [item.id] }),
  ).rejects.toThrow(/permission/);
  await expect(relists.dismissed(staff.intake, {})).rejects.toThrow(
    /permission/,
  );
  await expect(relists.restore(staff.intake, item.id)).rejects.toThrow(
    /permission/,
  );
  await expect(
    relists.relistMany(
      staff.admin,
      bulkInput([item], {
        startsAt: new Date(Date.now() - 3_600_000).toISOString(),
      }),
    ),
  ).rejects.toMatchObject({ status: 400 });
  for (const bad of [
    bulkInput([]),
    bulkInput([item, item]),
    bulkInput(
      Array.from({ length: 51 }, () => ({ ...item, id: randomUUID() })),
    ),
    bulkInput([item], { startPriceKobo: 100 }),
  ])
    await expect(relists.relistMany(staff.admin, bad)).rejects.toThrow();
  expect(await relistsOf([item.id])).toHaveLength(0);
});

it('takes items off the list without changing the lot, and restores them', async () => {
  await setRules(0, 24, 0);
  const item = await unsoldItem();
  const live = await lot();
  const settlement = await ledger.db.lotSettlement.findUniqueOrThrow({
    where: { lotId: item.id },
  });
  const before = (await relists.count(staff.admin)).count;
  const result = await relists.dismiss(staff.manager, {
    ids: [item.id, live.id],
  });
  expect(result).toMatchObject({ done: 1, skipped: [{ id: live.id }] });
  expect((await relists.count(staff.admin)).count).toBe(before - 1);
  expect(
    (await relists.list(staff.admin, { limit: 50 })).items.map((i) => i.id),
  ).not.toContain(item.id);
  expect(
    await ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } }),
  ).toEqual(item);
  expect(
    await ledger.db.lotSettlement.findUniqueOrThrow({
      where: { lotId: item.id },
    }),
  ).toEqual(settlement);
  await expect(
    relists.relist(staff.admin, item.id, relistInput(item)),
  ).rejects.toThrow(/Restore it first/);
  // Deleting again is harmless and keeps the first person and time.
  const first = await ledger.db.unsoldDismissal.findUniqueOrThrow({
    where: { lotId: item.id },
  });
  expect(await relists.dismiss(staff.admin, { ids: [item.id] })).toMatchObject({
    done: 1,
    skipped: [],
  });
  expect(
    await ledger.db.unsoldDismissal.findUniqueOrThrow({
      where: { lotId: item.id },
    }),
  ).toEqual(first);
  expect(
    (await relists.dismissed(staff.admin, {})).items.find(
      (i) => i.id === item.id,
    ),
  ).toMatchObject({ deletedBy: 'Test manager', startPriceKobo: 1_250_000 });
  await relists.restore(staff.admin, item.id);
  await relists.restore(staff.admin, item.id);
  expect((await relists.count(staff.admin)).count).toBe(before);
  await relists.relist(staff.admin, item.id, relistInput(item));
  for (const [action, count] of [
    ['lots.unsold_dismissed', 1],
    ['lots.unsold_restored', 1],
  ] as const)
    expect(
      await ledger.db.auditLog.count({
        where: { action, entityId: item.id },
      }),
    ).toBe(count);
});

it('makes a delete permanent after 30 days', async () => {
  await setRules(0, 24, 0);
  const item = await unsoldItem();
  await ledger.db.unsoldDismissal.create({
    data: {
      lotId: item.id,
      actorId: staff.admin,
      dismissedAt: new Date(Date.now() - 30 * 86_400_000),
    },
  });
  expect(
    (await relists.dismissed(staff.admin, { limit: 50 })).items.map(
      (i) => i.id,
    ),
  ).not.toContain(item.id);
  await expect(relists.restore(staff.admin, item.id)).rejects.toThrow(
    /30 days/,
  );
  // The database refuses too, whoever asks.
  await expect(
    ledger.db.unsoldDismissal.delete({ where: { lotId: item.id } }),
  ).rejects.toThrow();
  expect(
    await ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } }),
  ).toEqual(item);
});

it('lets only one of a relist and a delete win', async () => {
  await setRules(0, 24, 0);
  for (let round = 0; round < 5; round += 1) {
    const item = await unsoldItem();
    const [relisted, deleted] = await Promise.all([
      relists.relistMany(staff.admin, bulkInput([item])),
      relists.dismiss(staff.manager, { ids: [item.id] }),
    ]);
    expect(relisted.done + deleted.done).toBe(1);
    expect(
      (await relistsOf([item.id])).length +
        (await ledger.db.unsoldDismissal.count({ where: { lotId: item.id } })),
    ).toBe(1);
  }
});
