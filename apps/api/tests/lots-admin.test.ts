import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApi } from '../src/app';
import { encryptPii, hashPii } from '../src/security/pii';
import { LedgerService } from '../src/ledger/ledger-service';
import {
  lotBulkResultSchema,
  lotCsvCheckSchema,
  lotCsvHeaders,
  lotCsvImportSchema,
  lotDuplicateResultSchema,
  lotEditorSchema,
  lotListPageSchema,
  lotListSetupSchema,
  lotSavedViewSchema,
} from '@auction-ng/shared';

// Lots inventory API (T15e): each role, tab counts, filters, delete/restore,
// edit locks, duplicate, bulk and CSV import.
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
let otherCategoryId = '';
let locationId = '';
let locationCode = '';
let binId = '';
let namespace = '';
let buyerId = '';

beforeAll(async () => {
  const url = process.env.LOTS_ADMIN_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !url ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated lots database required.');
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
  const db = ledger.db;
  categoryId = (
    await db.category.create({
      data: { name: `Phones ${unique()}`, slug: randomUUID() },
    })
  ).id;
  otherCategoryId = (
    await db.category.create({
      data: { name: `Kitchen ${unique()}`, slug: randomUUID() },
    })
  ).id;
  await db.categoryField.create({
    data: {
      categoryId,
      name: 'Storage',
      key: 'storage',
      type: 'list',
      options: ['128GB', '256GB'],
      required: true,
      sortOrder: 0,
    },
  });
  await db.category.update({
    where: { id: categoryId },
    data: { fieldsInherited: false },
  });
  locationCode = randomBytes(3)
    .toString('hex')
    .replace(/[^a-z]/g, 'q')
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, 'Q');
  const location = await db.location.create({
    data: {
      code: locationCode,
      name: `Ikeja hub ${unique()}`,
      address: 'Synthetic',
      hours: {},
      capacityPerSlot: 20,
    },
  });
  locationId = location.id;
  binId = (await db.bin.create({ data: { locationId, code: 'S-01' } })).id;
  namespace = `test:lots:${randomUUID()}:`;
  await db.$executeRaw`INSERT INTO bid_engine_runtime(namespace, redis_run_id) VALUES (${namespace}, 'test')`;
  buyerId = (await person('buyer')).userId;
});
afterAll(async () => {
  await ledger?.close();
  await app?.close();
});

