import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { AuthService, type AuthIdentity } from '../src/auth/auth-service';
import { StaffAdminService } from '../src/staff-admin/staff-admin-service';
import { StaffBidReviewService } from '../src/staff-admin/staff-bid-review-service';
import { encryptPii, hashPii } from '../src/security/pii';
import {
  profileSchema,
  staffPermissionsFor,
  staffBidReviewQuerySchema,
  staffBidReviewHistoryQuerySchema,
} from '@auction-ng/shared';
import { createStaffAdminClient } from '../../../packages/api-client/src/staff-admin';
import { createApi } from '../src/app';
let ledger: LedgerService,
  auth: AuthService,
  staff: StaffAdminService,
  service: StaffBidReviewService,
  databaseUrl: string;
beforeAll(() => {
  const url = process.env.STAFF_ADMIN_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated database required');
  databaseUrl = url;
  ledger = new LedgerService(url);
  auth = new AuthService({ databaseUrl: url });
  staff = new StaffAdminService(ledger, auth, {
    fenceEligibility: async () => {},
  });
  service = new StaffBidReviewService(staff);
});
afterAll(async () => {
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
  const session = await ledger.db.authSession.create({
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
  const who: AuthIdentity = {
    sessionId: session.id,
    permissions: staffPermissionsFor(role),
    user: profileSchema.parse({
      id: user.id,
      name: user.name,
      email,
      role,
      status: 'active',
      emailVerified: true,
      phone: null,
      phoneVerified: false,
    }),
  };
  return { user, who };
}
async function item() {
  const key = randomUUID();
  const category = await ledger.db.category.create({
    data: { name: 'Synthetic category', slug: key },
  });
  const location = await ledger.db.location.create({
    data: {
      name: 'Synthetic centre',
      code: key.slice(0, 30),
      address: 'Synthetic address',
      hours: {},
      capacityPerSlot: 10,
    },
  });
  return ledger.db.lot.create({
    data: {
      title: 'Review ' + key,
      description: 'Synthetic description',
      categoryId: category.id,
      locationId: location.id,
      condition: 'open_box',
      retailPriceKobo: 900000n,
      startPriceKobo: 50000n,
      startAt: new Date(Date.now() - 7200000),
      endAt: new Date(Date.now() - 60000),
      status: 'closed',
    },
  });
}
it('searches archived auction participation, paginates bid rows and never exposes private maxima', async () => {
  const admin = await actor(),
    buyer = await actor('buyer'),
    lot = await item();
  await ledger.db.lot.update({
    where: { id: lot.id },
    data: { archivedAt: new Date() },
  });
  for (let n = 0; n < 3; n++)
    await ledger.db.bid.create({
      data: {
        lotId: lot.id,
        userId: buyer.user.id,
        amountKobo: BigInt(60000 + n),
        maxKobo: 876543210n,
        isProxy: n === 0,
        idempotencyKey: randomUUID(),
      },
    });
  expect(
    (await service.list(admin.who, { search: lot.lotNumber })).items.map(
      (r) => r.id,
    ),
  ).toEqual([lot.id]);
  expect(
    (await service.list(admin.who, { search: buyer.user.id })).items.some(
      (r) => r.id === lot.id,
    ),
  ).toBe(true);
  const page = await service.detail(admin.who, lot.id, { limit: 2 });
  const next = await service.detail(admin.who, lot.id, {
    limit: 2,
    cursor: page.nextCursor,
  });
  expect(page.entries).toHaveLength(2);
  expect(next.entries).toHaveLength(1);
  expect(
    new Set([...page.entries, ...next.entries].map((r) => r.id)).size,
  ).toBe(3);
  expect(JSON.stringify([page, next])).not.toContain('876543210');
  const proxy = [...page.entries, ...next.entries].find(
    (r) => r.kind === 'Automatic bid',
  );
  expect(proxy?.publicPriceKobo).toBeNull();
  expect(proxy?.directAmountKobo).toBeNull();
  expect(page.result.type).toBe('pending');
  expect(page.result.buyer).toBeNull();
  const missing = await service.detail(admin.who, lot.id, {
    search: randomUUID(),
  });
  expect(missing.entries).toHaveLength(0);
  await expect(
    service.detail(admin.who, lot.id, { cursor: randomUUID() }),
  ).rejects.toThrow();
});
it('requires assigned read capability, audits inspection once and preserves bids', async () => {
  const admin = await actor(),
    support = await actor('support'),
    buyer = await actor('buyer'),
    lot = await item();
  await expect(service.list(support.who, {})).rejects.toThrow();
  await expect(service.list(buyer.who, {})).rejects.toThrow();
  const role = await ledger.db.staffRole.create({
    data: {
      name: randomUUID(),
      key: randomUUID(),
      permissions: ['bids.read'],
      createdById: admin.user.id,
    },
  });
  await ledger.db.staffMembership.create({
    data: { userId: support.user.id, roleId: role.id },
  });
  expect(
    (await service.list(support.who, { search: lot.lotNumber })).items,
  ).toHaveLength(1);
  const key = randomUUID();
  await service.opened(support.who, lot.id, key);
  await service.opened(support.who, lot.id, key);
  expect(
    await ledger.db.auditLog.count({
      where: {
        actorId: support.user.id,
        entityId: lot.id,
        action: 'staff.bid_review_opened',
      },
    }),
  ).toBe(1);
  await expect(
    staff.records(support.who, { kind: 'buyers' }),
  ).rejects.toThrow();
  expect(await ledger.db.bid.count({ where: { lotId: lot.id } })).toBe(0);
});
it('shows frozen winners and payment status, rather than inferring a winner from the highest historical bid', async () => {
  const admin = await actor(),
    buyer = await actor('buyer'),
    lot = await item();
  const namespace = 'test:review:' + randomUUID();
  await ledger.db.bidEngineRuntime.create({
    data: { namespace, redisRunId: 'test' },
  });
  const fee = await ledger.db.auctionFeePolicy.findFirstOrThrow();
  await ledger.db.lotSettlement.create({
    data: {
      lotId: lot.id,
      namespace,
      winnerId: buyer.user.id,
      groupId: randomUUID(),
      hammerKobo: 75000n,
      feeVersion: fee.version,
      streamId: '1-0',
      barrierId: '1-1',
      endAt: lot.endAt,
      closedAt: new Date(),
      snapshot: {},
      status: 'frozen',
    },
  });
  const detail = await service.detail(admin.who, lot.id, {});
  expect(detail.result).toMatchObject({
    type: 'auction',
    buyer: { id: buyer.user.id },
    priceKobo: 75000,
    status: 'frozen',
    invoiceStatus: null,
  });
  expect(detail.recordedLeader).toBeNull();
});
it('strictly validates read queries', () => {
  for (const input of [
    { limit: 51 },
    { search: 'x'.repeat(121) },
    { cursor: 'bad' },
    { extra: true },
  ])
    expect(staffBidReviewQuerySchema.safeParse(input).success).toBe(false);
  expect(
    staffBidReviewHistoryQuerySchema.safeParse({ view: 'private_maxima' })
      .success,
  ).toBe(false);
});
it('protects HTTP endpoints and exposes the typed read client', async () => {
  const admin = await actor(),
    buyer = await actor('buyer'),
    lot = await item();
  const app = await createApi({ databaseUrl, mode: 'local' });
  vi.spyOn(app.get(AuthService), 'authenticate').mockImplementation(
    async (token) => (token === 'staff' ? admin.who : buyer.who),
  );
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl(),
    deviceId = randomUUID();
  try {
    const client = createStaffAdminClient(url, {
      accessToken: 'staff',
      deviceId,
    });
    expect(
      (await client.bidReview({ search: lot.lotNumber })).items,
    ).toHaveLength(1);
    expect((await client.bidReviewDetail(lot.id)).lot.id).toBe(lot.id);
    await client.recordBidReview(lot.id, randomUUID());
    expect(
      (
        await fetch(url + '/staff/bid-review', {
          headers: { Authorization: 'Bearer buyer', 'X-Device-Id': deviceId },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(url + '/staff/bid-review?extra=1', {
          headers: { Authorization: 'Bearer staff', 'X-Device-Id': deviceId },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(url + '/staff/bid-review/' + lot.id, {
          headers: { Authorization: 'Bearer staff', 'X-Device-Id': deviceId },
        })
      ).headers.get('cache-control'),
    ).toBe('no-store');
  } finally {
    await app.close();
  }
});
