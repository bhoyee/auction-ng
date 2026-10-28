import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApi } from '../src/app';
import { AuthService } from '../src/auth/auth-service';
import { CatalogueService } from '../src/catalogue/catalogue-service';
import { encryptPii, hashPii, decryptPii } from '../src/security/pii';
import {
  hashStaffPassword,
  newTotpSecret,
  totpCode,
} from '../src/auth/staff-crypto';
import { createCatalogueClient } from '../../../packages/api-client/src/catalogue';
let app: Awaited<ReturnType<typeof createApi>>;
let service: CatalogueService;
let auth: AuthService;
let base: string;
let categoryId: string;
let locationId: string;
let passwordHash: string;
const password = 'synthetic test staff password';
const now = Date.now();
beforeAll(async () => {
  const url = process.env.TOP_DEALS_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !url ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated database required.');
  app = await createApi({
    databaseUrl: url,
    mode: 'local',
    origins: ['http://localhost:3301'],
    now: () => now,
    emailProvider: { async sendCode() {} },
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  service = app.get(CatalogueService);
  auth = app.get(AuthService);
  passwordHash = await hashStaffPassword(password);
  const category = await service.db.category.create({
    data: { name: 'Top Deals fixture', slug: randomUUID() },
  });
  categoryId = category.id;
  const location = await service.db.location.create({
    data: {
      name: 'Synthetic pickup',
      code: randomUUID().slice(0, 8),
      address: 'Synthetic test address',
      hours: {},
      capacityPerSlot: 5,
    },
  });
  locationId = location.id;
});
afterAll(async () => {
  await app?.close();
});
async function staff(role = 'admin', status = 'active') {
  const email = `${randomUUID()}@example.test`;
  const secret = newTotpSecret();
  const user = await service.db.user.create({
    data: {
      name: 'Synthetic staff',
      role,
      status,
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
      staffCredential: {
        create: {
          passwordHash,
          totpSecretCiphertext: encryptPii(secret, 'staff-totp'),
        },
      },
    },
  });
  return {
    ...user,
    email,
    secret,
    code: totpCode(secret, Math.floor(now / 30000)),
    deviceId: randomUUID(),
    client: 'web' as const,
    password,
  };
}
async function lot(
  overrides: {
    status?: string;
    isTopDeal?: boolean;
    topDealOrder?: number;
    minutes?: number;
  } = {},
) {
  const { minutes = 60, ...fields } = overrides;
  return service.db.lot.create({
    data: {
      title: 'Synthetic featured lot',
      lotNumber: `TOP-${randomUUID().slice(0, 28)}`,
      description: 'Fixture',
      condition: 'open_box',
      retailPriceKobo: 5000000n,
      startPriceKobo: 50000n,
      categoryId,
      locationId,
      startAt: new Date(Date.now() - 3600000),
      endAt: new Date(Date.now() + minutes * 60000),
      status: 'open',
      ...fields,
    },
  });
}
it('requires both factors, rejects buyer/inactive credentials and consumes a code once under concurrency', async () => {
  const account = await staff();
  const input = {
    email: account.email,
    password,
    code: account.code,
    deviceId: account.deviceId,
    client: 'web' as const,
  };
  await expect(
    auth.staffSignIn({ ...input, password: 'incorrect' }, 'wrong-password'),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    auth.staffSignIn({ ...input, code: 'not-valid' }, 'wrong-code'),
  ).rejects.toMatchObject({ status: 401 });
  const results = await Promise.allSettled([
    auth.staffSignIn(input, 'concurrent-a'),
    auth.staffSignIn(input, 'concurrent-b'),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
    1,
  );
  for (const [role, status] of [
    ['buyer', 'active'],
    ['admin', 'suspended'],
  ]) {
    const other = await staff(role, status);
    await expect(
      auth.staffSignIn(
        {
          email: other.email,
          password,
          code: other.code,
          deviceId: other.deviceId,
          client: 'web',
        },
        `denied-${role}`,
      ),
    ).rejects.toMatchObject({ status: 401 });
  }
});
it('protects and audits relisting preferences with optimistic concurrency', async () => {
  const admin = await staff();
  const item = await lot();
  const input = {
    autoRelistEnabled: false,
    expectedUpdatedAt: item.updatedAt.toISOString(),
  };
  const results = await Promise.allSettled([
    service.editAutoRelist(admin.id, item.id, input),
    service.editAutoRelist(admin.id, item.id, input),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const updated = await service.db.lot.findUniqueOrThrow({
    where: { id: item.id },
  });
  expect(updated.autoRelistEnabled).toBe(false);
  expect(updated.startPriceKobo).toBe(item.startPriceKobo);
  expect(updated.endAt).toEqual(item.endAt);
  expect(
    await service.db.auditLog.count({
      where: { entityId: item.id, action: 'lots.auto_relist_updated' },
    }),
  ).toBe(1);
  const intake = await staff('intake');
  await expect(
    service.editAutoRelist(intake.id, item.id, input),
  ).rejects.toMatchObject({ status: 403 });
  const closed = await lot({ status: 'closed' });
  await expect(
    service.editAutoRelist(admin.id, closed.id, {
      ...input,
      expectedUpdatedAt: closed.updatedAt.toISOString(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  const tokens = await auth.staffSignIn(
    {
      email: admin.email,
      password,
      code: admin.code,
      deviceId: admin.deviceId,
      client: 'web',
    },
    'relist-admin',
  );
  const client = createCatalogueClient(base, {
    accessToken: tokens.accessToken,
    deviceId: admin.deviceId,
  });
  const saved = await client.editAutoRelist(item.id, {
    autoRelistEnabled: true,
    expectedUpdatedAt: updated.updatedAt.toISOString(),
  });
  expect(saved.autoRelistEnabled).toBe(true);
  expect((await client.merchandisingLots({ unsoldOnly: true })).items).toEqual(
    [],
  );
  const response = await fetch(`${base}/admin/lots/${item.id}/auto-relist`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(401);
});
it('sets a separate HttpOnly staff cookie, binds the device and keeps staff refresh separate from buyer sessions', async () => {
  const account = await staff();
  const response = await fetch(`${base}/auth/staff/sign-in`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3301',
      'X-Auction-Client': 'web',
    },
    body: JSON.stringify({
      email: account.email,
      password,
      code: account.code,
      deviceId: account.deviceId,
      client: 'web',
    }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie') ?? '';
  expect(cookie).toContain('auction_staff_refresh=');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  expect(cookie).toContain('Path=/auth/staff');
  const body = await response.json();
  expect(body).not.toHaveProperty('refreshToken');
  await expect(
    auth.authenticate(body.accessToken, randomUUID()),
  ).rejects.toMatchObject({ status: 401 });
  const identity = await auth.authenticate(body.accessToken, account.deviceId);
  expect(identity.user.role).toBe('admin');
  const token = cookie.split(';')[0]?.split('=')[1];
  const rotated = await auth.refresh(
    { deviceId: account.deviceId, client: 'web' },
    token,
    'staff-refresh',
    true,
  );
  expect(rotated.user.id).toBe(account.id);
  await expect(
    auth.refresh(
      { deviceId: account.deviceId, client: 'web' },
      rotated.refreshToken,
      'wrong-refresh-endpoint',
    ),
  ).rejects.toMatchObject({ status: 401 });
  await service.db.user.update({
    where: { id: account.id },
    data: { role: 'buyer' },
  });
  await expect(
    auth.authenticate(rotated.accessToken, account.deviceId),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    auth.refresh(
      { deviceId: account.deviceId, client: 'web' },
      rotated.refreshToken,
      'staff-token-cannot-become-buyer',
    ),
  ).rejects.toMatchObject({ status: 401 });
  await auth.logout(
    { deviceId: account.deviceId, client: 'web' },
    rotated.refreshToken,
    'staff-logout',
  );
  await expect(
    auth.authenticate(rotated.accessToken, account.deviceId),
  ).rejects.toMatchObject({ status: 401 });
});
it('blocks unapproved staff origins and rate limits repeated failed passwords', async () => {
  const account = await staff();
  const input = {
    email: account.email,
    password,
    code: account.code,
    deviceId: account.deviceId,
    client: 'web' as const,
  };
  const response = await fetch(`${base}/auth/staff/sign-in`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://unapproved.example',
      'X-Auction-Client': 'web',
    },
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(403);
  for (let index = 0; index < 5; index++)
    await expect(
      auth.staffSignIn({ ...input, password: 'wrong' }, `limit-${index}`),
    ).rejects.toMatchObject({ status: 401 });
  await expect(auth.staffSignIn(input, 'over-limit')).rejects.toMatchObject({
    status: 429,
  });
});
it('lets only admins curate active/scheduled lots, logs changes and rejects simultaneous stale edits', async () => {
  const admin = await staff();
  const tokens = await auth.staffSignIn(
    {
      email: admin.email,
      password,
      code: admin.code,
      deviceId: admin.deviceId,
      client: 'web',
    },
    'curation',
  );
  const client = createCatalogueClient(base, {
    accessToken: tokens.accessToken,
    deviceId: admin.deviceId,
  });
  const selected = await lot();
  const deniedBid = await fetch(
    `${base}/lots/${selected.id}/bid-preparations`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.accessToken}`,
        'X-Device-Id': admin.deviceId,
      },
      body: '{}',
    },
  );
  expect(deniedBid.status).toBe(403);
  const page = await client.merchandisingLots({
    reference: selected.lotNumber,
  });
  expect(page.items.map((row) => row.id)).toEqual([selected.id]);
  const input = {
    isTopDeal: true,
    topDealOrder: 5,
    expectedUpdatedAt: selected.updatedAt.toISOString(),
  };
  const results = await Promise.allSettled([
    client.editTopDeal(selected.id, input),
    client.editTopDeal(selected.id, { ...input, topDealOrder: 1 }),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
    1,
  );
  const audit = await service.db.auditLog.findFirstOrThrow({
    where: { entityId: selected.id, action: 'lots.top_deal_updated' },
  });
  expect(
    JSON.parse(decryptPii(Buffer.from(audit.beforeCiphertext ?? []), 'audit'))
      .isTopDeal,
  ).toBe(false);
  expect(
    JSON.parse(decryptPii(Buffer.from(audit.afterCiphertext ?? []), 'audit'))
      .isTopDeal,
  ).toBe(true);
  const intake = await staff('intake');
  const intakeTokens = await auth.staffSignIn(
    {
      email: intake.email,
      password,
      code: intake.code,
      deviceId: intake.deviceId,
      client: 'web',
    },
    'intake-login',
  );
  await expect(
    createCatalogueClient(base, {
      accessToken: intakeTokens.accessToken,
      deviceId: intake.deviceId,
    }).merchandisingLots(),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    service.editTopDeal(intake.id, selected.id, input),
  ).rejects.toMatchObject({ status: 403 });
  const anonymous = await fetch(`${base}/admin/lots`);
  expect(anonymous.status).toBe(401);
  const closed = await lot({ status: 'closed', minutes: -1 });
  await expect(
    client.editTopDeal(closed.id, {
      ...input,
      expectedUpdatedAt: closed.updatedAt.toISOString(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  await service.db.lot.update({
    where: { id: selected.id },
    data: { isTopDeal: false },
  });
});
it('returns only curated eligible lots in admin order, with bounded pagination and no automatic filling', async () => {
  const first = await lot({ isTopDeal: true, topDealOrder: 0 });
  const second = await lot({ isTopDeal: true, topDealOrder: 1 });
  await lot({ isTopDeal: true, minutes: 10 });
  await lot({ isTopDeal: false });
  await lot({ isTopDeal: true, status: 'scheduled' });
  await lot({ isTopDeal: true, status: 'cancelled' });
  const client = createCatalogueClient(base);
  const page = await client.list({ topDeals: true, categoryId, limit: 1 });
  expect(page.items[0]?.id).toBe(first.id);
  const next = await client.list({
    topDeals: true,
    categoryId,
    limit: 1,
    cursor: page.nextCursor ?? undefined,
  });
  expect(next.items[0]?.id).toBe(second.id);
  expect(next.items[0]?.isTopDeal).toBe(true);
  await expect(
    client.list({ cursor: page.nextCursor ?? undefined }),
  ).rejects.toMatchObject({ status: 400 });
});
it('lists only unreplaced unsold stock for review and preserves closed historical results', async () => {
  const admin = await staff();
  const namespace = `test:unsold-review:${randomUUID()}:`;
  await service.db.bidEngineRuntime.create({
    data: { namespace, redisRunId: 'synthetic' },
  });
  const exhausted = await lot({ status: 'closed', minutes: -1 });
  const replaced = await lot({ status: 'closed', minutes: -1 });
  const replacement = await lot();
  const unclassified = await lot({ status: 'closed', minutes: -1 });
  for (const item of [exhausted, replaced]) {
    await service.db.lotSettlement.create({
      data: {
        lotId: item.id,
        namespace,
        feeVersion: 'synthetic',
        streamId: '0-0',
        barrierId: '0-0',
        endAt: item.endAt,
        closedAt: new Date(),
        snapshot: {},
        status: 'unsold',
        relistLotId: item.id === replaced.id ? replacement.id : null,
      },
    });
  }
  const page = await service.merchandisingList(admin.id, {
    limit: 1,
    unsoldOnly: true,
  });
  expect(page.items.map((item) => item.id)).toEqual([exhausted.id]);
  expect(page.nextCursor).toBeNull();
  for (const item of [replaced, replacement, unclassified]) {
    expect(
      (
        await service.merchandisingList(admin.id, {
          limit: 50,
          unsoldOnly: true,
          reference: item.lotNumber,
        })
      ).items,
    ).toEqual([]);
  }
  await expect(
    service.db.lotSettlement.update({
      where: { lotId: exhausted.id },
      data: { relistLotId: replacement.id },
    }),
  ).rejects.toThrow();
});
