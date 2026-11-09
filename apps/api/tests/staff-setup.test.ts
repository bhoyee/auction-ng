import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { LedgerService } from '../src/ledger/ledger-service';
import { AuthService, type AuthIdentity } from '../src/auth/auth-service';
import { StaffAdminService } from '../src/staff-admin/staff-admin-service';
import { StaffSetupService } from '../src/staff-admin/staff-setup-service';
import { CatalogueService } from '../src/catalogue/catalogue-service';
import { createApi } from '../src/app';
import { createStaffAdminClient } from '../../../packages/api-client/src/staff-admin';
import {
  profileSchema,
  staffInitials,
  staffSetupSaveSchema,
  staffPermissionsFor,
} from '@auction-ng/shared';
import { encryptPii, hashPii } from '../src/security/pii';
let ledger: LedgerService,
  auth: AuthService,
  staff: StaffAdminService,
  setup: StaffSetupService,
  catalogue: CatalogueService;
let databaseUrl: string;
beforeAll(() => {
  const url =
    process.env.STAFF_SETUP_TEST_DATABASE_URL ??
    process.env.STAFF_ADMIN_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated setup database required');
  databaseUrl = url;
  ledger = new LedgerService(url);
  auth = new AuthService({ databaseUrl: url });
  staff = new StaffAdminService(ledger, auth, {
    fenceEligibility: async () => {},
  });
  setup = new StaffSetupService(staff);
  catalogue = new CatalogueService(url);
});
afterAll(async () => {
  await catalogue?.db.$disconnect();
  await ledger?.close();
  await auth?.close();
});
async function actor(role = 'admin') {
  const email = randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic ' + role,
      role,
      emailVerifiedAt: new Date(),
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      ...(role === 'buyer'
        ? {}
        : {
            staffCredential: {
              create: { passwordHash: 'synthetic-not-a-login-hash' },
            },
          }),
    },
  });
  const s = await ledger.db.authSession.create({
    data: {
      userId: user.id,
      client: 'web',
      staffAuthenticated: role !== 'buyer',
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      accessHash: hashPii(randomUUID(), 'access'),
      refreshHash: hashPii(randomUUID(), 'refresh'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  return {
    user,
    who: {
      permissions: staffPermissionsFor(role),
      sessionId: s.id,
      user: profileSchema.parse({
        id: user.id,
        name: user.name,
        email,
        phone: null,
        phoneVerified: false,
        emailVerified: true,
        role,
        status: 'active',
      }),
    } satisfies AuthIdentity,
  };
}
const command = () => ({
  idempotencyKey: randomUUID(),
  reason: 'Reviewed setup correction',
});
const category = () => ({
  ...command(),
  kind: 'category' as const,
  name: 'Fixture category',
  slug: 'fixture-' + randomUUID(),
  parentId: null,
});
const location = () => ({
  ...command(),
  kind: 'location' as const,
  name: 'Fixture pickup centre',
  code: 'LAG-' + randomUUID().slice(0, 8).toUpperCase(),
  address: '12 Synthetic Street, Ikeja, Lagos',
  hours: 'Monday–Friday, 9am–5pm WAT',
  capacityPerSlot: 20,
});
it('creates, edits and idempotently retries setup records with complete audit snapshots', async () => {
  const a = await actor();
  const v = category();
  const result = await setup.save(a.who, v);
  expect(await setup.save(a.who, v)).toEqual(result);
  let row = await ledger.db.category.findUniqueOrThrow({
    where: { id: result.id },
  });
  await setup.save(a.who, {
    ...v,
    ...command(),
    id: row.id,
    expectedUpdatedAt: row.updatedAt.toISOString(),
    name: 'Updated category',
  });
  await expect(
    setup.save(a.who, {
      ...v,
      ...command(),
      id: row.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  row = await ledger.db.category.findUniqueOrThrow({ where: { id: row.id } });
  expect(row.name).toBe('Updated category');
  const logs = await ledger.db.auditLog.findMany({
    where: { entityId: row.id },
    orderBy: { createdAt: 'desc' },
  });
  expect(logs).toHaveLength(2);
  const last = logs[0];
  if (!last) throw Error('Audit missing');
  const detail = await setup.audit(a.who, last.id);
  expect(detail.actorId).toBe(a.user.id);
  expect(detail.before).toContain('Fixture category');
  expect(detail.after).toContain('Updated category');
  expect(detail.entityId).toBe(row.id);
});
it('blocks duplicate keys and category cycles', async () => {
  const a = await actor();
  const root = category(),
    r = await setup.save(a.who, root);
  await expect(
    setup.save(a.who, { ...root, ...command() }),
  ).rejects.toMatchObject({ status: 409 });
  const child = await setup.save(a.who, { ...category(), parentId: r.id });
  const row = await ledger.db.category.findUniqueOrThrow({
    where: { id: r.id },
  });
  await expect(
    setup.save(a.who, {
      ...root,
      ...command(),
      id: r.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
      parentId: child.id,
    }),
  ).rejects.toMatchObject({ status: 400 });
});
it('archives/restores and only permanently deletes unused archived records', async () => {
  const a = await actor();
  const v = category(),
    r = await setup.save(a.who, v);
  let row = await ledger.db.category.findUniqueOrThrow({ where: { id: r.id } });
  await setup.archive(a.who, {
    ...command(),
    kind: 'category',
    id: r.id,
    expectedUpdatedAt: row.updatedAt.toISOString(),
    operation: 'archive',
  });
  expect(
    (await catalogue.categories({ limit: 50 })).items.some(
      (c) => c.id === r.id,
    ),
  ).toBe(false);
  row = await ledger.db.category.findUniqueOrThrow({ where: { id: r.id } });
  await setup.archive(a.who, {
    ...command(),
    kind: 'category',
    id: r.id,
    expectedUpdatedAt: row.updatedAt.toISOString(),
    operation: 'restore',
  });
  expect(
    (await catalogue.categories({ limit: 50 })).items.some(
      (c) => c.id === r.id,
    ),
  ).toBe(true);
  row = await ledger.db.category.findUniqueOrThrow({ where: { id: r.id } });
  await setup.archive(a.who, {
    ...command(),
    kind: 'category',
    id: r.id,
    expectedUpdatedAt: row.updatedAt.toISOString(),
    operation: 'archive',
  });
  row = await ledger.db.category.findUniqueOrThrow({ where: { id: r.id } });
  await setup.archive(a.who, {
    ...command(),
    kind: 'category',
    id: r.id,
    expectedUpdatedAt: row.updatedAt.toISOString(),
    operation: 'purge',
  });
  expect(
    await ledger.db.category.findUnique({ where: { id: r.id } }),
  ).toBeNull();
});
it('preserves linked records, blocks active-centre archival and rejects archived intake references', async () => {
  const a = await actor();
  const c = await setup.save(a.who, category()),
    l = await setup.save(a.who, location());
  const lot = await ledger.db.lot.create({
    data: {
      title: 'Synthetic stock',
      description: 'Fixture',
      condition: 'new',
      retailPriceKobo: 100000n,
      startPriceKobo: 50000n,
      categoryId: c.id,
      locationId: l.id,
      startAt: new Date(Date.now() - 1000),
      endAt: new Date(Date.now() + 3600000),
      status: 'open',
    },
  });
  let loc = await ledger.db.location.findUniqueOrThrow({ where: { id: l.id } });
  await expect(
    setup.archive(a.who, {
      ...command(),
      kind: 'location',
      id: l.id,
      expectedUpdatedAt: loc.updatedAt.toISOString(),
      operation: 'archive',
    }),
  ).rejects.toMatchObject({ status: 409 });
  await ledger.db.lot.update({
    where: { id: lot.id },
    data: { status: 'closed' },
  });
  await setup.archive(a.who, {
    ...command(),
    kind: 'location',
    id: l.id,
    expectedUpdatedAt: loc.updatedAt.toISOString(),
    operation: 'archive',
  });
  loc = await ledger.db.location.findUniqueOrThrow({ where: { id: l.id } });
  await expect(
    setup.archive(a.who, {
      ...command(),
      kind: 'location',
      id: l.id,
      expectedUpdatedAt: loc.updatedAt.toISOString(),
      operation: 'purge',
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    catalogue.create(a.user.id, {
      title: 'New fixture',
      description: 'Fixture notes',
      condition: 'new',
      categoryId: c.id,
      locationId: l.id,
      retailPriceKobo: 100000,
      startPriceKobo: 50000,
      startsAt: new Date(Date.now() + 60000).toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect(
    await ledger.db.lot.findUnique({ where: { id: lot.id } }),
  ).not.toBeNull();
});
it('denies buyer/manager setup access and isolates preferences and visit permissions', async () => {
  const m = await actor('manager'),
    b = await actor('buyer');
  for (const a of [m, b])
    await expect(setup.save(a.who, category())).rejects.toMatchObject({
      status: 403,
    });
  await setup.savePreferences(m.who, {
    ...command(),
    preferences: { compactTables: true, reduceMotion: true },
  });
  expect(await setup.preferences(m.who)).toEqual({
    compactTables: true,
    reduceMotion: true,
  });
  const other = await actor('support');
  expect(await setup.preferences(other.who)).toEqual({
    compactTables: false,
    reduceMotion: false,
  });
  await setup.visit(other.who, {
    idempotencyKey: randomUUID(),
    page: 'support',
  });
  await expect(
    setup.visit(other.who, { idempotencyKey: randomUUID(), page: 'finance' }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(setup.audit(other.who, randomUUID())).rejects.toMatchObject({
    status: 403,
  });
});
it('paginates newest activity and redacts sensitive values', async () => {
  const a = await actor();
  const r = await ledger.db.auditLog.create({
    data: {
      actorId: a.user.id,
      action: 'staff.fixture',
      entityType: 'user',
      entityId: a.user.id,
      afterCiphertext: encryptPii(
        JSON.stringify({
          name: 'Visible',
          password: 'hidden-value',
          email: 'private@example.test',
          token: 'secret-value',
        }),
        'audit',
      ),
    },
  });
  const detail = await setup.audit(a.who, r.id);
  expect(detail.after).toContain('Visible');
  expect(detail.after).not.toContain('hidden-value');
  expect(detail.after).not.toContain('private@example.test');
  const reconciliation = await ledger.db.auditLog.create({
    data: {
      createdAt: new Date(Date.now() + 1000),
      action: 'payments.reconciliation',
      entityType: 'reconciliation',
      entityId: 'synthetic-report',
      afterCiphertext: encryptPii(
        JSON.stringify({ checked: 2 }),
        'reconciliation',
      ),
    },
  });
  expect((await setup.audit(a.who, reconciliation.id)).after).toContain(
    '"checked": 2',
  );
  const page = await staff.records(a.who, { kind: 'audit', limit: 1 });
  expect(page.items[0]?.id).toBe(reconciliation.id);
  expect(page.nextCursor).not.toBeNull();
  const next = await staff.records(a.who, {
    kind: 'audit',
    limit: 1,
    cursor: page.nextCursor,
  });
  expect(next.items[0]?.id).toBe(r.id);
});
it('documents and protects HTTP setup endpoints with strict typed clients', async () => {
  const a = await actor(),
    b = await actor('buyer');
  const app = await createApi({
    databaseUrl,
    mode: 'local',
    emailProvider: { async sendCode() {} },
  });
  vi.spyOn(app.get(AuthService), 'authenticate').mockImplementation(
    async (token) => {
      if (token === 'setup-admin') return a.who;
      if (token === 'setup-buyer') return b.who;
      throw new UnauthorizedException();
    },
  );
  await app.listen(0, '127.0.0.1');
  try {
    const url = await app.getUrl(),
      client = createStaffAdminClient(url, {
        accessToken: 'setup-admin',
        deviceId: randomUUID(),
      });
    expect((await fetch(url + '/staff/setup?kind=category')).status).toBe(401);
    const v = location();
    const r = await client.saveSetup(v);
    await ledger.db.location.update({
      where: { id: r.id },
      data: { hours: { timezone: 'Africa/Lagos', weekdays: '09:00–17:00' } },
    });
    expect(
      (await client.setup({ kind: 'location' })).items.find(
        (x) => x.id === r.id,
      )?.hours,
    ).toBe('Monday–Friday: 09:00–17:00');
    expect(
      (await client.setup({ kind: 'location' })).items.some(
        (x) => x.id === r.id,
      ),
    ).toBe(true);
    await expect(
      createStaffAdminClient(url, {
        accessToken: 'setup-buyer',
        deviceId: randomUUID(),
      }).setup({ kind: 'category' }),
    ).rejects.toMatchObject({ status: 403 });
    const docs: unknown = await (await fetch(url + '/docs-json')).json();
    expect(docs).toMatchObject({
      paths: {
        '/staff/setup': { get: expect.any(Object), post: expect.any(Object) },
        '/staff/setup/archive': { post: expect.any(Object) },
        '/staff/preferences': {
          get: expect.any(Object),
          post: expect.any(Object),
        },
        '/staff/audit/{id}': { get: expect.any(Object) },
      },
    });
    expect(
      staffSetupSaveSchema.safeParse({ ...category(), admin: true }).success,
    ).toBe(false);
  } finally {
    await app.close();
  }
});
it('uses recognisable first/last initials with single-name and empty fallbacks', () => {
  expect(staffInitials('Ada Okafor')).toBe('AO');
  expect(staffInitials('admin')).toBe('AN');
  expect(staffInitials('A')).toBe('A');
  expect(staffInitials('')).toBe('LV');
});

it('serializes simultaneous edits and permits delegated setup without permanent deletion', async () => {
  const a = await actor(),
    m = await actor('manager');
  const role = await staff.saveRole(a.who, {
    ...command(),
    name: 'Setup operator ' + randomUUID().slice(0, 8),
    permissions: ['setup.manage'],
  });
  await ledger.db.staffMembership.create({
    data: { userId: m.user.id, roleId: role.id },
  });
  const v = category(),
    r = await setup.save(m.who, v);
  const row = await ledger.db.category.findUniqueOrThrow({
    where: { id: r.id },
  });
  const results = await Promise.allSettled(
    ['First edit', 'Second edit'].map((name) =>
      setup.save(m.who, {
        ...v,
        ...command(),
        id: r.id,
        expectedUpdatedAt: row.updatedAt.toISOString(),
        name,
      }),
    ),
  );
  expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  const current = await ledger.db.category.findUniqueOrThrow({
    where: { id: r.id },
  });
  await expect(
    setup.archive(m.who, {
      ...command(),
      kind: 'category',
      id: r.id,
      expectedUpdatedAt: current.updatedAt.toISOString(),
      operation: 'purge',
    }),
  ).rejects.toMatchObject({ status: 403 });
  const page = await setup.list(m.who, { kind: 'category', limit: 1 });
  expect(page.items).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  await expect(
    setup.list(a.who, { kind: 'category', limit: 1, cursor: page.nextCursor }),
  ).rejects.toMatchObject({ status: 400 });
});

async function centreFixture() {
  const a = await actor(),
    b = await actor('buyer');
  const c = await setup.save(a.who, category()),
    l = await setup.save(a.who, location());
  return { a, b, categoryId: c.id, locationId: l.id };
}
async function stock(
  c: { categoryId: string; locationId: string },
  status = 'draft',
  archived = false,
) {
  return ledger.db.lot.create({
    data: {
      title: 'Centre count fixture',
      description: 'Synthetic stock',
      condition: 'new',
      categoryId: c.categoryId,
      locationId: c.locationId,
      startPriceKobo: 50000n,
      retailPriceKobo: 100000n,
      startAt: new Date(Date.now() - 7200000),
      endAt: new Date(Date.now() - 1000),
      status,
      archivedAt: archived ? new Date() : null,
    },
  });
}
async function order(
  c: Awaited<ReturnType<typeof centreFixture>>,
  ids: string[],
  status = 'paid',
) {
  return ledger.db.invoice.create({
    data: {
      userId: c.b.user.id,
      status,
      hammerTotalKobo: 50000n * BigInt(ids.length),
      premiumKobo: 0n,
      lotFeeKobo: 0n,
      vatKobo: 0n,
      totalKobo: 50000n * BigInt(ids.length),
      lines: {
        create: ids.map((lotId) => ({
          lotId,
          hammerKobo: 50000n,
          premiumKobo: 0n,
          lotFeeKobo: 0n,
          vatKobo: 0n,
          totalKobo: 50000n,
        })),
      },
      fulfilment: {
        create: {
          locationId: c.locationId,
          type: 'pickup',
          status: 'ready',
        },
      },
    },
    include: { lines: true, fulfilment: true },
  });
}
async function centreTotals(c: Awaited<ReturnType<typeof centreFixture>>) {
  const page = await setup.list(c.a.who, {
    kind: 'location',
    search: 'Fixture pickup',
    limit: 50,
  });
  const r = page.items.find((x) => x.id === c.locationId);
  if (!r) throw Error('Centre not found');
  return r;
}
it('centre totals count current uncollected stock, including unsold and archived stock, scoped to the centre', async () => {
  const c = await centreFixture(),
    other = await centreFixture();
  expect(await centreTotals(c)).toMatchObject({
    currentItems: 0,
    pendingPickupItems: 0,
  });
  await stock(c);
  await stock(c, 'closed');
  await stock(c, 'cancelled');
  await stock(c, 'draft', true);
  await stock(other);
  expect(await centreTotals(c)).toMatchObject({
    currentItems: 4,
    pendingPickupItems: 0,
  });
  expect(await centreTotals(other)).toMatchObject({
    currentItems: 1,
    pendingPickupItems: 0,
  });
});
it('centre pending counts use paid item lines and reduce after partial and legacy full collection without changing money', async () => {
  const c = await centreFixture();
  const a = await stock(c, 'closed'),
    b = await stock(c, 'closed');
  const invoice = await order(c, [a.id, b.id]);
  const unpaid = await stock(c, 'closed');
  await order(c, [unpaid.id], 'pending');
  const refunded = await stock(c, 'closed');
  await order(c, [refunded.id], 'refunded');
  expect(await centreTotals(c)).toMatchObject({
    currentItems: 4,
    pendingPickupItems: 2,
  });
  const before = await ledger.db.ledgerEntry.count();
  const visit = await ledger.db.pickupVisit.create({
    data: { userId: c.b.user.id, locationId: c.locationId },
  });
  const line = invoice.lines[0];
  if (!line || !invoice.fulfilment) throw Error('Order fixture missing');
  await ledger.db.pickupCollectionReceipt.create({
    data: {
      id: randomUUID(),
      visitId: visit.id,
      staffId: c.a.user.id,
      finishVisit: false,
      items: { create: { invoiceLineId: line.id } },
    },
  });
  expect(await centreTotals(c)).toMatchObject({
    currentItems: 3,
    pendingPickupItems: 1,
  });
  await ledger.db.fulfilment.update({
    where: { id: invoice.fulfilment.id },
    data: { status: 'collected', collectedAt: new Date() },
  });
  expect(await centreTotals(c)).toMatchObject({
    currentItems: 2,
    pendingPickupItems: 0,
  });
  expect(await ledger.db.ledgerEntry.count()).toBe(before);
});
it('centre current stock counts an unsold relist chain once', async () => {
  const c = await centreFixture(),
    old = await stock(c, 'closed'),
    replacement = await stock(c);
  const namespace = 'centre-count-' + randomUUID();
  await ledger.db.bidEngineRuntime.create({
    data: { namespace, redisRunId: randomUUID() },
  });
  const policy = await ledger.db.auctionFeeControls.findUniqueOrThrow({
    where: { id: 1 },
  });
  await ledger.db.lotSettlement.create({
    data: {
      lotId: old.id,
      namespace,
      feeVersion: policy.currentVersion,
      streamId: '1-0',
      barrierId: '1-0',
      endAt: old.endAt,
      closedAt: new Date(),
      snapshot: {},
      status: 'unsold',
      relistLotId: replacement.id,
    },
  });
  expect(await centreTotals(c)).toMatchObject({
    currentItems: 1,
    pendingPickupItems: 0,
  });
});
it('centre pickup refresh events commit once per transaction and disappear on rollback', async () => {
  const c = await centreFixture(),
    item = await stock(c, 'closed'),
    invoice = await order(c, [item.id]);
  if (!invoice.fulfilment) throw Error('Missing fulfilment');
  const id = invoice.fulfilment.id;
  const before = await ledger.db.staffActivityEvent.count({
    where: { sourceKey: { startsWith: 'centre:fulfilments:' + id + ':' } },
  });
  await expect(
    ledger.db.$transaction(async (tx) => {
      await tx.fulfilment.update({ where: { id }, data: { status: 'booked' } });
      throw Error('Synthetic rollback');
    }),
  ).rejects.toThrow('Synthetic rollback');
  expect(
    await ledger.db.staffActivityEvent.count({
      where: { sourceKey: { startsWith: 'centre:fulfilments:' + id + ':' } },
    }),
  ).toBe(before);
  await ledger.db.$transaction(async (tx) => {
    await tx.fulfilment.update({ where: { id }, data: { status: 'booked' } });
    await tx.fulfilment.update({ where: { id }, data: { status: 'ready' } });
  });
  expect(
    await ledger.db.staffActivityEvent.count({
      where: { sourceKey: { startsWith: 'centre:fulfilments:' + id + ':' } },
    }),
  ).toBe(before + 1);
});
