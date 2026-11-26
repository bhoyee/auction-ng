import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  batchDetailSchema,
  batchPageSchema,
  batchPickerSchema,
  batchResultSchema,
  lotEditorSchema,
  lotViewSchema,
  supplierPageSchema,
} from '@auction-ng/shared';
import { createApi } from '../src/app';
import { LedgerService } from '../src/ledger/ledger-service';
import { recalculateQueued } from '../src/batches/batch-recalc';
import { purgeDeletedBatches } from '../src/batches/batch-deletion';
import { encryptPii, hashPii } from '../src/security/pii';

// Inventory batches API: every role, batch-required lots, cost shares, money
// back, relists counted once, write-offs, attachments and suppliers.
let app: Awaited<ReturnType<typeof createApi>>;
let base = '';
let ledger: LedgerService;
type Who = { token: string; device: string; userId: string };
const roles = [
  'admin',
  'manager',
  'intake',
  'warehouse',
  'finance',
  'support',
] as const;
const people = {} as Record<(typeof roles)[number], Who>;
let categoryId = '';
let locationId = '';
let otherLocationId = '';
let namespace = '';
let buyerId = '';
const unique = () => randomUUID().slice(0, 8);

beforeAll(async () => {
  const url = process.env.BATCHES_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !url ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated batches database required.');
  app = await createApi({
    databaseUrl: url,
    mode: 'local',
    origins: ['http://localhost:3301'],
    emailProvider: { async sendCode() {} },
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  ledger = new LedgerService(url);
  for (const role of roles) people[role] = await staff(role);
  buyerId = (await person('buyer')).id;
  categoryId = (
    await ledger.db.category.create({
      data: { name: `Phones ${unique()}`, slug: randomUUID() },
    })
  ).id;
  const location = (name: string) =>
    ledger.db.location.create({
      data: {
        code: randomUUID().slice(0, 30),
        name: `${name} ${unique()}`,
        address: 'Synthetic',
        hours: {},
        capacityPerSlot: 20,
      },
    });
  locationId = (await location('Ikeja hub')).id;
  otherLocationId = (await location('Yaba hub')).id;
  namespace = `test:batches:${randomUUID()}:`;
  await ledger.db
    .$executeRaw`INSERT INTO bid_engine_runtime(namespace, redis_run_id) VALUES (${namespace}, 'test')`;
});
afterAll(async () => {
  await ledger?.close();
  await app?.close();
});

async function person(role: string) {
  const email = `${randomUUID()}@example.test`;
  return ledger.db.user.create({
    data: {
      name: `Chinedu Okafor ${role}`,
      role,
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
      ...(role === 'buyer'
        ? {}
        : {
            staffCredential: {
              create: { passwordHash: 'synthetic-not-a-login' },
            },
          }),
    },
  });
}
async function staff(role: string): Promise<Who> {
  const token = randomBytes(32).toString('base64url');
  const device = randomUUID();
  const { id } = await person(role);
  await ledger.db.authSession.create({
    data: {
      userId: id,
      client: 'web',
      staffAuthenticated: true,
      familyId: randomUUID(),
      deviceHash: hashPii(`web:${device}`, 'auth-device'),
      accessHash: hashPii(token, 'auth-token'),
      refreshHash: hashPii(randomUUID(), 'refresh'),
      accessExpiresAt: new Date(Date.now() + 3600000),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return { token, device, userId: id };
}
async function call(who: Who, path: string, body?: unknown, method?: string) {
  const response = await fetch(`${base}/admin/${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      Authorization: `Bearer ${who.token}`,
      'X-Device-Id': who.device,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // File downloads aren't JSON.
  }
  return { status: response.status, json, text };
}
async function ok<T>(
  shape: { parse(value: unknown): T },
  who: Who,
  path: string,
  body?: unknown,
) {
  const r = await call(who, path, body);
  if (r.status !== 200 && r.status !== 201)
    throw new Error(`${path} -> ${r.status} ${r.text}`);
  return shape.parse(r.json);
}
const supplierBody = (extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  name: `Konga returns ${unique()}`,
  type: 'marketplace_returns',
  contactName: 'Adaeze Nwosu',
  phone: '0803 555 0198',
  email: 'returns@konga.example',
  address: 'Ilupeju, Lagos',
  bank: { bankName: 'GTBank', accountNumber: '0123456789' },
  paymentTerms: null,
  usualCategoryIds: [categoryId],
  notes: null,
  ...extra,
});
const newSupplier = async (extra: Record<string, unknown> = {}) =>
  (
    await ok(
      batchResultSchema,
      people.admin,
      'lot-setup/suppliers',
      supplierBody(extra),
    )
  ).id;
const batchBody = (
  supplierId: string,
  extra: Record<string, unknown> = {},
) => ({
  id: null,
  expectedUpdatedAt: null,
  idempotencyKey: randomUUID(),
  supplierId,
  name: 'Konga returns, November',
  supplierRef: 'KNG-RT-11-0442',
  boughtOn: '2026-01-05',
  locationId,
  status: 'received',
  expectedOn: null,
  itemsExpected: 3,
  categoryIds: [categoryId],
  costSupplierKobo: 900_000,
  costTransportKobo: 80_000,
  costCustomsKobo: 15_000,
  costOtherKobo: 5_000,
  costShareMethod: 'retail',
  paidFrom: 'business',
  notes: null,
  ...extra,
});
async function newBatch(extra: Record<string, unknown> = {}) {
  const supplierId =
    (extra.supplierId as string | undefined) ?? (await newSupplier());
  const { id } = await ok(
    batchResultSchema,
    people.manager,
    'batches',
    batchBody(supplierId, extra),
  );
  return { id, supplierId };
}
const lotBody = (extra: Record<string, unknown> = {}) => ({
  lot: {
    title: `Tecno Camon ${unique()}`,
    description: 'Returned unused. Powers on.',
    condition: 'open_box',
    categoryId,
    locationId,
    binId: null,
    brandId: null,
    supplierId: null,
    batchId: null,
    startPriceKobo: 500_000,
    retailPriceKobo: 1_000_000,
    runTimeMinutes: 1440,
    details: {},
    included: [],
    defects: [],
    ...extra,
  },
  expectedUpdatedAt: null,
  idempotencyKey: randomUUID(),
});
const newLot = (batchId: string, extra: Record<string, unknown> = {}) =>
  ok(
    lotEditorSchema,
    people.intake,
    'inventory/lots',
    lotBody({ batchId, ...extra }),
  );
const detail = async (id: string, who = people.admin) => {
  await recalculateQueued(ledger.db);
  return ok(batchDetailSchema, who, `batches/${id}`);
};
const cost = async (lotId: string) =>
  Number(
    (await ledger.db.lotCost.findUnique({ where: { lotId } }))?.unitCostKobo ??
      -1,
  );
/** Close a lot as sold with an invoice, or unsold. */
async function settle(
  lotId: string,
  sale: { hammer: number; premium: number; status?: string } | null,
) {
  await ledger.db.lot.update({
    where: { id: lotId },
    data: { status: 'closed' },
  });
  const now = new Date();
  let invoiceId: string | null = null;
  if (sale)
    invoiceId = (
      await ledger.db.invoice.create({
        data: {
          userId: buyerId,
          hammerTotalKobo: BigInt(sale.hammer),
          premiumKobo: BigInt(sale.premium),
          lotFeeKobo: 0n,
          vatKobo: 0n,
          totalKobo: BigInt(sale.hammer + sale.premium),
          status: 'pending',
          lines: {
            create: {
              lotId,
              hammerKobo: BigInt(sale.hammer),
              premiumKobo: BigInt(sale.premium),
              lotFeeKobo: 0n,
              vatKobo: 0n,
              totalKobo: BigInt(sale.hammer + sale.premium),
            },
          },
        },
      })
    ).id;
  if (invoiceId && sale?.status !== 'pending')
    await ledger.db.invoice.update({
      where: { id: invoiceId },
      data: { status: sale?.status ?? 'paid' },
    });
  const policy = await ledger.db.auctionFeePolicy.findFirstOrThrow();
  await ledger.db.lotSettlement.create({
    data: {
      lotId,
      namespace,
      feeVersion: policy.version,
      streamId: '0-0',
      barrierId: '0-0',
      endAt: now,
      closedAt: now,
      snapshot: {},
      status: 'unsold',
    },
  });
  return invoiceId;
}

describe('batches and lots', () => {
  it('needs an open batch at the same location for every new lot', async () => {
    const { id, supplierId } = await newBatch();
    expect(
      (await call(people.intake, 'inventory/lots', lotBody())).json,
    ).toMatchObject({ field: 'batchId' });
    expect(
      (
        await call(
          people.intake,
          'inventory/lots',
          lotBody({ batchId: id, locationId: otherLocationId }),
        )
      ).json,
    ).toMatchObject({ field: 'batchId' });
    expect(
      (
        await call(
          people.admin,
          'lots',
          {
            title: 'No batch',
            description: 'x',
            condition: 'new',
            retailPriceKobo: 1,
            startPriceKobo: 1,
            categoryId,
            locationId,
            startsAt: new Date(Date.now() + 1e6).toISOString(),
            endsAt: new Date(Date.now() + 2e6).toISOString(),
          },
          'POST',
        )
      ).status,
    ).not.toBe(201);
    const lot = await newLot(id);
    // The supplier always follows the batch.
    expect(lot.lot).toMatchObject({ batchId: id, supplierId });
    // A lot can't leave its batch, but an older lot without one can be saved.
    expect(
      (
        await call(
          people.intake,
          `inventory/lots/${lot.id}`,
          {
            lot: { ...lot.lot, batchId: null },
            expectedUpdatedAt: lot.updatedAt,
            idempotencyKey: randomUUID(),
          },
          'PATCH',
        )
      ).json,
    ).toMatchObject({ field: 'batchId' });
    const picker = await ok(
      batchPickerSchema,
      people.intake,
      `batches/picker?locationId=${locationId}`,
    );
    expect(picker.lastUsedId).toBe(id);
    expect(picker.items.map((b) => b.id)).toContain(id);
  });

  it('gives batches B- numbers and replays an exact retry', async () => {
    const supplierId = await newSupplier();
    const body = batchBody(supplierId);
    const first = await ok(batchResultSchema, people.admin, 'batches', body);
    const again = await ok(batchResultSchema, people.admin, 'batches', body);
    expect(again).toEqual(first);
    expect(await ledger.db.batch.count({ where: { supplierId } })).toBe(1);
    expect((await detail(first.id)).batch.code).toMatch(/^B-\d{4}$/);
    expect(
      (
        await call(people.admin, 'batches', {
          ...body,
          name: 'Changed',
        })
      ).status,
    ).toBe(409);
  });

  it('shares the exact batch cost by retail and again when lots change', async () => {
    const { id } = await newBatch();
    const a = await newLot(id, { retailPriceKobo: 1_000_000 });
    const b = await newLot(id, { retailPriceKobo: 2_000_000 });
    let d = await detail(id);
    expect(d.batch.costKobo).toBe(1_000_000);
    expect(await cost(a.id)).toBe(333_333);
    expect(await cost(b.id)).toBe(666_667);
    expect(d.costsAreEstimates).toBe(true);
    const c = await newLot(id, { retailPriceKobo: 1_000_000 });
    await detail(id);
    expect((await cost(a.id)) + (await cost(b.id)) + (await cost(c.id))).toBe(
      1_000_000,
    );
    expect(await cost(b.id)).toBe(500_000);
    await ok(batchResultSchema, people.admin, 'batches', {
      ...batchBody(d.batch.supplierId, { costShareMethod: 'equal' }),
      id,
      expectedUpdatedAt: (await detail(id)).batch.updatedAt,
    });
    d = await detail(id);
    expect([await cost(a.id), await cost(b.id), await cost(c.id)]).toEqual([
      333_333, 333_334, 333_333,
    ]);
    expect(d.left.categories).toEqual([
      expect.objectContaining({ items: 3, costKobo: 1_000_000 }),
    ]);
  });

  it('counts paid money only, drops refunds, and reports per supplier', async () => {
    const { id, supplierId } = await newBatch();
    const [a, b, c] = [await newLot(id), await newLot(id), await newLot(id)];
    const paid = await settle(a.id, { hammer: 1_000_000, premium: 150_000 });
    await settle(b.id, { hammer: 700_000, premium: 1, status: 'pending' });
    let d = await detail(id);
    expect(d.batch).toMatchObject({
      status: 'selling',
      moneyBackKobo: 1_150_000,
      marginKobo: 150_000,
      recoveryPercent: 115,
      sold: 1,
      soldPercent: 33,
    });
    expect(d.recovery?.breakEvenOn).not.toBeNull();
    const suppliers = await ok(
      supplierPageSchema,
      people.finance,
      'lot-setup/suppliers?limit=50',
    );
    expect(suppliers.items.find((s) => s.id === supplierId)).toMatchObject({
      batches: 1,
      totalSpentKobo: 1_000_000,
      gotBackPercent: 115,
    });
    await ledger.db.invoice.update({
      where: { id: paid ?? '' },
      data: { status: 'refunded' },
    });
    d = await detail(id);
    expect(d.batch).toMatchObject({ moneyBackKobo: 0, sold: 0 });
    expect(d.left.unsold).toBe(3);
    expect(c.id).toBeTruthy();
  });

  it('counts a relisted item once and keeps its batch', async () => {
    const { id } = await newBatch();
    const first = await newLot(id);
    await newLot(id);
    const source = await ledger.db.lot.findUniqueOrThrow({
      where: { id: first.id },
    });
    await settle(first.id, null);
    const copy = await ledger.db.lot.create({
      data: {
        title: source.title,
        description: source.description,
        condition: source.condition,
        retailPriceKobo: source.retailPriceKobo,
        startPriceKobo: source.startPriceKobo,
        categoryId,
        locationId,
        batchId: id,
        startAt: new Date(),
        endAt: new Date(Date.now() + 3600000),
        status: 'open',
      },
    });
    await ledger.db.unsoldRelist.create({
      data: {
        lotId: first.id,
        relistLotId: copy.id,
        actorId: people.admin.userId,
      },
    });
    const d = await detail(id);
    expect(d.batch.lots).toBe(2);
    expect(await cost(first.id)).toBe(-1);
    expect(await cost(copy.id)).toBe(500_000);
    await settle(copy.id, { hammer: 10_000, premium: 1_500 });
    expect((await detail(id)).batch).toMatchObject({
      lots: 2,
      sold: 1,
      moneyBackKobo: 11_500,
    });
  });

  it('closes by itself, reopens by hand and refuses new lots while closed', async () => {
    const { id } = await newBatch();
    const lots = [await newLot(id), await newLot(id)];
    const before = await detail(id);
    await ok(batchResultSchema, people.warehouse, 'batches/receive', {
      id,
      expectedUpdatedAt: before.batch.updatedAt,
      idempotencyKey: randomUUID(),
      itemsReceived: 2,
    });
    for (const l of lots) await settle(l.id, { hammer: 10_000, premium: 0 });
    let d = await detail(id);
    expect(d.batch.status).toBe('closed');
    expect(d.closedReason).toContain('Every item');
    expect(
      (await call(people.intake, 'inventory/lots', lotBody({ batchId: id })))
        .json,
    ).toMatchObject({ field: 'batchId' });
    const reason = {
      id,
      expectedUpdatedAt: d.batch.updatedAt,
      idempotencyKey: randomUUID(),
      reason: 'One more box was found',
    };
    expect((await call(people.intake, 'batches/reopen', reason)).status).toBe(
      403,
    );
    await ok(batchResultSchema, people.admin, 'batches/reopen', reason);
    d = await detail(id);
    expect(d.batch.status).toBe('selling');
    // It isn't closed again by itself.
    await newLot(id);
    expect((await detail(id)).batch.status).toBe('selling');
  });

  it('shares the final cost when closed before the worker runs', async () => {
    const { id } = await newBatch();
    const lots = [await newLot(id), await newLot(id)];
    // Nothing has been recalculated yet.
    const batch = await ledger.db.batch.findUniqueOrThrow({ where: { id } });
    await ok(batchResultSchema, people.admin, 'batches/close', {
      id,
      expectedUpdatedAt: batch.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
      reason: 'All accounted for',
    });
    expect([
      await cost(lots[0]?.id ?? ''),
      await cost(lots[1]?.id ?? ''),
    ]).toEqual([500_000, 500_000]);
    // Neither a restored lot nor a moved one can get into a closed batch.
    const lot = lots[0];
    const open = (await newBatch()).id;
    expect(
      (
        await call(
          people.admin,
          `inventory/lots/${lot?.id}`,
          {
            lot: { ...lot?.lot, batchId: open },
            expectedUpdatedAt: lot?.updatedAt,
            idempotencyKey: randomUUID(),
          },
          'PATCH',
        )
      ).json,
    ).toMatchObject({ field: 'batchId' });
    const deleted = await ledger.db.lot.update({
      where: { id: lot?.id },
      data: {
        deletedAt: new Date(),
        deleteReason: 'Added twice',
        deletedById: people.admin.userId,
      },
    });
    expect(
      (
        await call(people.admin, `inventory/lots/${lot?.id}/restore`, {
          expectedUpdatedAt: deleted.updatedAt.toISOString(),
        })
      ).status,
    ).toBe(409);
  });

  it('writes off refunded and cancelled items', async () => {
    const { id } = await newBatch();
    const [refunded, cancelled] = [await newLot(id), await newLot(id)];
    await settle(refunded.id, {
      hammer: 10_000,
      premium: 0,
      status: 'refunded',
    });
    await ledger.db.lot.update({
      where: { id: cancelled.id },
      data: { status: 'cancelled' },
    });
    expect(
      (
        await call(people.admin, `batches/${id}/write-off`, {
          lotIds: [refunded.id, cancelled.id],
          reason: 'Damaged on return',
          idempotencyKey: randomUUID(),
        })
      ).json,
    ).toMatchObject({ done: 2 });
  });

  it('writes off unsold items with their cost, and never sold or live ones', async () => {
    const { id } = await newBatch();
    const [draft, sold, live] = [
      await newLot(id),
      await newLot(id),
      await newLot(id),
    ];
    await settle(sold.id, { hammer: 10_000, premium: 0 });
    await ledger.db.lot.update({
      where: { id: live.id },
      data: { status: 'open' },
    });
    const body = {
      lotIds: [draft.id, sold.id, live.id],
      reason: 'Water damage in store',
      idempotencyKey: randomUUID(),
    };
    expect(
      (await call(people.finance, `batches/${id}/write-off`, body)).status,
    ).toBe(403);
    const r = await call(people.manager, `batches/${id}/write-off`, body);
    expect(r.json).toMatchObject({ done: 1 });
    expect(r.json.skipped).toHaveLength(2);
    const d = await detail(id);
    expect(d.batch).toMatchObject({ writtenOff: 1, sold: 1, lots: 3 });
    // Its cost still counts against the batch.
    expect(await cost(draft.id)).toBeGreaterThan(0);
    const lot = await ledger.db.lot.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(lot.archivedAt).not.toBeNull();
    expect(
      (
        await call(people.admin, `inventory/lots/${draft.id}/unarchive`, {
          expectedUpdatedAt: lot.updatedAt.toISOString(),
        })
      ).status,
    ).toBe(409);
    expect(
      await ledger.db.auditLog.count({
        where: { entityId: draft.id, action: 'lots.written_off' },
      }),
    ).toBe(1);
  });

  it('tells open screens about new numbers, and stays quiet otherwise', async () => {
    const { id } = await newBatch();
    await newLot(id);
    await recalculateQueued(ledger.db);
    const events = () =>
      ledger.db.staffActivityEvent.count({
        where: { entityId: id, kind: 'workspace.changed' },
      });
    const before = await events();
    expect(before).toBeGreaterThan(0);
    await ledger.db.batchRecalc.create({ data: { batchId: id } });
    await recalculateQueued(ledger.db);
    expect(await events()).toBe(before);
    await newLot(id);
    await recalculateQueued(ledger.db);
    expect(await events()).toBe(before + 1);
  });

  it('never loses a change that arrives while it recalculates', async () => {
    const { id } = await newBatch();
    await Promise.all([
      ...Array.from({ length: 6 }, () => newLot(id)),
      ...Array.from({ length: 4 }, () => recalculateQueued(ledger.db)),
    ]);
    expect((await detail(id)).batch.lots).toBe(6);
    const total = await ledger.db.lotCost.aggregate({
      where: { batchId: id },
      _sum: { unitCostKobo: true },
    });
    expect(Number(total._sum.unitCostKobo)).toBe(1_000_000);
    expect(await ledger.db.batchRecalc.count({ where: { batchId: id } })).toBe(
      0,
    );
  });
});

describe('permissions', () => {
  it('shows no cost anywhere to intake and warehouse, and nothing to support', async () => {
    const { id } = await newBatch();
    const lot = await newLot(id);
    await recalculateQueued(ledger.db);
    for (const role of ['intake', 'warehouse'] as const) {
      for (const path of [
        'batches?tab=all',
        `batches/${id}`,
        'batches/picker',
        `batches/${id}/stuck`,
        `batches/${id}/activity`,
      ]) {
        const r = await call(people[role], path);
        expect([role, path, r.status]).toEqual([role, path, 200]);
        // Every money field is null: no digits after any kobo/percent key.
        for (const key of [
          'costKobo',
          'moneyBackKobo',
          'marginKobo',
          'recoveryPercent',
          'unsoldCostKobo',
          'averageRecoveryPercent',
        ])
          expect(r.text).not.toMatch(new RegExp(`"${key}":-?\\d`));
        expect(r.text).not.toContain('KNG-RT-11-0442');
      }
      const exported = await call(people[role], 'batches/export?tab=all');
      expect(String(exported.json.csv)).not.toContain('Cost');
      for (const path of [`batches/${id}/files`, 'batches/form'])
        expect((await call(people[role], path)).status).toBe(403);
      for (const path of ['lot-setup/suppliers'])
        expect((await call(people[role], path)).status).toBe(403);
      expect(
        (await call(people[role], 'batches', batchBody(randomUUID()))).status,
      ).toBe(403);
    }
    for (const path of [
      'batches',
      `batches/${id}`,
      'batches/picker',
      'batches/export',
      'lot-setup/suppliers',
    ])
      expect([path, (await call(people.support, path)).status]).toEqual([
        path,
        403,
      ]);
    // Unit cost: finance and admin only, unless an admin grants it.
    const view = (who: Who) =>
      ok(lotViewSchema, who, `inventory/lots/${lot.id}`);
    expect((await view(people.admin)).unitCostKobo).toBe(1_000_000);
    expect((await view(people.manager)).unitCostKobo).toBeNull();
    expect((await view(people.intake)).unitCostKobo).toBeNull();
  });

  it('keeps bank details to finance and admin', async () => {
    const id = await newSupplier();
    const read = async (who: Who) =>
      (
        await ok(supplierPageSchema, who, 'lot-setup/suppliers?limit=50')
      ).items.find((s) => s.id === id);
    expect((await read(people.finance))?.bank?.accountNumber).toBe(
      '0123456789',
    );
    const seen = await read(people.manager);
    expect(seen?.bank).toBeNull();
    expect(seen?.phone).toBe('+2348035550198');
    // A manager's save leaves the bank details alone, and can't set them.
    const { bank, ...rest } = supplierBody();
    expect(bank).toBeDefined();
    await ok(batchResultSchema, people.manager, 'lot-setup/suppliers', {
      ...rest,
      id,
      expectedUpdatedAt: seen?.updatedAt,
      name: seen?.name,
    });
    expect((await read(people.admin))?.bank?.accountNumber).toBe('0123456789');
    expect(
      (await call(people.manager, 'lot-setup/suppliers', supplierBody()))
        .status,
    ).toBe(409);
    // Personal data is encrypted where it is stored.
    const row = await ledger.db.supplier.findUniqueOrThrow({ where: { id } });
    expect(row.phone).toBeNull();
    for (const value of [row.phoneCiphertext, row.addressCiphertext])
      expect(Buffer.from(value ?? []).toString()).not.toMatch(/803|Ilupeju/);
  });

  it('lets an admin give a role what it needs', async () => {
    const role = await ledger.db.staffRole.create({
      data: {
        name: `Buyer ${unique()}`,
        key: randomUUID(),
        permissions: ['batches.read', 'batches.costs', 'lots.cost'],
      },
    });
    const who = await staff('warehouse');
    await ledger.db.staffMembership.create({
      data: { userId: who.userId, roleId: role.id },
    });
    const { id } = await newBatch();
    expect((await detail(id, who)).batch.costKobo).toBe(1_000_000);
    expect((await call(who, 'batches', batchBody(randomUUID()))).status).toBe(
      403,
    );
  });

  it('lists batches with cards, tabs and filters', async () => {
    const { id, supplierId } = await newBatch({
      status: 'arriving',
      expectedOn: '2099-01-01',
    });
    const page = await ok(
      batchPageSchema,
      people.admin,
      `batches?tab=arriving&supplierIds=${supplierId}`,
    );
    expect(page.items.map((b) => b.id)).toEqual([id]);
    expect(page.counts).toMatchObject({ arriving: 1, open: 1, closed: 0 });
    expect(page.canManage).toBe(true);
    expect((await call(people.admin, 'batches?tab=open&limit=51')).status).toBe(
      400,
    );
  });
});

describe('suppliers and files', () => {
  it('pauses suppliers with batches and deletes only unused ones', async () => {
    const { id, supplierId } = await newBatch();
    expect(id).toBeTruthy();
    const remove = await call(people.admin, 'lot-setup/suppliers/delete', {
      id: supplierId,
      idempotencyKey: randomUUID(),
    });
    expect(remove.json).toMatchObject({
      message: expect.stringContaining('pause them instead'),
    });
    await ok(batchResultSchema, people.admin, 'lot-setup/suppliers/active', {
      id: supplierId,
      active: false,
      idempotencyKey: randomUUID(),
    });
    expect(
      (await call(people.admin, 'batches', batchBody(supplierId))).json,
    ).toMatchObject({ field: 'supplierId' });
    const unused = await newSupplier();
    await ok(batchResultSchema, people.admin, 'lot-setup/suppliers/delete', {
      id: unused,
      idempotencyKey: randomUUID(),
    });
  });

  it('stores attachments encrypted, checks their type and retries once', async () => {
    const { id } = await newBatch();
    const content = Buffer.from('%PDF-1.4 KNG invoice').toString('base64');
    const body = {
      name: 'KNG invoice.pdf',
      content,
      idempotencyKey: randomUUID(),
    };
    await ok(batchResultSchema, people.admin, `batches/${id}/files`, body);
    await ok(batchResultSchema, people.admin, `batches/${id}/files`, body);
    const rows = await ledger.db.batchAttachment.findMany({
      where: { batchId: id },
    });
    expect(rows).toHaveLength(1);
    expect(
      Buffer.from(rows[0]?.contentCiphertext ?? []).toString(),
    ).not.toContain('PDF');
    const file = await call(
      people.finance,
      `batches/${id}/files/${rows[0]?.id}`,
    );
    expect(file.text).toBe('%PDF-1.4 KNG invoice');
    expect(
      (
        await call(people.admin, `batches/${id}/files`, {
          name: 'invoice.pdf',
          content: Buffer.from('<script>').toString('base64'),
          idempotencyKey: randomUUID(),
        })
      ).json,
    ).toMatchObject({ field: 'file' });
    for (const role of ['intake', 'support'] as const)
      expect(
        (await call(people[role], `batches/${id}/files/${rows[0]?.id}`)).status,
      ).toBe(403);
  });

  it('encrypts phones saved before batches existed', async () => {
    const old = await ledger.db.supplier.create({
      data: {
        name: `Old ${unique()}`,
        type: 'individual',
        phone: '08031234567',
      },
    });
    await recalculateQueued(ledger.db);
    const row = await ledger.db.supplier.findUniqueOrThrow({
      where: { id: old.id },
    });
    expect(row.phone).toBeNull();
    expect(row.phoneCiphertext).not.toBeNull();
  });
});

describe('unused batch deletion', () => {
  async function unused() {
    const supplierId = await newSupplier();
    return ok(
      batchResultSchema,
      people.admin,
      'batches',
      batchBody(supplierId, {
        status: 'arriving',
        expectedOn: '2099-12-01',
      }),
    );
  }
  async function deletion(id: string) {
    const detail = await ok(batchDetailSchema, people.admin, `batches/${id}`);
    return {
      id,
      expectedUpdatedAt: detail.batch.updatedAt,
      idempotencyKey: randomUUID(),
      reason: 'Created by mistake',
      confirmation: detail.batch.code,
    };
  }
  it('soft deletes only unused batches, replays safely, hides them from pickers/reports and restores with audit', async () => {
    const { id } = await unused();
    const input = await deletion(id);
    for (const role of ['intake', 'warehouse', 'finance', 'support'] as const)
      expect((await call(people[role], 'batches/delete', input)).status).toBe(
        403,
      );
    expect(
      (
        await call(people.admin, 'batches/delete', {
          ...input,
          confirmation: 'WRONG',
        })
      ).status,
    ).toBe(409);
    await ok(batchResultSchema, people.admin, 'batches/delete', input);
    await ok(batchResultSchema, people.admin, 'batches/delete', input);
    expect(
      await ledger.db.auditLog.count({
        where: { entityId: id, action: 'batches.deleted' },
      }),
    ).toBe(1);
    expect(
      (await ok(batchPageSchema, people.admin, 'batches?tab=all')).items.some(
        (b) => b.id === id,
      ),
    ).toBe(false);
    expect(
      (
        await ok(batchPageSchema, people.admin, 'batches?tab=deleted')
      ).items.some((b) => b.id === id),
    ).toBe(true);
    expect(
      (
        await ok(
          batchPickerSchema,
          people.intake,
          `batches/picker?locationId=${locationId}`,
        )
      ).items.some((b) => b.id === id),
    ).toBe(false);
    expect((await call(people.warehouse, `batches/${id}`)).status).toBe(404);
    const deleted = await ok(batchDetailSchema, people.admin, `batches/${id}`);
    expect(deleted.canRestore).toBe(true);
    expect(
      (
        await call(people.admin, 'batches/receive', {
          id,
          expectedUpdatedAt: deleted.batch.updatedAt,
          idempotencyKey: randomUUID(),
          itemsReceived: 2,
        })
      ).status,
    ).toBe(409);
    await ok(batchResultSchema, people.admin, 'batches/restore', {
      id,
      expectedUpdatedAt: deleted.batch.updatedAt,
      idempotencyKey: randomUUID(),
      reason: 'The batch is needed after all',
    });
    expect(
      (await ok(batchDetailSchema, people.admin, `batches/${id}`)).batch
        .deletedAt,
    ).toBeNull();
    expect(
      await ledger.db.auditLog.count({
        where: { entityId: id, action: 'batches.restored' },
      }),
    ).toBe(1);
  });
  it('blocks received stock, linked drafts, deleted lots and attempts to link to a deleted batch', async () => {
    const received = await newBatch();
    expect(
      (await call(people.admin, 'batches/delete', await deletion(received.id)))
        .status,
    ).toBe(409);
    const draft = await unused();
    const linkedLot = await newLot(draft.id);
    expect(
      (await call(people.admin, 'batches/delete', await deletion(draft.id)))
        .status,
    ).toBe(409);
    const replacement = await unused();
    await ledger.db.lot.update({
      where: { id: linkedLot.id },
      data: { batchId: replacement.id },
    });
    expect(
      (await call(people.admin, 'batches/delete', await deletion(draft.id)))
        .status,
    ).toBe(409);
    await ledger.db.lot.update({
      where: { id: linkedLot.id },
      data: {
        deletedAt: new Date(),
        deleteReason: 'Synthetic deleted draft',
        deletedById: people.admin.userId,
      },
    });
    expect(
      (
        await call(
          people.admin,
          'batches/delete',
          await deletion(replacement.id),
        )
      ).status,
    ).toBe(409);
    const empty = await unused();
    await ok(
      batchResultSchema,
      people.admin,
      'batches/delete',
      await deletion(empty.id),
    );
    expect(
      (
        await call(
          people.intake,
          'inventory/lots',
          lotBody({ batchId: empty.id }),
        )
      ).status,
    ).toBe(400);
  });
  it('removes only expired unused batches, preserves audit, and safely repeats cleanup', async () => {
    const expired = await unused(),
      recent = await unused();
    for (const b of [expired, recent])
      await ok(
        batchResultSchema,
        people.admin,
        'batches/delete',
        await deletion(b.id),
      );
    await ledger.db.batch.update({
      where: { id: expired.id },
      data: { deletedAt: new Date(Date.now() - 31 * 86400_000) },
    });
    const old = await ok(
      batchDetailSchema,
      people.admin,
      `batches/${expired.id}`,
    );
    expect(old.canRestore).toBe(false);
    expect(
      (
        await call(people.admin, 'batches/restore', {
          id: expired.id,
          expectedUpdatedAt: old.batch.updatedAt,
          idempotencyKey: randomUUID(),
          reason: 'Attempt after the restore window',
        })
      ).status,
    ).toBe(409);
    await expect(
      ledger.db.batch.delete({ where: { id: recent.id } }),
    ).rejects.toThrow();
    const cleanup = await Promise.all([
      purgeDeletedBatches(ledger.db),
      purgeDeletedBatches(ledger.db),
    ]);
    expect(cleanup.reduce((n, r) => n + r.removed, 0)).toBe(1);
    expect(
      await ledger.db.batch.findUnique({ where: { id: expired.id } }),
    ).toBeNull();
    expect(
      await ledger.db.batch.findUnique({ where: { id: recent.id } }),
    ).not.toBeNull();
    expect(
      await ledger.db.auditLog.count({
        where: { entityId: expired.id, action: 'batches.purged' },
      }),
    ).toBe(1);
    expect((await purgeDeletedBatches(ledger.db)).removed).toBe(0);
  });
  it('serializes deletion against receiving and linking stock without allowing a deleted used batch', async () => {
    const b = await unused();
    const input = await deletion(b.id);
    const results = await Promise.all([
      call(people.admin, 'batches/delete', input),
      call(people.admin, 'batches/receive', {
        id: b.id,
        expectedUpdatedAt: input.expectedUpdatedAt,
        idempotencyKey: randomUUID(),
        itemsReceived: 1,
      }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const row = await ledger.db.batch.findUniqueOrThrow({
      where: { id: b.id },
    });
    expect(row.deletedAt && row.receivedOn).toBeFalsy();
    const linked = await unused();
    const attempts = await Promise.all([
      call(people.admin, 'batches/delete', await deletion(linked.id)),
      call(people.intake, 'inventory/lots', lotBody({ batchId: linked.id })),
    ]);
    expect(
      attempts.filter((r) => r.status === 200 || r.status === 201),
    ).toHaveLength(1);
    const end = await ledger.db.batch.findUniqueOrThrow({
      where: { id: linked.id },
    });
    const lots = await ledger.db.lot.count({ where: { batchId: linked.id } });
    expect(Boolean(end.deletedAt) && lots > 0).toBe(false);
  });
  it('requires the private maintenance token and rejects unknown cleanup fields', async () => {
    const previous = process.env.BID_MAINTENANCE_TOKEN;
    const token = randomBytes(32).toString('hex');
    process.env.BID_MAINTENANCE_TOKEN = token;
    const send = (authorization: string, body: unknown) =>
      fetch(base + '/internal/batches/cleanup-deleted', {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    try {
      expect((await send('Bearer wrong', {})).status).toBe(401);
      expect((await send('Bearer ' + token, { force: true })).status).toBe(400);
      const result = await send('Bearer ' + token, {});
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ removed: 0 });
    } finally {
      if (previous === undefined) delete process.env.BID_MAINTENANCE_TOKEN;
      else process.env.BID_MAINTENANCE_TOKEN = previous;
    }
  });
});
