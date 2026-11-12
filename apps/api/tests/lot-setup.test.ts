import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApi } from '../src/app';
import { encryptPii, hashPii } from '../src/security/pii';
import { decryptPii } from '../src/security/pii';
import type { LedgerService } from '../src/ledger/ledger-service';
import { LedgerService as Ledger } from '../src/ledger/ledger-service';

// Lot setup API: every endpoint as each staff role, unique-name errors,
// delete rules, and the main behaviours (inheritance, bins, merge, audit).
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

beforeAll(async () => {
  const url = process.env.LOT_SETUP_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !url ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated lot setup database required.');
  app = await createApi({
    databaseUrl: url,
    mode: 'local',
    origins: ['http://localhost:3301'],
    emailProvider: { async sendCode() {} },
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  ledger = new Ledger(url);
  for (const role of roles) people[role] = await staff(role);
});
afterAll(async () => {
  await ledger?.close();
  await app?.close();
});

async function staff(role: string): Promise<Who> {
  const email = `${randomUUID()}@example.test`;
  const token = randomBytes(32).toString('base64url');
  const device = randomUUID();
  const user = await ledger.db.user.create({
    data: {
      name: `Synthetic ${role}`,
      role,
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
      staffCredential: { create: { passwordHash: 'synthetic-not-a-login' } },
    },
  });
  await ledger.db.authSession.create({
    data: {
      userId: user.id,
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
  return { token, device, userId: user.id };
}

async function call(
  who: Who,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${base}/admin/lot-setup/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${who.token}`,
      'X-Device-Id': who.device,
      'Content-Type': 'application/json',
    },
    ...(body
      ? { body: JSON.stringify({ idempotencyKey: randomUUID(), ...body }) }
      : {}),
  });
  return {
    status: response.status,
    json: (await response.json().catch(() => ({}))) as Record<string, unknown>,
  };
}
const ok = async (who: Who, path: string, body?: Record<string, unknown>) => {
  const r = await call(who, path, body);
  if (r.status !== 200)
    throw new Error(`${path} -> ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
};

const hours = [
  ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map((day) => ({
    day,
    opens: '09:00',
    closes: '18:00',
  })),
  { day: 'saturday', opens: '10:00', closes: '16:00' },
  { day: 'sunday', opens: null, closes: null },
  { day: 'holiday', opens: null, closes: null },
];
const unique = () => randomUUID().slice(0, 8);
const letters = () =>
  Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join('');

function categoryInput(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    parentId: null,
    description: null,
    icon: 'tag',
    defaultRunTimeMinutes: null,
    minStartPriceKobo: null,
    minPhotos: null,
    conditions: null,
    fields: null,
    ...extra,
  };
}
function locationInput(name: string, code: string, fee = 100000) {
  return {
    name,
    code,
    address: '1 Synthetic Close, Ikeja, Lagos',
    landmark: null,
    phone: null,
    lat: null,
    lng: null,
    opensOn: null,
    storageFeeKoboPerDay: fee,
    slotMinutes: 30,
    slotCapacity: 40,
    idRequired: true,
    deliveryEnabled: false,
    binRequiredToPublish: false,
    hours,
  };
}
async function lotIn(categoryId: string, locationId: string, extra = {}) {
  return ledger.db.lot.create({
    data: {
      title: 'Synthetic lot',
      description: 'Fixture',
      condition: 'open_box',
      retailPriceKobo: 2000000n,
      startPriceKobo: 50000n,
      categoryId,
      locationId,
      status: 'draft',
      startAt: new Date(Date.now() + 86400000),
      endAt: new Date(Date.now() + 2 * 86400000),
      ...extra,
    },
  });
}

describe('permissions', () => {
  it('lets every staff role read every Lot setup list', async () => {
    const admin = people.admin;
    const category = (await ok(
      admin,
      'categories',
      categoryInput(`Read ${unique()}`),
    )) as { id: string };
    const location = (await ok(
      admin,
      'locations',
      locationInput(`Read hub ${unique()}`, letters()),
    )) as { id: string };
    for (const role of roles)
      for (const path of [
        'summary',
        'options',
        'categories',
        `categories/${category.id}`,
        'conditions',
        'locations',
        `locations/${location.id}`,
        `locations/${location.id}/bins`,
        `locations/${location.id}/bin-labels`,
        'staff-options',
        'suppliers',
        'brands',
      ])
        expect(
          (await call(people[role], path)).status,
          `${role} GET ${path}`,
        ).toBe(200);
  });
  it('refuses every change for intake, warehouse, finance and support', async () => {
    const writes = [
      'categories',
      'categories/order',
      'categories/visibility',
      'categories/move-lots',
      'categories/delete',
      'locations',
      'locations/close',
      'locations/bin-rule',
      'locations/staff',
      'locations/delete',
      'bins',
      'bins/batch',
      'bins/delete',
      'conditions',
      'conditions/order',
      'suppliers',
      'suppliers/active',
      'suppliers/delete',
      'brands',
      'brands/merge',
      'brands/delete',
    ];
    for (const role of ['intake', 'warehouse', 'finance', 'support'] as const)
      for (const path of writes)
        expect(
          (await call(people[role], path, { id: randomUUID() })).status,
          `${role} POST ${path}`,
        ).toBe(403);
  });
  it('lets admins and ops managers change Lot setup', async () => {
    for (const role of ['admin', 'manager'] as const)
      await ok(people[role], 'suppliers', {
        name: `Supplier ${role} ${unique()}`,
        type: 'retailer',
        contactName: null,
        phone: null,
        email: '',
        paymentTerms: null,
        notes: null,
      });
  });
  it('rejects buyers and unsigned requests', async () => {
    expect((await fetch(`${base}/admin/lot-setup/summary`)).status).toBe(401);
  });
});

describe('categories', () => {
  it('reports unique names and web addresses next to the field', async () => {
    const name = `Phones ${unique()}`;
    await ok(people.admin, 'categories', categoryInput(name));
    const sameName = await call(people.admin, 'categories', {
      ...categoryInput(name),
      slug: `other-${unique()}`,
    });
    expect(sameName).toMatchObject({
      status: 409,
      json: {
        code: 'FIELD_ERROR',
        field: 'name',
        message: 'A category with this name already exists at this level.',
      },
    });
    const sameSlug = await call(people.admin, 'categories', {
      ...categoryInput(`Other ${unique()}`),
      slug: categoryInput(name).slug,
    });
    expect(sameSlug.json).toMatchObject({ field: 'slug' });
    const bad = await call(people.admin, 'categories', {
      ...categoryInput('x'),
    });
    expect(bad).toMatchObject({
      status: 400,
      json: { code: 'FIELD_ERROR', field: 'name' },
    });
  });

  it('keeps two levels, inherits fields and defaults, and audits changes', async () => {
    const parent = (await ok(
      people.admin,
      'categories',
      categoryInput(`Parent ${unique()}`, {
        defaultRunTimeMinutes: 1440,
        minStartPriceKobo: 100000,
        minPhotos: 4,
        conditions: ['new', 'like_new'],
        fields: [
          {
            name: 'Model',
            key: 'model',
            type: 'text',
            options: [],
            helpText: 'e.g. Camon 30',
            required: true,
            showToBuyers: true,
          },
          {
            name: 'Storage',
            key: 'storage',
            type: 'list',
            options: ['64GB', '128GB'],
            helpText: null,
            required: true,
            showToBuyers: true,
          },
        ],
      }),
    )) as { id: string };
    const child = (await ok(
      people.admin,
      'categories',
      categoryInput(`Child ${unique()}`, { parentId: parent.id }),
    )) as { id: string };
    const detail = await ok(people.intake, `categories/${child.id}`);
    expect(detail).toMatchObject({
      fields: null,
      conditions: null,
      effective: {
        runTimeMinutes: 1440,
        minStartPriceKobo: 100000,
        minPhotos: 4,
        conditions: ['new', 'like_new'],
      },
    });
    expect(
      (detail.effective as { fields: { key: string }[] }).fields.map(
        (f) => f.key,
      ),
    ).toEqual(['model', 'storage']);
    const grandchild = await call(
      people.admin,
      'categories',
      categoryInput(`Too deep ${unique()}`, { parentId: child.id }),
    );
    expect(grandchild).toMatchObject({
      status: 400,
      json: { field: 'parentId' },
    });
    const audit = await ledger.db.auditLog.findFirstOrThrow({
      where: {
        entityType: 'category',
        entityId: parent.id,
        action: 'lot_setup.category.created',
      },
    });
    expect(audit.actorId).toBe(people.admin.userId);
    expect(
      JSON.parse(decryptPii(Buffer.from(audit.afterCiphertext ?? []), 'audit')),
    ).toMatchObject({ after: { name: expect.stringContaining('Parent') } });
  });

  it('blocks delete while lots remain, then moves them and deletes', async () => {
    const source = (await ok(
      people.admin,
      'categories',
      categoryInput(`Source ${unique()}`),
    )) as { id: string };
    const target = (await ok(
      people.admin,
      'categories',
      categoryInput(`Target ${unique()}`),
    )) as { id: string };
    const location = (await ok(
      people.admin,
      'locations',
      locationInput(`Move hub ${unique()}`, letters()),
    )) as { id: string };
    await lotIn(source.id, location.id);
    const detail = await ok(people.admin, `categories/${source.id}`);
    expect(detail.deleteCheck).toEqual({
      allowed: false,
      reason: 'Move its 1 lot first.',
      safeOption: 'move-lots',
    });
    expect(
      (await call(people.admin, 'categories/delete', { id: source.id })).status,
    ).toBe(409);
    const moved = await ok(people.admin, 'categories/move-lots', {
      id: source.id,
      targetId: target.id,
    });
    expect(moved.message).toContain('Moved 1 lot');
    await ok(people.admin, 'categories/delete', { id: source.id });
    expect(
      await ledger.db.category.findUnique({ where: { id: source.id } }),
    ).toBeNull();
  });

  it('hides a category from buyers and saves the drag order', async () => {
    const a = (await ok(
      people.admin,
      'categories',
      categoryInput(`Order A ${unique()}`),
    )) as { id: string };
    const hidden = await ok(people.admin, 'categories/visibility', {
      id: a.id,
      visible: false,
    });
    expect(hidden.message).toContain('hidden from buyers');
    const tree = (await ok(people.admin, 'categories')) as {
      items: { id: string; parentId: string | null }[];
    };
    const top = tree.items
      .filter((i) => i.parentId === null)
      .map((i) => i.id)
      .reverse();
    await ok(people.admin, 'categories/order', { parentId: null, ids: top });
    const after = (await ok(people.admin, 'categories')) as {
      items: { id: string; parentId: string | null }[];
    };
    expect(
      after.items.filter((i) => i.parentId === null).map((i) => i.id),
    ).toEqual(top);
    expect(
      (
        await call(people.admin, 'categories/order', {
          parentId: null,
          ids: top.slice(1),
        })
      ).status,
    ).toBe(409);
  });
});

describe('pickup locations and bins', () => {
  it('enforces unique names and codes, and saves the storage fee per location only', async () => {
    const code = letters();
    const name = `Unique hub ${unique()}`;
    const loc = (await ok(
      people.admin,
      'locations',
      locationInput(name, code, 150000),
    )) as { id: string };
    expect(
      (await call(people.admin, 'locations', locationInput(name, letters())))
        .json,
    ).toMatchObject({ field: 'name' });
    expect(
      (
        await call(
          people.admin,
          'locations',
          locationInput(`Other ${unique()}`, code),
        )
      ).json,
    ).toMatchObject({
      field: 'code',
      message: 'Another location already uses this short code.',
    });
    const detail = await ok(people.warehouse, `locations/${loc.id}`);
    expect(detail).toMatchObject({
      storageFeeKoboPerDay: 150000,
      freeWorkingDays: 5,
    });
    const centre = await ledger.db.pickupStorageCentre.findUniqueOrThrow({
      where: { locationId: loc.id },
    });
    expect(centre.dailyKobo).toBe(150000n);
    expect(centre.capKobo).toBe(1000000n);
  });

  it('adds several bins at once, stops on an existing name, and prints labels', async () => {
    const loc = (await ok(
      people.admin,
      'locations',
      locationInput(`Bins hub ${unique()}`, letters()),
    )) as { id: string };
    const added = await ok(people.admin, 'bins/batch', {
      locationId: loc.id,
      prefix: 'S-',
      from: 6,
      to: 10,
      note: null,
      capacity: null,
    });
    expect(added.message).toBe('Added 5 bins: S-06 to S-10.');
    const again = await call(people.admin, 'bins/batch', {
      locationId: loc.id,
      prefix: 'S-',
      from: 9,
      to: 12,
      note: null,
      capacity: null,
    });
    expect(again).toMatchObject({
      status: 400,
      json: {
        field: 'prefix',
        message:
          'S-09 already exists. Change the start of the name or the numbers.',
      },
    });
    const dup = await call(people.admin, 'bins', {
      locationId: loc.id,
      code: 's-06',
      note: null,
      capacity: null,
    });
    expect(dup).toMatchObject({ status: 409, json: { field: 'code' } });
    const labels = (await ok(
      people.intake,
      `locations/${loc.id}/bin-labels`,
    )) as { items: { code: string; qr: string }[] };
    expect(labels.items.map((l) => l.code)).toEqual([
      'S-06',
      'S-07',
      'S-08',
      'S-09',
      'S-10',
    ]);
    expect(labels.items[0]?.qr).toMatch(/^LVBIN:[A-Z]{3}:S-06:/);
    const page = await ok(
      people.admin,
      `locations/${loc.id}/bins?status=empty`,
    );
    expect(page).toMatchObject({
      counts: { all: 5, empty: 5, in_use: 0, closed: 0 },
    });
  });

  it('only deletes an empty bin, and never a location that held lots', async () => {
    const loc = (await ok(
      people.admin,
      'locations',
      locationInput(`Delete hub ${unique()}`, letters()),
    )) as { id: string };
    const bin = (await ok(people.admin, 'bins', {
      locationId: loc.id,
      code: 'CAGE-1',
      note: 'Locked cage',
      capacity: 2,
    })) as { id: string };
    const category = (await ok(
      people.admin,
      'categories',
      categoryInput(`Bin cat ${unique()}`),
    )) as { id: string };
    await lotIn(category.id, loc.id, { binId: bin.id });
    expect(
      (await call(people.admin, 'bins/delete', { id: bin.id })).status,
    ).toBe(409);
    const lowered = await call(people.admin, 'bins', {
      id: bin.id,
      locationId: loc.id,
      code: 'CAGE-1',
      note: null,
      capacity: null,
      acceptsNewLots: false,
    });
    expect(lowered.status).toBe(200);
    const page = (await ok(people.admin, `locations/${loc.id}/bins`)) as {
      items: { status: string }[];
    };
    expect(page.items[0]?.status).toBe('closed');
    expect(
      (await call(people.admin, 'locations/delete', { id: loc.id })).json,
    ).toMatchObject({
      message:
        'This location has held lots. Close it instead; existing lots stay.',
    });
    const closed = await ok(people.admin, 'locations/close', {
      id: loc.id,
      closed: true,
    });
    expect(closed.message).toContain('closed');
    const options = (await ok(people.intake, 'options')) as {
      locations: { id: string }[];
    };
    expect(options.locations.some((l) => l.id === loc.id)).toBe(false);
    const empty = (await ok(
      people.admin,
      'locations',
      locationInput(`Empty hub ${unique()}`, letters()),
    )) as { id: string };
    await ok(people.admin, 'locations/delete', { id: empty.id });
  });
});

describe('conditions, suppliers and brands', () => {
  it('seeds five conditions and keeps labels unique', async () => {
    const list = (await ok(people.support, 'conditions')) as {
      items: { id: string; label: string; updatedAt: string }[];
    };
    expect(list.items.map((c) => c.label)).toEqual([
      'New',
      'Like new',
      'Open box',
      'Damaged',
      'Untested',
    ]);
    const [first, second] = list.items;
    if (!first || !second) throw new Error('missing conditions');
    const clash = await call(people.admin, 'conditions', {
      id: second.id,
      label: first.label,
      meaning: 'Duplicate name attempt.',
      colour: 'grey',
      active: true,
    });
    expect(clash).toMatchObject({ status: 409, json: { field: 'label' } });
  });

  it('keeps supplier names unique and deactivates instead of deleting', async () => {
    const name = `Lagos Returns ${unique()}`;
    const input = {
      name,
      type: 'marketplace_returns',
      contactName: 'Tunde Bakare',
      phone: null,
      email: '',
      paymentTerms: 'Net 14 days',
      notes: null,
    };
    const saved = (await ok(people.admin, 'suppliers', input)) as {
      id: string;
    };
    expect((await call(people.admin, 'suppliers', input)).json).toMatchObject({
      field: 'name',
    });
    const off = await ok(people.admin, 'suppliers/active', {
      id: saved.id,
      active: false,
    });
    expect(off.message).toContain('deactivated');
  });

  it('merges two brands into one and updates their lots', async () => {
    const category = (await ok(
      people.admin,
      'categories',
      categoryInput(`Brand cat ${unique()}`),
    )) as { id: string };
    const location = (await ok(
      people.admin,
      'locations',
      locationInput(`Brand hub ${unique()}`, letters()),
    )) as { id: string };
    const keep = (await ok(people.admin, 'brands', {
      name: `Tecno ${unique()}`,
      categoryIds: [category.id],
    })) as { id: string };
    const dupe = (await ok(people.admin, 'brands', {
      name: `TECNO dup ${unique()}`,
      categoryIds: [],
    })) as { id: string };
    const lot = await lotIn(category.id, location.id, { brandId: dupe.id });
    expect(
      (await call(people.admin, 'brands/delete', { id: dupe.id })).status,
    ).toBe(409);
    const merged = await ok(people.admin, 'brands/merge', {
      sourceId: dupe.id,
      targetId: keep.id,
    });
    expect(merged.message).toContain('1 lot was updated');
    expect(
      (await ledger.db.lot.findUniqueOrThrow({ where: { id: lot.id } }))
        .brandId,
    ).toBe(keep.id);
    expect(
      await ledger.db.brand.findUnique({ where: { id: dupe.id } }),
    ).toBeNull();
    const again = await call(people.admin, 'brands', {
      name: `tecno ${unique()}`,
      categoryIds: [],
    });
    expect(again.status).toBe(200);
  });

  it('replays an exact retry without a second change', async () => {
    const body = {
      idempotencyKey: randomUUID(),
      name: `Retry ${unique()}`,
      categoryIds: [],
    };
    const first = await ok(people.admin, 'brands', body);
    const second = await ok(people.admin, 'brands', body);
    expect(second).toEqual(first);
    expect(await ledger.db.brand.count({ where: { name: body.name } })).toBe(1);
  });
});

describe('deletion history', () => {
  it('records who deleted which item and when, newest first, page by page', async () => {
    const before = Date.now() - 1000;
    const supplierName = `Deleted supplier ${unique()}`;
    const supplier = (await ok(people.admin, 'suppliers', {
      name: supplierName,
      type: 'retailer',
      contactName: null,
      phone: null,
      email: '',
      paymentTerms: null,
      notes: null,
    })) as { id: string };
    await ok(people.admin, 'suppliers/delete', { id: supplier.id });
    const brandName = `Deleted brand ${unique()}`;
    const brand = (await ok(people.manager, 'brands', {
      name: brandName,
      categoryIds: [],
    })) as { id: string };
    await ok(people.manager, 'brands/delete', { id: brand.id });

    const page = (await ok(people.support, 'deletions?limit=2')) as {
      items: {
        kind: string;
        itemId: string;
        name: string;
        deletedBy: string;
        deletedAt: string;
      }[];
      nextCursor: string | null;
    };
    expect(page.items[0]).toMatchObject({
      kind: 'brand',
      itemId: brand.id,
      name: brandName,
      deletedBy: 'Synthetic manager',
    });
    expect(page.items[1]).toMatchObject({
      kind: 'supplier',
      itemId: supplier.id,
      name: supplierName,
      deletedBy: 'Synthetic admin',
    });
    for (const item of page.items)
      expect(Date.parse(item.deletedAt)).toBeGreaterThanOrEqual(before);

    const one = (await ok(people.admin, 'deletions?limit=1')) as {
      items: { itemId: string }[];
      nextCursor: string | null;
    };
    expect(one.items).toHaveLength(1);
    expect(one.nextCursor).toEqual(expect.any(String));
    const next = (await ok(
      people.admin,
      `deletions?limit=1&cursor=${encodeURIComponent(one.nextCursor ?? '')}`,
    )) as { items: { itemId: string }[] };
    expect(next.items[0]?.itemId).toBe(supplier.id);

    expect(
      (await call(people.admin, 'deletions?cursor=not-a-cursor')).status,
    ).toBe(400);
    expect((await call(people.admin, 'deletions?limit=500')).status).toBe(400);
    expect((await call(people.admin, 'deletions?admin=true')).status).toBe(400);
  });
});

describe('lots and Lot setup rules', () => {
  it('checks the bin when a lot is saved and filters the Lots list by bin', async () => {
    const { lotSetupReferences } =
      await import('../src/lot-setup/publish-rules');
    const a = (await ok(
      people.admin,
      'locations',
      locationInput(`Rule A ${unique()}`, letters()),
    )) as { id: string };
    const b = (await ok(
      people.admin,
      'locations',
      locationInput(`Rule B ${unique()}`, letters()),
    )) as { id: string };
    const small = (await ok(people.admin, 'bins', {
      locationId: a.id,
      code: 'S-01',
      note: null,
      capacity: 1,
    })) as { id: string };
    const closed = (await ok(people.admin, 'bins', {
      locationId: a.id,
      code: 'RETURNS',
      note: null,
      capacity: null,
      acceptsNewLots: false,
    })) as { id: string };
    const category = (await ok(
      people.admin,
      'categories',
      categoryInput(`Rule cat ${unique()}`),
    )) as { id: string };
    const check = (locationId: string, binId: string) =>
      ledger.db.$transaction((tx) =>
        lotSetupReferences(tx, { locationId, binId, brandId: null }),
      );
    await expect(check(b.id, small.id)).rejects.toMatchObject({
      response: { field: 'binId' },
    });
    await expect(check(a.id, closed.id)).rejects.toMatchObject({
      response: {
        message: 'RETURNS is not taking new lots. Pick another bin.',
      },
    });
    await check(a.id, small.id);
    await lotIn(category.id, a.id, { binId: small.id });
    await expect(check(a.id, small.id)).rejects.toMatchObject({
      response: { message: 'S-01 is full (holds up to 1). Pick another bin.' },
    });
    const loose = await lotIn(category.id, a.id);
    const response = await fetch(
      `${base}/staff/records?kind=lots&location=${a.id}&bin=none`,
      {
        headers: {
          Authorization: `Bearer ${people.admin.token}`,
          'X-Device-Id': people.admin.device,
        },
      },
    );
    const page = (await response.json()) as {
      items: { id: string; bin: string | null }[];
    };
    expect(page.items.map((i) => i.id)).toEqual([loose.id]);
    expect(page.items[0]?.bin).toBeNull();
  });

  it('lists what still blocks publishing: bin rule, photos, details, condition and start price', async () => {
    const { publishProblems } = await import('../src/lot-setup/publish-rules');
    const loc = (await ok(people.admin, 'locations', {
      ...locationInput(`Publish hub ${unique()}`, letters()),
      binRequiredToPublish: true,
    })) as { id: string };
    const category = (await ok(
      people.admin,
      'categories',
      categoryInput(`Publish cat ${unique()}`, {
        minPhotos: 2,
        minStartPriceKobo: 100000,
        conditions: ['new'],
        fields: [
          {
            name: 'Model',
            key: 'model',
            type: 'text',
            options: [],
            helpText: null,
            required: true,
            showToBuyers: true,
          },
          {
            name: 'Colour',
            key: 'colour',
            type: 'text',
            options: [],
            helpText: null,
            required: false,
            showToBuyers: true,
          },
        ],
      }),
    )) as { id: string };
    const lot = await lotIn(category.id, loc.id);
    const problems = await ledger.db.$transaction((tx) =>
      publishProblems(tx, lot.id),
    );
    expect(problems).toEqual([
      expect.stringContaining('Put this lot in a bin.'),
      expect.stringContaining('Add 2 more photos.'),
      expect.stringContaining('doesn’t allow this condition'),
      'The starting bid is below this category’s lowest start price.',
      'Fill in: Model.',
    ]);
  });
});