function unique() {
  return randomUUID().slice(0, 8);
}
async function person(role: string) {
  const email = `${randomUUID()}@example.test`;
  const user = await ledger.db.user.create({
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
  return { userId: user.id };
}
async function staff(role: string): Promise<Who> {
  const token = randomBytes(32).toString('base64url');
  const device = randomUUID();
  const { userId } = await person(role);
  await ledger.db.authSession.create({
    data: {
      userId,
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
  return { token, device, userId };
}
async function call(who: Who, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}/admin/inventory/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${who.token}`,
      'X-Device-Id': who.device,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    json: (await response.json().catch(() => ({}))) as Record<string, unknown>,
  };
}
async function ok<T>(
  shape: { parse(value: unknown): T },
  who: Who,
  path: string,
  method = 'GET',
  body?: unknown,
) {
  const r = await call(who, path, method, body);
  if (r.status !== 200)
    throw new Error(
      `${method} ${path} -> ${r.status} ${JSON.stringify(r.json)}`,
    );
  // Parsing with the shared schema also checks the API's response shape.
  return shape.parse(r.json);
}
const anything = { parse: (value: unknown) => value };
const form = (extra: Record<string, unknown> = {}) => ({
  title: `Tecno Camon 30 ${unique()}`,
  description: 'Returned unused. Powers on.',
  condition: 'open_box',
  categoryId,
  locationId,
  binId: null,
  brandId: null,
  supplierId: null,
  startPriceKobo: 500_000,
  retailPriceKobo: 21_500_000,
  runTimeMinutes: 1440,
  details: { storage: '256GB' },
  included: ['Phone', 'Charger'],
  defects: ['Box dented'],
  ...extra,
});
async function create(who: Who, extra: Record<string, unknown> = {}) {
  return ok(lotEditorSchema, who, 'lots', 'POST', {
    lot: form(extra),
    expectedUpdatedAt: null,
    idempotencyKey: randomUUID(),
  });
}
/** A lot in any stage, straight in the database. */
async function seed(
  stage: 'draft' | 'scheduled' | 'live' | 'ending' | 'sold' | 'unsold',
  extra: Record<string, unknown> = {},
) {
  const now = Date.now();
  const status = {
    draft: 'draft',
    scheduled: 'scheduled',
    live: 'open',
    ending: 'open',
    sold: 'closed',
    unsold: 'closed',
  }[stage];
  const startAt = new Date(
    stage === 'scheduled' ? now + 86_400_000 : now - 3_600_000,
  );
  const endAt = new Date(
    stage === 'ending'
      ? now + 3_600_000
      : stage === 'live'
        ? now + 3 * 86_400_000
        : stage === 'sold' || stage === 'unsold'
          ? now - 60_000
          : startAt.getTime() + 86_400_000,
  );
  const lot = await ledger.db.lot.create({
    data: {
      title: `Seed ${stage} ${unique()}`,
      description: 'Synthetic',
      condition: 'new',
      retailPriceKobo: 1_000_000n,
      startPriceKobo: 100_000n,
      status,
      startAt,
      endAt,
      categoryId,
      locationId,
      createdById: people.intake.userId,
      ...extra,
    },
  });
  if (stage === 'sold' || stage === 'unsold') {
    await ledger.db
      .$executeRaw`INSERT INTO lot_settlements(lot_id, namespace, winner_id, group_id, hammer_kobo, fee_version, stream_id, barrier_id, end_at, closed_at, snapshot, status)
      VALUES (${lot.id}::uuid, ${namespace}, ${stage === 'sold' ? buyerId : null}::uuid, ${stage === 'sold' ? randomUUID() : null}::uuid, ${stage === 'sold' ? 300_000n : null}::bigint,
        (SELECT version FROM auction_fee_policies ORDER BY version LIMIT 1), '0-0', '0-0', ${endAt}, ${new Date(endAt.getTime() + 1000)}, '{}'::jsonb, ${stage === 'sold' ? 'frozen' : 'unsold'})`;
  }
  return lot;
}
async function bid(lotId: string) {
  await ledger.db.bid.create({
    data: {
      lotId,
      userId: buyerId,
      amountKobo: 200_000n,
      maxKobo: 200_000n,
      idempotencyKey: randomUUID(),
    },
  });
}

describe('permissions', () => {
  it('lets only inventory roles read and create lots', async () => {
    for (const role of roles) {
      const list = await call(people[role], 'lots');
      expect(list.status, role).toBe(
        ['admin', 'manager', 'intake'].includes(role) ? 200 : 403,
      );
      const created = await call(people[role], 'lots', 'POST', {
        lot: form(),
        expectedUpdatedAt: null,
        idempotencyKey: randomUUID(),
      });
      expect(created.status, role).toBe(
        ['admin', 'manager', 'intake'].includes(role) ? 200 : 403,
      );
    }
  });

  it('archives with records.archive and restores with admin only', async () => {
    const draft = await seed('draft');
    const archive = (who: Who) =>
      call(who, `lots/${draft.id}/archive`, 'POST', {
        expectedUpdatedAt: draft.updatedAt.toISOString(),
      });
    expect((await archive(people.intake)).status).toBe(403);
    expect((await archive(people.manager)).status).toBe(200);
    const doomed = await seed('draft');
    await ok(anything, people.manager, `lots/${doomed.id}/delete`, 'POST', {
      reason: 'Duplicate of another lot',
      freeBin: true,
      expectedUpdatedAt: doomed.updatedAt.toISOString(),
    });
    const deleted = await ledger.db.lot.findUniqueOrThrow({
      where: { id: doomed.id },
    });
    expect(
      (
        await call(people.manager, `lots/${doomed.id}/restore`, 'POST', {
          expectedUpdatedAt: deleted.updatedAt.toISOString(),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(people.admin, `lots/${doomed.id}/restore`, 'POST', {
          expectedUpdatedAt: deleted.updatedAt.toISOString(),
        })
      ).status,
    ).toBe(200);
    expect(
      await ledger.db.auditLog.count({
        where: {
          entityId: doomed.id,
          action: { in: ['lots.deleted', 'lots.restored'] },
        },
      }),
    ).toBe(2);
  });

  it('only shows the Deleted tab to admins', async () => {
    expect((await call(people.manager, 'lots?tab=deleted')).status).toBe(403);
    expect((await call(people.admin, 'lots?tab=deleted')).status).toBe(200);
  });
});

describe('list', () => {
  it('counts every tab and combines filters', async () => {
    const tag = unique();
    const made = {
      draft: await seed('draft', { title: `Tab ${tag} draft` }),
      scheduled: await seed('scheduled', { title: `Tab ${tag} scheduled` }),
      live: await seed('live', { title: `Tab ${tag} live` }),
      ending: await seed('ending', { title: `Tab ${tag} ending` }),
      sold: await seed('sold', { title: `Tab ${tag} sold` }),
      unsold: await seed('unsold', { title: `Tab ${tag} unsold` }),
      archived: await seed('draft', {
        title: `Tab ${tag} archived`,
        archivedAt: new Date(),
      }),
      other: await seed('draft', {
        title: `Tab ${tag} kitchen`,
        categoryId: otherCategoryId,
        condition: 'damaged',
      }),
    };
    const page = await ok(
      lotListPageSchema,
      people.admin,
      `lots?search=${encodeURIComponent(`Tab ${tag}`)}`,
    );
    expect(page.counts).toMatchObject({
      all: 7,
      drafts: 2,
      scheduled: 1,
      live: 2,
      ending: 1,
      sold: 1,
      unsold: 1,
      archived: 1,
      deleted: 0,
    });
    expect(page.items).toHaveLength(7);
    // Live lots first, soonest ending first.
    expect(page.items[0]?.id).toBe(made.ending.id);
    const filtered = await ok(
      lotListPageSchema,
      people.admin,
      `lots?search=${encodeURIComponent(`Tab ${tag}`)}&categoryIds=${otherCategoryId}&conditions=damaged`,
    );
    expect(filtered.items.map((r: { id: string }) => r.id)).toEqual([
      made.other.id,
    ]);
    const none = await ok(
      lotListPageSchema,
      people.admin,
      `lots?search=${encodeURIComponent(`Tab ${tag}`)}&categoryIds=${otherCategoryId}&conditions=new`,
    );
    expect(none.items).toEqual([]);
    const sold = await ok(
      lotListPageSchema,
      people.admin,
      `lots?tab=sold&search=${encodeURIComponent(`Tab ${tag}`)}`,
    );
    expect(sold.items[0]).toMatchObject({
      stage: 'sold',
      currentPriceKobo: 300_000,
      winnerName: expect.stringMatching(/^Chinedu O\./),
    });
    expect(typeof page.summary.inStock).toBe('number');
  });

  it('pages 50 at a time with a cursor', async () => {
    const tag = unique();
    for (let i = 0; i < 55; i += 1)
      await seed('draft', { title: `Page ${tag} ${i}` });
    const first = await ok(
      lotListPageSchema,
      people.admin,
      `lots?tab=drafts&sort=newest&search=${encodeURIComponent(`Page ${tag}`)}`,
    );
    expect(first.items).toHaveLength(50);
    expect(first.total).toBe(55);
    const second = await ok(
      lotListPageSchema,
      people.admin,
      `lots?tab=drafts&sort=newest&search=${encodeURIComponent(`Page ${tag}`)}&cursor=${first.nextCursor}`,
    );
    expect(second.items).toHaveLength(5);
    expect(
      new Set(
        [...first.items, ...second.items].map((r: { id: string }) => r.id),
      ).size,
    ).toBe(55);
  });
});

describe('create, edit and locks', () => {
  it('creates a draft with the person who added it and saves views', async () => {
    const editor = await create(people.intake);
    expect(editor).toMatchObject({
      stage: 'draft',
      lot: { included: ['Phone', 'Charger'], defects: ['Box dented'] },
    });
    expect(
      (await ledger.db.lot.findUniqueOrThrow({ where: { id: editor.id } }))
        .createdById,
    ).toBe(people.intake.userId);
    const view = await ok(lotSavedViewSchema, people.intake, 'views', 'POST', {
      name: `Needs photos ${unique()}`,
      query: { tab: 'drafts' },
    });
    expect(
      (await ok(lotListSetupSchema, people.intake, 'setup')).views.map(
        (v: { id: string }) => v.id,
      ),
    ).toContain(view.id);
  });

  it('replays an autosave retry instead of creating a second draft', async () => {
    const key = randomUUID();
    const body = { lot: form(), expectedUpdatedAt: null, idempotencyKey: key };
    const a = await ok(lotEditorSchema, people.intake, 'lots', 'POST', body);
    const b = await ok(lotEditorSchema, people.intake, 'lots', 'POST', body);
    expect(b.id).toBe(a.id);
  });

  it('locks price and run time once live and tells bidders about other changes', async () => {
    const live = await seed('live');
    await bid(live.id);
    const editor = await ok(
      lotEditorSchema,
      people.manager,
      `lots/${live.id}/editor`,
    );
    expect(editor.locks).toMatchObject({
      priceLocked: true,
      runTimeLocked: true,
      editable: true,
    });
    const priceChange = await call(people.manager, `lots/${live.id}`, 'PATCH', {
      lot: { ...editor.lot, startPriceKobo: 1 },
      expectedUpdatedAt: editor.updatedAt,
      idempotencyKey: randomUUID(),
    });
    expect(priceChange.status).toBe(409);
    expect(priceChange.json).toMatchObject({ field: 'startPriceKobo' });
    await ok(anything, people.manager, `lots/${live.id}`, 'PATCH', {
      lot: {
        ...editor.lot,
        description: 'Updated description with the box photo.',
      },
      expectedUpdatedAt: editor.updatedAt,
      idempotencyKey: randomUUID(),
    });
    expect(
      await ledger.db.lotBidderMessage.count({ where: { lotId: live.id } }),
    ).toBe(1);
  });

  it('refuses a stale edit', async () => {
    const editor = await create(people.manager);
    const stale = await call(people.manager, `lots/${editor.id}`, 'PATCH', {
      lot: { ...editor.lot, title: 'Changed' },
      expectedUpdatedAt: new Date(0).toISOString(),
      idempotencyKey: randomUUID(),
    });
    expect(stale.status).toBe(409);
  });
});

describe('duplicate and delete', () => {
  it('duplicates without photos, bin or history', async () => {
    const source = await create(people.manager, { binId });
    await ledger.db.lotImage.create({
      data: {
        lotId: source.id,
        url: 'https://example.test/a.webp',
        sortOrder: 0,
      },
    });
    const { id } = await ok(
      lotDuplicateResultSchema,
      people.manager,
      `lots/${source.id}/duplicate`,
      'POST',
      { idempotencyKey: randomUUID() },
    );
    const copy = await ledger.db.lot.findUniqueOrThrow({
      where: { id },
      include: { images: true },
    });
    expect(copy).toMatchObject({
      status: 'draft',
      binId: null,
      title: source.lot.title,
      included: ['Phone', 'Charger'],
    });
    expect(copy.images).toEqual([]);
    expect(copy.lotNumber).not.toBe(source.lotNumber);
  });

  it('applies the delete rules for every stage', async () => {
    const del = (who: Who, lot: { id: string; updatedAt: Date }) =>
      call(who, `lots/${lot.id}/delete`, 'POST', {
        reason: 'Test delete',
        freeBin: false,
        expectedUpdatedAt: lot.updatedAt.toISOString(),
      });
    const liveWithBids = await seed('live');
    await bid(liveWithBids.id);
    const blocked = await del(people.admin, liveWithBids);
    expect(blocked.status).toBe(409);
    expect(blocked.json).toMatchObject({ field: 'delete.never' });
    expect((await del(people.admin, await seed('live'))).json).toMatchObject({
      field: 'delete.cancelfirst',
    });
    expect((await del(people.admin, await seed('sold'))).json).toMatchObject({
      field: 'delete.archiveonly',
    });
    // Intake: own drafts only.
    const own = await seed('draft', { createdById: people.intake.userId });
    const someoneElses = await seed('draft', {
      createdById: people.manager.userId,
    });
    expect((await del(people.intake, own)).status).toBe(200);
    expect((await del(people.intake, someoneElses)).json).toMatchObject({
      field: 'delete.permission',
    });
    // Scheduled: the schedule is cancelled in the same step.
    const scheduled = await seed('scheduled');
    expect((await del(people.manager, scheduled)).status).toBe(200);
    expect(
      await ledger.db.lot.findUniqueOrThrow({ where: { id: scheduled.id } }),
    ).toMatchObject({ status: 'cancelled', deleteReason: 'Test delete' });
  });

  it('skips lots a bulk change can’t apply to and says why', async () => {
    const draft = await seed('draft');
    const live = await seed('live');
    const result = await ok(
      lotBulkResultSchema,
      people.manager,
      'bulk',
      'POST',
      {
        ids: [draft.id, live.id],
        action: 'edit',
        changes: { startPriceKobo: 250_000 },
        idempotencyKey: randomUUID(),
      },
    );
    expect(result.done).toBe(1);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        id: live.id,
        reason: expect.stringMatching(/locked/),
      }),
    ]);
    expect(
      (await ledger.db.lot.findUniqueOrThrow({ where: { id: draft.id } }))
        .startPriceKobo,
    ).toBe(250_000n);
  });
});

describe('CSV import', () => {
  it('imports 18 good rows of 20 and reports the 2 bad ones', async () => {
    const header = lotCsvHeaders([{ key: 'storage' }]).join(',');
    const rows = Array.from({ length: 20 }, (_, i) =>
      i === 4
        ? `,No title,Open box,5000,215000,24,${locationCode},,,,,,256GB`
        : i === 11
          ? `Tecno ${i},Works,Open box,5000,215000,24,${locationCode},,,,,,512GB`
          : `Tecno Camon ${i},Works,Open box,"₦5,000",215000,24,${locationCode},S-01,,,Phone|Charger,,256GB`,
    );
    const csv = `${header}\n${rows.join('\n')}\n`;
    const check = await ok(
      lotCsvCheckSchema,
      people.intake,
      'csv-check',
      'POST',
      {
        categoryId,
        csv,
      },
    );
    expect(check).toMatchObject({ rows: 20, good: 18 });
    expect(
      check.problems.map((p: { row: number; field: string }) => [
        p.row,
        p.field,
      ]),
    ).toEqual([
      [6, 'title'],
      [13, 'detail:storage'],
    ]);
    const key = randomUUID();
    const imported = await ok(
      lotCsvImportSchema,
      people.intake,
      'csv-import',
      'POST',
      {
        categoryId,
        csv,
        idempotencyKey: key,
      },
    );
    expect(imported).toMatchObject({ imported: 18, problems: 2 });
    const again = await ok(
      lotCsvImportSchema,
      people.intake,
      'csv-import',
      'POST',
      {
        categoryId,
        csv,
        idempotencyKey: key,
      },
    );
    expect(again.ids).toEqual(imported.ids);
    expect(
      await ledger.db.lot.count({
        where: { id: { in: imported.ids }, status: 'draft', binId },
      }),
    ).toBe(18);
  });
});

describe('summary cards', () => {
  it('counts sold, unsold-to-relist and stock from the database', async () => {
    const { summary, clearSummaryCache } =
      await import('../src/lots/lots-query');
    clearSummaryCache();
    const before = await ledger.db.$transaction((tx) => summary(tx));
    await seed('sold');
    await seed('unsold');
    await seed('draft');
    clearSummaryCache();
    const after = await ledger.db.$transaction((tx) => summary(tx));
    expect(after.sold30d - before.sold30d).toBe(1);
    expect(after.sold30dHammerKobo - before.sold30dHammerKobo).toBe(300_000);
    expect(after.unsoldToRelist - before.unsoldToRelist).toBe(1);
    expect(after.drafts - before.drafts).toBe(1);
    // A draft and an unsold item waiting to relist are both in stock.
    expect(after.inStock - before.inStock).toBe(2);
  });
});

describe('safety review fixes', () => {
  it('keeps a scheduled lot’s real end time when only its description changes', async () => {
    const start = new Date(Date.now() + 86_400_000);
    const end = new Date(start.getTime() + 48 * 3_600_000);
    const lot = await seed('scheduled', {
      startAt: start,
      endAt: end,
      runTimeMinutes: 1440, // stale draft value from before scheduling
    });
    const editor = await ok(
      lotEditorSchema,
      people.manager,
      `lots/${lot.id}/editor`,
    );
    expect(editor.lot.runTimeMinutes).toBe(48 * 60);
    await ok(anything, people.manager, `lots/${lot.id}`, 'PATCH', {
      lot: { ...editor.lot, description: 'Fixed a typo.' },
      expectedUpdatedAt: editor.updatedAt,
      idempotencyKey: randomUUID(),
    });
    const after = await ledger.db.lot.findUniqueOrThrow({
      where: { id: lot.id },
    });
    expect(after.endAt.getTime()).toBe(end.getTime());
    expect(after.scheduleVersion).toBe(lot.scheduleVersion);
  });

  it('treats a lot whose pre-bids are launching as live', async () => {
    const lot = await seed('scheduled', { preBidsLaunching: true });
    const editor = await ok(
      lotEditorSchema,
      people.manager,
      `lots/${lot.id}/editor`,
    );
    expect(editor.stage).toBe('live');
    expect(editor.locks.priceLocked).toBe(true);
    const del = await call(people.admin, `lots/${lot.id}/delete`, 'POST', {
      reason: 'Test delete',
      freeBin: false,
      expectedUpdatedAt: lot.updatedAt.toISOString(),
    });
    expect(del.json).toMatchObject({ field: 'delete.cancelfirst' });
  });

  it('never deletes a cancelled lot; archive only', async () => {
    const lot = await seed('draft', { status: 'cancelled' });
    const del = await call(people.admin, `lots/${lot.id}/delete`, 'POST', {
      reason: 'Test delete',
      freeBin: false,
      expectedUpdatedAt: lot.updatedAt.toISOString(),
    });
    expect(del.json).toMatchObject({ field: 'delete.archiveonly' });
  });

  it('hides a deleted lot’s records from non-admins', async () => {
    const lot = await seed('draft');
    await ok(anything, people.manager, `lots/${lot.id}/delete`, 'POST', {
      reason: 'Entered by mistake',
      freeBin: false,
      expectedUpdatedAt: lot.updatedAt.toISOString(),
    });
    for (const tab of ['bids', 'watchers', 'activity', 'invoice']) {
      expect(
        (await call(people.manager, `lots/${lot.id}/${tab}`)).status,
        tab,
      ).toBe(404);
      expect(
        (await call(people.admin, `lots/${lot.id}/${tab}`)).status,
        tab,
      ).toBe(200);
    }
  });

  it('masks winners’ names for roles below manager', async () => {
    const tag = unique();
    await seed('sold', { title: `Mask ${tag}` });
    const q = `lots?tab=sold&search=${encodeURIComponent(`Mask ${tag}`)}`;
    expect(
      (await ok(lotListPageSchema, people.intake, q)).items[0]?.winnerName,
    ).toMatch(/\*\*\*/);
    expect(
      (await ok(lotListPageSchema, people.manager, q)).items[0]?.winnerName,
    ).toMatch(/^Chinedu O\./);
  });

  it('imports each CSV row once, even when the stored result was lost', async () => {
    const header = lotCsvHeaders([{ key: 'storage' }]).join(',');
    const rows = Array.from(
      { length: 3 },
      (_, i) =>
        `Retry ${i},Works,Open box,5000,215000,24,${locationCode},,,,,,256GB`,
    );
    const csv = `${header}\n${rows.join('\n')}\n`;
    const key = randomUUID();
    const first = await ok(
      lotCsvImportSchema,
      people.intake,
      'csv-import',
      'POST',
      { categoryId, csv, idempotencyKey: key },
    );
    // As if the process died before the result was stored.
    await ledger.db.idempotencyKey.deleteMany({
      where: { scope: 'lots-import', key: `${people.intake.userId}:${key}` },
    });
    const again = await ok(
      lotCsvImportSchema,
      people.intake,
      'csv-import',
      'POST',
      { categoryId, csv, idempotencyKey: key },
    );
    expect(again.ids).toEqual(first.ids);
    expect(
      await ledger.db.lot.count({ where: { id: { in: first.ids } } }),
    ).toBe(3);
  });

  it('returns the first result to a twin create request', async () => {
    const body = {
      lot: form(),
      expectedUpdatedAt: null,
      idempotencyKey: randomUUID(),
    };
    const [a, b] = await Promise.all([
      call(people.manager, 'lots', 'POST', body),
      call(people.manager, 'lots', 'POST', body),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.json.id).toBe(b.json.id);
  });
});
