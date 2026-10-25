import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createApi } from '../src/app';
import { AuthService } from '../src/auth/auth-service';
import { CatalogueService } from '../src/catalogue/catalogue-service';
import type { ImageStore } from '../src/catalogue/image-store';
import { createCatalogueClient } from '../../../packages/api-client/src/catalogue';
import { createAuthClient } from '../../../packages/api-client/src/auth';
import { type CreateLotInput, type ImageUploadInput } from '@auction-ng/shared';
import { decryptPii, encryptPii, hashPii } from '../src/security/pii';

let app: Awaited<ReturnType<typeof createApi>>;
let baseUrl: string;
let service: CatalogueService;
let staffId: string;
let otherStaffId: string;
let buyerId: string;
let categoryId: string;
let locationId: string;
let categoryOther: string;
let locationOther: string;
const incoming = new Map<string, Buffer>();
const published = new Map<string, Buffer>();
const store: ImageStore = {
  async presign(key) {
    return `https://uploads.example.test/${key}?signature=synthetic`;
  },
  async read(key) {
    const body = incoming.get(key);
    if (!body) throw new Error('Not uploaded');
    return body;
  },
  async write(key, body) {
    published.set(key, body);
    return `https://photos.example.test/${key}`;
  },
};
const codes = new Map<string, string>();
let publicIds: string[] = [];
const start = new Date(Date.now() + 3600000).toISOString();
const end = new Date(Date.now() + 7200000).toISOString();
beforeAll(async () => {
  const databaseUrl = process.env.LEDGER_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !databaseUrl ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname)
  )
    throw new Error('Isolated catalogue database required.');
  app = await createApi({
    databaseUrl,
    mode: 'local',
    imageStore: store,
    emailProvider: {
      async sendCode(email, code) {
        codes.set(email, code);
      },
    },
  });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  service = app.get(CatalogueService);
  staffId = randomUUID();
  otherStaffId = randomUUID();
  buyerId = randomUUID();
  await service.db.user.createMany({
    data: [
      { id: staffId, name: 'Test intake', role: 'intake' },
      { id: otherStaffId, name: 'Test admin', role: 'admin' },
      { id: buyerId, name: 'Test buyer', role: 'buyer' },
    ].map((user) => ({
      ...user,
      emailCiphertext: encryptPii(`${user.id}@example.test`, 'email'),
      emailHash: hashPii(`${user.id}@example.test`, 'email'),
    })),
  });
  categoryId = randomUUID();
  categoryOther = randomUUID();
  locationId = randomUUID();
  locationOther = randomUUID();
  await service.db.category.createMany({
    data: [
      { id: categoryId, name: 'Phones', slug: `phones-${randomUUID()}` },
      { id: categoryOther, name: 'Kitchen', slug: `kitchen-${randomUUID()}` },
    ],
  });
  await service.db.location.createMany({
    data: [
      {
        id: locationId,
        name: 'Ikeja test hub',
        code: randomUUID().replaceAll('-', ''),
        address: 'Synthetic test location',
        hours: {},
        capacityPerSlot: 20,
      },
      {
        id: locationOther,
        name: 'Lekki test hub',
        code: randomUUID().replaceAll('-', ''),
        address: 'Synthetic test location',
        hours: {},
        capacityPerSlot: 20,
      },
    ],
  });
  publicIds = Array.from({ length: 125 }, () => randomUUID());
  await service.db.lot.createMany({
    data: publicIds.map((id, index) => ({
      id,
      lotNumber: `CAT-${randomUUID().slice(0, 28)}`,
      title: `Test phone ${index}`,
      description: 'Synthetic catalogue fixture',
      condition: 'open_box',
      retailPriceKobo: 5000000n,
      startPriceKobo: BigInt(50000 + index * 10000),
      categoryId,
      locationId,
      startAt: new Date(start),
      endAt: new Date(end),
      status: 'scheduled',
    })),
  });
  await service.db.lotImage.createMany({
    data: publicIds.map((id) => ({
      lotId: id,
      url: `https://photos.example.test/${id}/960.webp`,
      thumbnailUrl: `https://photos.example.test/${id}/320.webp`,
      sortOrder: 0,
      width: 960,
      height: 640,
      thumbnailBytes: 20000,
    })),
  });
});
afterAll(async () => {
  await app?.close();
});
function input(overrides: Partial<CreateLotInput> = {}): CreateLotInput {
  return {
    lotNumber: `CAT-${randomUUID().slice(0, 28)}`,
    title: 'Samsung phone',
    description: 'Screen inspected; charger missing.',
    condition: 'open_box',
    retailPriceKobo: 5000000,
    startPriceKobo: 50000,
    categoryId,
    locationId,
    startsAt: start,
    endsAt: end,
    ...overrides,
  };
}
async function photo(lotId: string, sortOrder = 0) {
  const bytes = await sharp({
    create: { width: 600, height: 400, channels: 3, background: 'white' },
  })
    .jpeg()
    .toBuffer();
  const request: ImageUploadInput = {
    idempotencyKey: randomUUID(),
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    contentType: 'image/jpeg',
    sortOrder,
  };
  const result = await service.beginUpload(staffId, lotId, request);
  const row = await service.db.imageUpload.findUniqueOrThrow({
    where: { id: result.uploadId },
  });
  return { bytes, request, result, row };
}
it('paginates 125 equal-time lots without duplicates and exposes no live maxima or private data', async () => {
  const client = createCatalogueClient(baseUrl);
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.list({ categoryId, limit: 50, cursor });
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
    expect(page.items.length).toBeLessThanOrEqual(50);
    for (const item of page.items) {
      expect(item.currentPriceKobo).toBeNull();
      expect(item.priceSource).toBe('unavailable');
      expect(item.thumbnail?.thumbnailBytes).toBeLessThanOrEqual(30000);
      expect(item).not.toHaveProperty('maxKobo');
    }
  } while (cursor);
  expect(new Set(ids).size).toBe(125);
  expect(ids).toEqual([...publicIds].sort());
  expect((await client.detail(ids[0] ?? '')).images).toHaveLength(1);
  const page = await client.list({ limit: 1, categoryId });
  await expect(
    client.list({
      categoryId: categoryOther,
      cursor: page.nextCursor ?? undefined,
    }),
  ).rejects.toMatchObject({ status: 400 });
});
it('filters category, location, starting-price range and one-hour closing window', async () => {
  const client = createCatalogueClient(baseUrl);
  expect(
    (
      await client.list({
        categoryId,
        locationId,
        minPriceKobo: 50000,
        maxPriceKobo: 60000,
      })
    ).items,
  ).toHaveLength(2);
  expect((await client.list({ categoryId: categoryOther })).items).toEqual([]);
  expect((await client.list({ locationId: locationOther })).items).toEqual([]);
  const open = await service.db.lot.create({
    data: {
      ...fieldsFixture(),
      lotNumber: `CAT-${randomUUID().slice(0, 28)}`,
      startAt: new Date(Date.now() - 3600000),
      endAt: new Date(Date.now() + 1800000),
      status: 'open',
    },
  });
  expect(
    (await client.list({ categoryId, endingSoon: true })).items.map(
      (row) => row.id,
    ),
  ).toEqual([open.id]);
  await service.db.lot.update({
    where: { id: open.id },
    data: { status: 'closed' },
  });
  expect((await client.detail(open.id)).status).toBe('closed');
  expect((await client.list({ categoryId, endingSoon: true })).items).toEqual(
    [],
  );
});
function fieldsFixture() {
  return {
    title: 'Synthetic phone',
    description: 'Synthetic fixture',
    condition: 'untested',
    retailPriceKobo: 5000000n,
    startPriceKobo: 50000n,
    categoryId,
    locationId,
  };
}
it('hides drafts/cancelled lots and legacy placeholders; validates public queries and paginated lookups', async () => {
  const client = createCatalogueClient(baseUrl);
  const row = await service.create(staffId, input());
  await expect(client.detail(row.id)).rejects.toMatchObject({ status: 404 });
  await service.db.lot.update({
    where: { id: row.id },
    data: { status: 'cancelled' },
  });
  await expect(client.detail(row.id)).rejects.toMatchObject({ status: 404 });
  for (const query of [
    'limit=51',
    'limit=1&limit=2',
    'status=draft',
    'minPriceKobo=1.5',
    'cursor=not-a-cursor',
    'endingSoon=yes',
  ])
    expect((await fetch(`${baseUrl}/lots?${query}`)).status).toBe(400);
  expect((await fetch(`${baseUrl}/lots/not-a-uuid`)).status).toBe(400);
  const first = await client.categories({ limit: 1 });
  expect(first.nextCursor).not.toBeNull();
  expect(
    (
      await client.categories({
        limit: 1,
        cursor: first.nextCursor ?? undefined,
      })
    ).items[0]?.id,
  ).not.toBe(first.items[0]?.id);
  expect((await client.locations()).items).toHaveLength(2);
  await expect(
    client.locations({ cursor: first.nextCursor ?? undefined }),
  ).rejects.toMatchObject({ status: 400 });
  const legacy = await service.db.lot.create({
    data: {
      ...fieldsFixture(),
      lotNumber: `CAT-${randomUUID().slice(0, 28)}`,
      startAt: new Date(start),
      endAt: new Date(end),
      status: 'scheduled',
    },
  });
  await service.db.lotImage.create({
    data: {
      lotId: legacy.id,
      url: '/placeholders/photo-pending.svg',
      sortOrder: 0,
    },
  });
  expect((await client.detail(legacy.id)).images).toEqual([]);
});
it('restricts edits to active intake/admin, prevents stale concurrent edits and audits before/after', async () => {
  const row = await service.create(staffId, input());
  await expect(service.create(buyerId, input())).rejects.toThrow(
    'active admin or intake',
  );
  const results = await Promise.allSettled(
    ['First edit', 'Second edit'].map((title) =>
      service.edit(staffId, row.id, {
        title,
        expectedUpdatedAt: row.updatedAt,
      }),
    ),
  );
  expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(
    1,
  );
  const logs = await service.db.auditLog.findMany({
    where: { entityId: row.id, action: 'lots.edited' },
  });
  expect(logs).toHaveLength(1);
  expect(
    JSON.parse(
      decryptPii(Buffer.from(logs[0]?.beforeCiphertext ?? []), 'audit'),
    ),
  ).toMatchObject({ title: 'Samsung phone' });
  await expect(
    service.edit(staffId, row.id, {
      startsAt: end,
      expectedUpdatedAt: (await service.getDraft(staffId, row.id)).updatedAt,
    }),
  ).rejects.toThrow('End must follow start');
  await service.db.lot.update({
    where: { id: row.id },
    data: { status: 'open' },
  });
  await expect(
    service.edit(staffId, row.id, {
      title: 'Changed',
      expectedUpdatedAt: row.updatedAt,
    }),
  ).rejects.toThrow('Only draft');
  await expect(
    service.create(staffId, input({ categoryId: randomUUID() })),
  ).rejects.toThrow('existing category');
});
it('binds upload intents to file/lot/actor and makes completion idempotent with real WebP derivatives', async () => {
  const lot = await service.create(staffId, input());
  const upload = await photo(lot.id);
  expect(await service.beginUpload(staffId, lot.id, upload.request)).toEqual(
    upload.result,
  );
  await expect(
    service.beginUpload(staffId, lot.id, {
      ...upload.request,
      sha256: 'b'.repeat(64),
    }),
  ).rejects.toThrow('new key');
  await expect(
    service.completeUpload(staffId, lot.id, upload.result.uploadId),
  ).rejects.toThrow('complete photo');
  incoming.set(upload.row.objectKey, Buffer.from('different file'));
  await expect(
    service.completeUpload(staffId, lot.id, upload.result.uploadId),
  ).rejects.toThrow('does not match');
  incoming.set(upload.row.objectKey, upload.bytes);
  await expect(
    service.completeUpload(otherStaffId, lot.id, upload.result.uploadId),
  ).rejects.toThrow('Upload not found');
  const completed = await Promise.all([
    service.completeUpload(staffId, lot.id, upload.result.uploadId),
    service.completeUpload(staffId, lot.id, upload.result.uploadId),
  ]);
  expect(completed[0]).toEqual(completed[1]);
  expect(
    await service.completeUpload(staffId, lot.id, upload.result.uploadId),
  ).toEqual(completed[0]);
  expect(await service.db.lotImage.count({ where: { lotId: lot.id } })).toBe(1);
  expect(
    await service.db.auditLog.count({
      where: { entityId: lot.id, action: 'lots.image_added' },
    }),
  ).toBe(1);
  for (const [key, bytes] of published) {
    expect((await sharp(bytes).metadata()).format).toBe('webp');
    if (key.endsWith('/320.webp'))
      expect(bytes.length).toBeLessThanOrEqual(30000);
  }
  await service.db.lot.update({
    where: { id: lot.id },
    data: { status: 'scheduled' },
  });
  expect(
    (await createCatalogueClient(baseUrl).detail(lot.id)).images[0],
  ).toEqual(completed[0]);
});
it('rejects duplicate image positions, expired uploads, corrupt photos and unavailable storage', async () => {
  const lot = await service.create(staffId, input());
  const upload = await photo(lot.id);
  await expect(
    service.beginUpload(staffId, lot.id, {
      ...upload.request,
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toThrow('unused photo position');
  await service.db.imageUpload.update({
    where: { id: upload.row.id },
    data: {
      createdAt: new Date(Date.now() - 600000),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  await expect(
    service.completeUpload(staffId, lot.id, upload.row.id),
  ).rejects.toThrow('expired');
  await expect(
    service.beginUpload(staffId, lot.id, upload.request),
  ).rejects.toThrow('expired');
  const corrupt = Buffer.from('Not an image');
  const request: ImageUploadInput = {
    ...upload.request,
    idempotencyKey: randomUUID(),
    sortOrder: 1,
    sizeBytes: corrupt.length,
    sha256: createHash('sha256').update(corrupt).digest('hex'),
  };
  const next = await service.beginUpload(staffId, lot.id, request);
  const row = await service.db.imageUpload.findUniqueOrThrow({
    where: { id: next.uploadId },
  });
  incoming.set(row.objectKey, corrupt);
  await expect(service.completeUpload(staffId, lot.id, row.id)).rejects.toThrow(
    'valid, still',
  );
  expect(await service.db.lotImage.count({ where: { lotId: lot.id } })).toBe(0);
  const disabled = new CatalogueService(process.env.LEDGER_TEST_DATABASE_URL);
  try {
    await expect(
      disabled.beginUpload(staffId, lot.id, upload.request),
    ).rejects.toThrow('not configured');
  } finally {
    await disabled.onModuleDestroy();
  }
});
it('enforces HTTP roles without enabling staff email login, and documents every route', async () => {
  const deviceId = randomUUID();
  const email = `catalogue-${randomUUID()}@example.test`;
  const auth = createAuthClient(baseUrl, { client: 'mobile', deviceId });
  const challenge = await auth.requestCode(email);
  const code = codes.get(email);
  if (!code) throw new Error('Missing code');
  const session = await auth.verifyCode(challenge.challengeId, code);
  const buyer = createCatalogueClient(baseUrl, {
    accessToken: session.accessToken,
    deviceId,
  });
  await expect(buyer.createDraft(input())).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    createCatalogueClient(baseUrl).createDraft(input()),
  ).rejects.toMatchObject({ status: 401 });
  // Only this test substitutes a verified identity; there is no runtime staff bypass.
  const identity = vi
    .spyOn(app.get(AuthService), 'authenticate')
    .mockResolvedValue({
      sessionId: randomUUID(),
      user: {
        id: staffId,
        name: 'Test intake',
        role: 'intake',
        status: 'active',
        phoneVerified: false,
        email: 'staff@example.test',
        emailVerified: true,
        phone: null,
      },
    });
  try {
    const client = createCatalogueClient(baseUrl, {
      accessToken: 'synthetic',
      deviceId,
    });
    const row = await client.createDraft(input());
    expect(await client.getDraft(row.id)).toEqual(row);
    const edited = await client.editDraft(row.id, {
      title: 'Checked phone',
      expectedUpdatedAt: row.updatedAt,
    });
    expect(edited.title).toBe('Checked phone');
    expect(
      (
        await fetch(`${baseUrl}/admin/lots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input(), status: 'open' }),
        })
      ).status,
    ).toBe(400);
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    const upload = await client.beginUpload(row.id, {
      idempotencyKey: randomUUID(),
      sortOrder: 0,
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      contentType: 'image/png',
    });
    const intent = await service.db.imageUpload.findUniqueOrThrow({
      where: { id: upload.uploadId },
    });
    incoming.set(intent.objectKey, bytes);
    expect(
      (await client.completeUpload(row.id, upload.uploadId)).thumbnailBytes,
    ).toBeLessThanOrEqual(30000);
  } finally {
    identity.mockRestore();
  }
  const doc: { paths: Record<string, unknown> } = await (
    await fetch(`${baseUrl}/docs-json`)
  ).json();
  for (const path of [
    '/lots',
    '/lots/{id}',
    '/categories',
    '/locations',
    '/admin/lots',
    '/admin/lots/{id}',
    '/admin/lots/{id}/images/uploads',
    '/admin/lots/{id}/images/uploads/{uploadId}/complete',
  ])
    expect(doc.paths).toHaveProperty(path);
});
