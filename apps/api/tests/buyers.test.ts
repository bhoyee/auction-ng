import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApi } from '../src/app';
import { BuyerService } from '../src/buyers/buyer-service';
import { createAuthClient } from '../../../packages/api-client/src/auth';
import { createBuyerClient } from '../../../packages/api-client/src/buyers';
import { createPaymentClient } from '../../../packages/api-client/src/payments';
import { createSearchHistoryClient } from '../../../packages/api-client/src/search-history';
import {
  createSavedSearchClient,
  savedSearchAvailability,
} from '../../../packages/api-client/src/saved-searches';
import { SavedSearchService } from '../src/saved-searches/saved-search-service';
import { encryptPii, hashPii } from '../src/security/pii';

let app: Awaited<ReturnType<typeof createApi>>;
let buyers: BuyerService;
let url: string;
let userId: string;
let otherId: string;
let lotId: string;
let invoiceId: string;
let token: string;
const deviceId = randomUUID();
const codes = new Map<string, string>();
let client: ReturnType<typeof createBuyerClient>;
it('serves an uncached public server clock without authentication or database changes', async () => {
  const response = await fetch(`${url}/time`);
  const value = (await response.json()) as { serverTime: string };
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(Math.abs(Date.parse(value.serverTime) - Date.now())).toBeLessThan(
    5000,
  );
});
it('returns only owned notification metadata, bounded and uncached, without decrypting delivery secrets', async () => {
  const own = await buyers.db.notification.create({
    data: {
      userId,
      channel: 'email',
      template: 'auction-result-v1',
      payloadCiphertext: encryptPii(
        'private test delivery content',
        'notification',
      ),
    },
  });
  const other = await buyers.db.notification.create({
    data: {
      userId: otherId,
      channel: 'email',
      template: 'auction-result-v1',
      payloadCiphertext: encryptPii('other private content', 'notification'),
    },
  });
  const value = await client.notifications({ limit: 1 });
  expect(value.items).toHaveLength(1);
  expect(value.items[0]?.id).toBe(own.id);
  expect(JSON.stringify(value)).not.toContain(other.id);
  expect(JSON.stringify(value)).not.toContain('payloadCiphertext');
  expect(value.items[0]?.readAt).toBeNull();
  expect((await client.notificationSummary()).unread).toBe(1);
  expect(await client.readNotifications([own.id, other.id])).toEqual({
    updated: 1,
  });
  expect(await client.readNotifications([own.id])).toEqual({ updated: 0 });
  expect((await client.notificationSummary()).unread).toBe(0);
  expect(
    (
      await buyers.db.notification.findUniqueOrThrow({
        where: { id: other.id },
      })
    ).readAt,
  ).toBeNull();
  expect((await fetch(`${url}/buyers/notifications/summary`)).status).toBe(401);
  expect(
    (
      await fetch(`${url}/buyers/notifications/summary?userId=${otherId}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId },
      })
    ).status,
  ).toBe(400);
  const response = await fetch(`${url}/buyers/notifications?limit=1`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId },
  });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await fetch(`${url}/buyers/notifications`)).status).toBe(401);
});
beforeAll(async () => {
  const databaseUrl = process.env.BUYER_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !databaseUrl ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname)
  )
    throw new Error('Isolated buyer database required.');
  app = await createApi({
    databaseUrl,
    mode: 'local',
    savedSearchesEnabled: true,
    paymentProvider: {
      async listBanks(input) {
        return {
          items: [
            {
              code: input.cursor ? '008' : '007',
              name: 'Synthetic verification bank',
            },
          ],
          nextCursor: input.cursor ? null : 'bmV4dA',
        };
      },
      async initializeCard() {
        throw new Error('Not expected');
      },
      verifySignature() {
        return false;
      },
      async assignAccount() {
        throw new Error('Not expected');
      },
      async getAccount() {
        return null;
      },
      async verifyTransfer() {
        throw new Error('Not expected');
      },
      async listTransfers() {
        return [];
      },
    },
    emailProvider: {
      async sendCode(email, code) {
        codes.set(email, code);
      },
    },
  });
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  buyers = app.get(BuyerService);
  const auth = createAuthClient(url, {
    client: 'web',
    deviceId,
    origin: 'http://localhost:3300',
  });
  const email = `${randomUUID()}@example.test`;
  const challenge = await auth.requestCode(
    email,
    'Synthetic fixture password 42',
    'signup',
  );
  const code = codes.get(email);
  if (!code) throw new Error('Missing synthetic OTP');
  const result = await auth.verifyCode(challenge.challengeId, code);
  token = result.accessToken;
  userId = result.user.id;
  const otherEmail = `${randomUUID()}@example.test`;
  otherId = (
    await buyers.db.user.create({
      data: {
        name: 'Other buyer',
        emailCiphertext: encryptPii(otherEmail, 'email'),
        emailHash: hashPii(otherEmail, 'email'),
      },
    })
  ).id;
  const category = await buyers.db.category.create({
    data: {
      name: `Buyer fixture ${randomUUID().slice(0, 8)}`,
      slug: randomUUID(),
    },
  });
  const location = await buyers.db.location.create({
    data: {
      name: `Ikeja test pickup ${randomUUID().slice(0, 8)}`,
      code: randomUUID().slice(0, 30),
      address: 'Synthetic',
      hours: {},
      capacityPerSlot: 20,
    },
  });
  lotId = (
    await buyers.db.lot.create({
      data: {
        title: 'Test kettle',
        description: 'Synthetic',
        condition: 'open_box',
        retailPriceKobo: 900000n,
        startPriceKobo: 50000n,
        startAt: new Date(),
        endAt: new Date(Date.now() + 3600000),
        categoryId: category.id,
        locationId: location.id,
        status: 'scheduled',
      },
    })
  ).id;
  invoiceId = (
    await buyers.db.invoice.create({
      data: {
        userId: otherId,
        hammerTotalKobo: 50000n,
        premiumKobo: 7500n,
        lotFeeKobo: 30000n,
        vatKobo: 2813n,
        totalKobo: 90313n,
      },
    })
  ).id;
  client = createBuyerClient(url, { accessToken: token, deviceId });
});
afterAll(async () => {
  await app?.close();
});
it('labels confirmed Buy Now notices and rejects oversized or unknown read fields', async () => {
  const row = await buyers.db.notification.create({
    data: {
      userId,
      reference: `purchase:${randomUUID()}:paid`,
      channel: 'email',
      template: 'auction-result-v1',
      payloadCiphertext: encryptPii('private', 'notification'),
    },
  });
  const page = await client.notifications();
  expect(page.items.find((item) => item.id === row.id)).toMatchObject({
    title: 'Your Buy Now purchase is confirmed',
    href: '/awaiting-pickup',
    readAt: null,
  });
  for (const body of [
    { ids: [row.id], userId: otherId },
    { ids: Array.from({ length: 51 }, () => randomUUID()) },
  ]) {
    expect(
      (
        await fetch(`${url}/buyers/notifications/read`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Device-Id': deviceId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
  }
  await client.readNotifications([row.id]);
});
it('requires authentication and rejects unknown fields on buyer reads', async () => {
  expect((await fetch(`${url}/buyers/invoices`)).status).toBe(401);
  expect(
    (
      await fetch(`${url}/buyers/invoices?userId=${otherId}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId },
      })
    ).status,
  ).toBe(400);
});
it('lists verification banks through the authenticated typed client without writing wallet entries', async () => {
  expect((await fetch(`${url}/payments/banks`)).status).toBe(401);
  const before = await buyers.db.ledgerEntry.count();
  const payments = createPaymentClient(url, { accessToken: token, deviceId });
  const first = await payments.getBanks({ limit: 1 });
  expect(first.items[0]?.code).toBe('007');
  if (!first.nextCursor) throw new Error('Missing bank cursor');
  expect(
    (await payments.getBanks({ limit: 1, cursor: first.nextCursor })).items[0]
      ?.code,
  ).toBe('008');
  expect(await buyers.db.ledgerEntry.count()).toBe(before);
  expect(
    (
      await fetch(`${url}/payments/banks?unknown=true`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId },
      })
    ).status,
  ).toBe(400);
});
it('saves watches idempotently and never returns another buyer watches', async () => {
  await client.watch(lotId, true);
  await client.watch(lotId, true);
  expect((await client.watched([lotId])).lotIds).toEqual([lotId]);
  expect((await buyers.watched(otherId, [lotId])).lotIds).toEqual([]);
  const page = await client.watchlist({ limit: 1 });
  expect(page.items.map((row) => row.lot.id)).toEqual([lotId]);
  expect(page.nextCursor).toBeNull();
  expect((await buyers.watches(otherId, 50)).items).toEqual([]);
  await client.watch(lotId, false);
  expect((await client.watchlist()).items).toEqual([]);
});
it('keeps invoices owner-scoped, omits pickup secrets and disables caching', async () => {
  await expect(client.invoice(invoiceId)).rejects.toMatchObject({
    status: 404,
  });
  expect((await client.invoices()).items).toEqual([]);
  const result = await fetch(`${url}/buyers/invoices`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId },
  });
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(await buyers.invoice(otherId, invoiceId))).not.toMatch(
    /qrToken|Ciphertext|userId/,
  );
});
it('returns only your bid history and never exposes another buyer or a private maximum', async () => {
  await buyers.db.bid.createMany({
    data: [
      {
        userId,
        lotId,
        amountKobo: 50000n,
        maxKobo: 50000n,
        idempotencyKey: randomUUID(),
      },
      {
        userId: otherId,
        lotId,
        amountKobo: 60000n,
        maxKobo: 999999n,
        idempotencyKey: randomUUID(),
      },
    ],
  });
  const page = await client.bids();
  expect(page.items).toHaveLength(1);
  expect(page.items[0]?.amountKobo).toBe(50000);
  expect(page.items[0]?.outcome).toBe('pending');
  expect(JSON.stringify(page)).not.toMatch(/maxKobo|999999|winnerId|userId/);
  expect((await client.lotHistory(lotId)).items).toEqual([]);
  const publicHistory = await fetch(`${url}/lots/${lotId}/bid-history`);
  expect(publicHistory.status).toBe(200);
  expect(publicHistory.headers.get('cache-control')).toBe('no-store');
  expect(await publicHistory.json()).toEqual({ items: [], nextCursor: null });
  expect(
    (await fetch(`${url}/lots/${lotId}/bid-history?limit=51`)).status,
  ).toBe(400);
  expect(
    (await fetch(`${url}/lots/${lotId}/bid-history?userId=${otherId}`)).status,
  ).toBe(400);
  expect((await fetch(`${url}/lots/${randomUUID()}/bid-history`)).status).toBe(
    404,
  );
  expect((await fetch(`${url}/buyers/lots/${lotId}/my-bids`)).status).toBe(401);
  const personal = await client.lotBids(lotId);
  expect(personal.items).toHaveLength(1);
  expect(personal.items[0]?.amountKobo).toBe(50000);
  expect(JSON.stringify(personal)).not.toMatch(/999999|maxKobo|userId/);
  expect((await client.lotBids(randomUUID())).items).toEqual([]);
  await expect(
    client.lotHistory(lotId, { cursor: 'invalid' }),
  ).rejects.toMatchObject({ status: 400 });
});
it('paginates tied timestamps without repetition and rejects cursor replay across owners', async () => {
  const at = new Date();
  await buyers.db.invoice.createMany({
    data: Array.from({ length: 3 }, () => ({
      userId,
      hammerTotalKobo: 50000n,
      premiumKobo: 7500n,
      lotFeeKobo: 30000n,
      vatKobo: 2813n,
      totalKobo: 90313n,
      createdAt: at,
    })),
  });
  const first = await client.invoices({ limit: 2 });
  expect(first.items).toHaveLength(2);
  if (!first.nextCursor) throw new Error('Missing cursor');
  const second = await client.invoices({ limit: 2, cursor: first.nextCursor });
  expect(second.items).toHaveLength(1);
  expect(
    new Set([...first.items, ...second.items].map((row) => row.id)).size,
  ).toBe(3);
  await expect(buyers.invoices(otherId, 2, first.nextCursor)).rejects.toThrow();
  await expect(client.invoices({ cursor: 'invalid' })).rejects.toMatchObject({
    status: 400,
  });
});
it('separates Buy Now orders and outstanding collections with private scoped pagination', async () => {
  const { LedgerService } = await import('../src/ledger/ledger-service');
  const ledger = app.get(LedgerService);
  const wallet = await ledger.openWallet(userId);
  const source = await buyers.db.lot.findUniqueOrThrow({
    where: { id: lotId },
  });
  const namespace = `test:portal:${randomUUID()}:`;
  await buyers.db.bidEngineRuntime.create({
    data: { namespace, redisRunId: randomUUID() },
  });
  const expectedCollections: string[] = [];
  const expectedPurchases: string[] = [];
  for (const [index, state] of [
    'pending',
    'booked',
    'ready',
    'collected',
    'cancelled',
    'delivery',
    'unpaid',
    'other',
  ].entries()) {
    const owner = state === 'other' ? otherId : userId;
    const invoice = await buyers.db.invoice.create({
      data: {
        userId: owner,
        status: state === 'unpaid' ? 'pending' : 'paid',
        hammerTotalKobo: 100000n,
        premiumKobo: 0n,
        lotFeeKobo: 0n,
        vatKobo: 7500n,
        totalKobo: 107500n,
        createdAt: new Date('2026-10-29T10:00:00Z'),
      },
    });
    await buyers.db.fulfilment.create({
      data: {
        invoiceId: invoice.id,
        userId: owner,
        locationId: source.locationId,
        type: state === 'delivery' ? 'delivery' : 'pickup',
        status: ['collected', 'cancelled', 'booked', 'ready'].includes(state)
          ? state
          : 'pending',
        collectedAt: state === 'collected' ? new Date() : null,
      },
    });
    if (index < 3) expectedCollections.push(invoice.id);
    if (index < 2) {
      const lot = await buyers.db.lot.create({
        data: {
          title: 'Synthetic portal purchase',
          description: 'Read fixture',
          condition: 'new',
          categoryId: source.categoryId,
          locationId: source.locationId,
          startPriceKobo: 50000n,
          retailPriceKobo: 200000n,
          startAt: new Date(),
          endAt: new Date(Date.now() + 3600000),
        },
      });
      await buyers.db.purchase.create({
        data: {
          userId,
          walletId: wallet.id,
          lotId: lot.id,
          namespace,
          requestKey: randomUUID(),
          method: 'wallet',
          status: 'paid',
          priceKobo: 100000n,
          taxKobo: 7500n,
          totalKobo: 107500n,
          amountKobo: 107500n,
          processingFeeKobo: 0n,
          creditKobo: 107500n,
          expiresAt: new Date(),
          providerRef: randomUUID(),
          invoiceId: invoice.id,
        },
      });
      expectedPurchases.push(invoice.id);
    }
  }
  const before = await buyers.db.ledgerEntry.count();
  const first = await client.collections({ limit: 2 });
  if (!first.nextCursor) throw new Error('Missing collection cursor');
  const second = await client.collections({
    limit: 2,
    cursor: first.nextCursor,
  });
  expect([...first.items, ...second.items].map((row) => row.id).sort()).toEqual(
    expectedCollections.sort(),
  );
  expect(second.nextCursor).toBeNull();
  expect((await client.purchases()).items.map((row) => row.id).sort()).toEqual(
    expectedPurchases.sort(),
  );
  expect(
    (await client.purchases()).items.every(
      (row) => row.saleType === 'fixed_price',
    ),
  ).toBe(true);
  await expect(
    client.purchases({ cursor: first.nextCursor }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    buyers.invoices(otherId, 2, first.nextCursor, 'collections'),
  ).rejects.toThrow();
  for (const path of ['purchases', 'collections']) {
    expect((await fetch(`${url}/buyers/${path}`)).status).toBe(401);
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Device-Id': deviceId,
    };
    expect(
      (await fetch(`${url}/buyers/${path}?userId=${otherId}`, { headers }))
        .status,
    ).toBe(400);
    expect(
      (await fetch(`${url}/buyers/${path}`, { headers })).headers.get(
        'cache-control',
      ),
    ).toBe('no-store');
  }
  expect(JSON.stringify(first)).not.toMatch(/qrToken|Ciphertext|userId/);
  expect(await buyers.db.ledgerEntry.count()).toBe(before);
});

it('counts the complete owned watchlist without pagination, leaks or duplicate retry drift', async () => {
  const { createWatchStatusClient } =
    await import('../../../packages/api-client/src/watch-status');
  const source = await buyers.db.lot.findUniqueOrThrow({
    where: { id: lotId },
  });
  const ids = Array.from({ length: 54 }, () => randomUUID());
  await buyers.db.lot.createMany({
    data: ids.map((id) => ({
      id,
      title: 'Count fixture',
      description: 'Synthetic',
      condition: 'new',
      categoryId: source.categoryId,
      locationId: source.locationId,
      startPriceKobo: 50000n,
      retailPriceKobo: 200000n,
      startAt: new Date(),
      endAt: new Date(Date.now() + 86400000),
      status: 'open',
    })),
  });
  await buyers.db.watchlist.createMany({
    data: ids.map((id) => ({ userId, lotId: id })),
  });
  await buyers.db.watchlist.create({ data: { userId: otherId, lotId } });
  const before = await buyers.db.ledgerEntry.count();
  const counts = createWatchStatusClient(url, { accessToken: token, deviceId });
  expect(await counts.count()).toEqual({ count: 54 });
  await Promise.all([
    client.watch(ids[0] ?? lotId, true),
    client.watch(ids[0] ?? lotId, true),
  ]);
  expect(await counts.count()).toEqual({ count: 54 });
  await Promise.all([
    client.watch(ids[0] ?? lotId, false),
    client.watch(ids[0] ?? lotId, false),
  ]);
  expect(await counts.count()).toEqual({ count: 53 });
  expect(await buyers.watchCount(otherId)).toEqual({ count: 1 });
  const headers = { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId };
  const response = await fetch(`${url}/buyers/watchlist/count`, { headers });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ count: 53 });
  expect((await fetch(`${url}/buyers/watchlist/count`)).status).toBe(401);
  expect(
    (
      await fetch(`${url}/buyers/watchlist/count?userId=${otherId}`, {
        headers,
      })
    ).status,
  ).toBe(400);
  const doc = (await (await fetch(`${url}/docs-json`)).json()) as {
    paths: Record<string, unknown>;
  };
  expect(doc.paths).toHaveProperty('/buyers/watchlist/count');
  expect(await buyers.db.ledgerEntry.count()).toBe(before);
});

it('groups only saved items by owned outcome with scoped cursors and no money writes', async () => {
  const base = await buyers.db.lot.findUniqueOrThrow({ where: { id: lotId } });
  const runtime = `watch-test-${randomUUID()}`;
  await buyers.db.bidEngineRuntime.create({
    data: { namespace: runtime, redisRunId: 'synthetic' },
  });
  const before = await buyers.db.ledgerEntry.count();
  async function fixture(winnerId: string | null | undefined, saved = true) {
    const lot = await buyers.db.lot.create({
      data: {
        title: `Saved outcome ${randomUUID()}`,
        description: 'Synthetic watchlist fixture',
        categoryId: base.categoryId,
        locationId: base.locationId,
        startAt: new Date(),
        endAt: new Date(Date.now() + 60000),
        condition: 'open_box',
        startPriceKobo: 50000n,
        retailPriceKobo: 900000n,
        status: winnerId === undefined ? 'open' : 'closed',
      },
    });
    if (winnerId !== undefined)
      await buyers.db.lotSettlement.create({
        data: {
          lotId: lot.id,
          namespace: runtime,
          winnerId,
          groupId: winnerId ? randomUUID() : null,
          hammerKobo: winnerId ? 100000n : null,
          feeVersion: (await buyers.db.auctionFeePolicy.findFirstOrThrow())
            .version,
          streamId: `${Date.now()}-0`,
          barrierId: '0-0',
          endAt: lot.endAt,
          closedAt: lot.endAt,
          snapshot: {},
        },
      });
    if (saved)
      await buyers.db.watchlist.create({ data: { userId, lotId: lot.id } });
    return lot;
  }
  const active = await fixture(undefined);
  const win = await fixture(userId);
  const loss = await fixture(otherId);
  const unsold = await fixture(null);
  const unwatchedWin = await fixture(userId, false);
  const unwatchedLoss = await fixture(otherId, false);
  const won = await client.watchActivity('won');
  expect(won.items.map((row) => row.id)).toEqual([win.id]);
  expect(won.items[0]?.finalPriceKobo).toBe(100000);
  const watching = await client.watchActivity('watching');
  expect(watching.items.some((row) => row.id === active.id)).toBe(true);
  expect(watching.items.every((row) => row.outcome === 'watching')).toBe(true);
  const lost = await client.watchActivity('lost', { limit: 1 });
  expect(lost.items).toHaveLength(1);
  expect(lost.nextCursor).toBeTruthy();
  const tail = await client.watchActivity('lost', {
    limit: 1,
    cursor: lost.nextCursor ?? undefined,
  });
  expect(new Set([...lost.items, ...tail.items].map((row) => row.id))).toEqual(
    new Set([loss.id, unsold.id]),
  );
  expect(
    [...lost.items, ...tail.items].find((row) => row.id === unsold.id)?.outcome,
  ).toBe('unsold');
  await expect(
    client.watchActivity('won', { cursor: lost.nextCursor ?? undefined }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    buyers.watchActivity(otherId, 'lost', 1, lost.nextCursor ?? undefined),
  ).rejects.toThrow();
  expect((await buyers.watchActivity(otherId, 'won', 50)).items).toEqual([]);
  expect(JSON.stringify(won)).not.toMatch(/winnerId|userId|maxKobo|Ciphertext/);
  expect(
    JSON.stringify([...won.items, ...lost.items, ...tail.items]),
  ).not.toContain(unwatchedWin.id);
  expect(
    JSON.stringify([...won.items, ...lost.items, ...tail.items]),
  ).not.toContain(unwatchedLoss.id);
  const response = await fetch(`${url}/buyers/watchlist/activity?view=won`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId },
  });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await fetch(`${url}/buyers/watchlist/activity`)).status).toBe(401);
  expect(
    (
      await fetch(`${url}/buyers/watchlist/activity?view=invalid`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(`${url}/buyers/watchlist/activity?userId=${otherId}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId },
      })
    ).status,
  ).toBe(400);
  expect(await buyers.db.ledgerEntry.count()).toBe(before);
});

it('places a saved paid fixed-price item in Won without requiring a bid', async () => {
  const purchase = await buyers.db.purchase.findFirstOrThrow({
    where: { userId, status: 'paid' },
  });
  await buyers.db.watchlist.upsert({
    where: { userId_lotId: { userId, lotId: purchase.lotId } },
    create: { userId, lotId: purchase.lotId },
    update: {},
  });
  const won = await client.watchActivity('won');
  expect(won.items.find((row) => row.id === purchase.lotId)).toMatchObject({
    outcome: 'won',
    finalPriceKobo: Number(purchase.priceKobo),
  });
  expect(
    (await client.watchActivity('watching')).items.some(
      (row) => row.id === purchase.lotId,
    ),
  ).toBe(false);
  expect((await buyers.watchActivity(otherId, 'won', 50)).items).toEqual([]);
});
it('counts only paid, uncollected pickup orders belonging to the buyer', async () => {
  const before = (await client.notificationSummary()).awaitingPickup;
  const lot = await buyers.db.lot.findUniqueOrThrow({ where: { id: lotId } });
  const cases = [
    {
      owner: userId,
      invoiceStatus: 'paid',
      status: 'ready',
      type: 'pickup',
      collectedAt: null,
    },
    {
      owner: otherId,
      invoiceStatus: 'paid',
      status: 'ready',
      type: 'pickup',
      collectedAt: null,
    },
    {
      owner: userId,
      invoiceStatus: 'pending',
      status: 'ready',
      type: 'pickup',
      collectedAt: null,
    },
    {
      owner: userId,
      invoiceStatus: 'paid',
      status: 'collected',
      type: 'pickup',
      collectedAt: new Date(),
    },
    {
      owner: userId,
      invoiceStatus: 'paid',
      status: 'cancelled',
      type: 'pickup',
      collectedAt: null,
    },
    {
      owner: userId,
      invoiceStatus: 'paid',
      status: 'ready',
      type: 'delivery',
      collectedAt: null,
    },
  ];
  for (const item of cases) {
    const invoice = await buyers.db.invoice.create({
      data: {
        userId: item.owner,
        status: item.invoiceStatus,
        hammerTotalKobo: 50000n,
        premiumKobo: 0n,
        lotFeeKobo: 0n,
        vatKobo: 0n,
        totalKobo: 50000n,
      },
    });
    await buyers.db.fulfilment.create({
      data: {
        userId: item.owner,
        invoiceId: invoice.id,
        locationId: lot.locationId,
        status: item.status,
        type: item.type,
        collectedAt: item.collectedAt,
      },
    });
  }
  expect((await client.notificationSummary()).awaitingPickup).toBe(before + 1);
});

it('totals estimated savings on paid items only, clamped per item and owner-scoped', async () => {
  const source = await buyers.db.lot.findUniqueOrThrow({
    where: { id: lotId },
  });
  const before = await client.savings();
  const lot = (retail: bigint) =>
    buyers.db.lot.create({
      data: {
        title: 'Savings fixture',
        description: 'Synthetic',
        condition: 'new',
        categoryId: source.categoryId,
        locationId: source.locationId,
        startPriceKobo: 50000n,
        retailPriceKobo: retail,
        startAt: new Date(Date.now() - 86400000),
        endAt: new Date(Date.now() - 3600000),
        status: 'closed',
      },
    });
  const sale = async (
    owner: string,
    status: string,
    retail: bigint,
    hammer: bigint,
  ) => {
    const item = await lot(retail);
    await buyers.db.invoice.create({
      data: {
        userId: owner,
        status,
        hammerTotalKobo: hammer,
        premiumKobo: 0n,
        lotFeeKobo: 0n,
        vatKobo: 0n,
        totalKobo: hammer,
        lines: {
          create: {
            lotId: item.id,
            hammerKobo: hammer,
            premiumKobo: 0n,
            lotFeeKobo: 0n,
            vatKobo: 0n,
            totalKobo: hammer,
          },
        },
      },
    });
  };
  // Counted: ₦9,000 retail bought at ₦2,500 saves ₦6,500.
  await sale(userId, 'paid', 900000n, 250000n);
  // Counted as a paid item, but sold above its estimate: saves nothing.
  await sale(userId, 'paid', 100000n, 150000n);
  // Not counted: unpaid, refunded, cancelled, or another buyer's.
  await sale(userId, 'pending', 900000n, 100000n);
  await sale(userId, 'refunded', 900000n, 100000n);
  await sale(userId, 'cancelled', 900000n, 100000n);
  await sale(otherId, 'paid', 900000n, 100000n);
  const ledger = await buyers.db.ledgerEntry.count();
  expect(await client.savings()).toEqual({
    savedKobo: before.savedKobo + 650000,
    paidItems: before.paidItems + 2,
  });
  const headers = { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId };
  const response = await fetch(`${url}/buyers/savings`, { headers });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(Object.keys((await response.json()) as object).sort()).toEqual([
    'paidItems',
    'savedKobo',
  ]);
  expect((await fetch(`${url}/buyers/savings`)).status).toBe(401);
  expect(
    (await fetch(`${url}/buyers/savings?userId=${otherId}`, { headers }))
      .status,
  ).toBe(400);
  expect(await buyers.db.ledgerEntry.count()).toBe(ledger);
});
it('reports only your own bidding, won and lost positions for displayed lots', async () => {
  const base = await buyers.db.lot.findUniqueOrThrow({ where: { id: lotId } });
  const runtime = `bid-status-${randomUUID()}`;
  await buyers.db.bidEngineRuntime.create({
    data: { namespace: runtime, redisRunId: 'synthetic' },
  });
  const feeVersion = (await buyers.db.auctionFeePolicy.findFirstOrThrow())
    .version;
  async function fixture(
    status: 'scheduled' | 'open' | 'closed',
    bidders: string[],
    winnerId?: string,
  ) {
    const lot = await buyers.db.lot.create({
      data: {
        title: `Bid status ${randomUUID()}`,
        description: 'Synthetic bid status fixture',
        categoryId: base.categoryId,
        locationId: base.locationId,
        startAt: new Date(),
        endAt: new Date(Date.now() + 60000),
        condition: 'open_box',
        startPriceKobo: 50000n,
        retailPriceKobo: 900000n,
        status,
      },
    });
    for (const bidder of bidders)
      await buyers.db.bid.create({
        data: {
          userId: bidder,
          lotId: lot.id,
          amountKobo: 50000n,
          maxKobo: 50000n,
          idempotencyKey: randomUUID(),
        },
      });
    if (winnerId)
      await buyers.db.lotSettlement.create({
        data: {
          lotId: lot.id,
          namespace: runtime,
          winnerId,
          groupId: randomUUID(),
          hammerKobo: 100000n,
          feeVersion,
          streamId: `${Date.now()}-0`,
          barrierId: '0-0',
          endAt: lot.endAt,
          closedAt: lot.endAt,
          snapshot: {},
        },
      });
    return lot.id;
  }
  const bidding = await fixture('open', [userId, otherId]);
  const won = await fixture('closed', [userId, otherId], userId);
  const lost = await fixture('closed', [userId, otherId], otherId);
  const neverBid = await fixture('open', [otherId]);
  const reopened = await fixture('open', [userId]);
  await buyers.db.lot.update({
    where: { id: reopened },
    data: { bidRound: { increment: 1 } },
  });
  const purchase = await buyers.db.purchase.findFirstOrThrow({
    where: { userId, status: 'paid' },
  });
  await buyers.db.bid.create({
    data: {
      userId,
      lotId: purchase.lotId,
      amountKobo: 50000n,
      maxKobo: 50000n,
      idempotencyKey: randomUUID(),
    },
  });
  const ids = [bidding, won, lost, neverBid, reopened, purchase.lotId];
  const value = await client.bidStatus(ids);
  expect(
    Object.fromEntries(value.items.map((row) => [row.lotId, row.state])),
  ).toEqual({ [bidding]: 'bidding', [won]: 'won', [lost]: 'lost' });
  const other = await buyers.bidStatus(otherId, ids);
  expect(
    Object.fromEntries(other.items.map((row) => [row.lotId, row.state])),
  ).toEqual({
    [bidding]: 'bidding',
    [won]: 'lost',
    [lost]: 'won',
    [neverBid]: 'bidding',
  });
  expect(JSON.stringify(value)).not.toMatch(/userId|winnerId|amountKobo/);
  const post = (body: unknown, query = '') =>
    fetch(`${url}/buyers/bids/status${query}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Device-Id': deviceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  const ok = await post({ lotIds: [bidding] });
  expect(ok.status).toBe(200);
  expect(ok.headers.get('cache-control')).toBe('no-store');
  expect((await post({ lotIds: [] })).status).toBe(400);
  expect(
    (
      await post({
        lotIds: Array.from({ length: 51 }, () => randomUUID()),
      })
    ).status,
  ).toBe(400);
  expect((await post({ lotIds: [bidding], userId: otherId })).status).toBe(400);
  expect((await post({ lotIds: [bidding] }, `?userId=${otherId}`)).status).toBe(
    400,
  );
  expect(
    (
      await fetch(`${url}/buyers/bids/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotIds: [bidding] }),
      })
    ).status,
  ).toBe(401);
});

it('keeps an owned, deduplicated recent-search list capped at 20, showing 8, uncached', async () => {
  const history = createSearchHistoryClient(url, {
    accessToken: token,
    deviceId,
  });
  expect(await history.clear()).toEqual({ enabled: true, items: [] });
  // A guest list merged on sign-in arrives newest first.
  await history.record(['Kettle', '  rice   cooker ', 'fan']);
  await history.record(['FAN']);
  expect((await history.list()).items.map((i) => i.query)).toEqual([
    'FAN',
    'Kettle',
    'rice cooker',
  ]);
  for (let i = 0; i < 25; i += 1) await history.record([`item ${i}`]);
  const page = await history.list();
  expect(page.items).toHaveLength(8);
  expect(page.items[0]?.query).toBe('item 24');
  expect(await buyers.db.buyerSearchHistory.count({ where: { userId } })).toBe(
    20,
  );
  // Another buyer's searches are never shown, removed or cleared.
  await buyers.db.buyerSearchHistory.create({
    data: { userId: otherId, queryKey: 'item 24', query: 'item 24' },
  });
  expect((await history.remove('ITEM 24')).items[0]?.query).toBe('item 23');
  await history.clear();
  expect((await history.list()).items).toEqual([]);
  expect(
    await buyers.db.buyerSearchHistory.count({ where: { userId: otherId } }),
  ).toBe(1);
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Device-Id': deviceId,
    'Content-Type': 'application/json',
  };
  const read = await fetch(`${url}/buyers/search-history`, { headers });
  expect(read.headers.get('cache-control')).toBe('no-store');
  expect((await fetch(`${url}/buyers/search-history`)).status).toBe(401);
  for (const body of [
    { queries: ['fan'], userId: otherId },
    { queries: [] },
    { queries: Array(9).fill('fan') },
    { queries: ['x'.repeat(121)] },
    { queries: ['   '] },
  ])
    expect(
      (
        await fetch(`${url}/buyers/search-history`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
  expect(
    (await fetch(`${url}/buyers/search-history?userId=${otherId}`, { headers }))
      .status,
  ).toBe(400);
});

it('saves searches once per wording and filters, owner-only, capped at 20', async () => {
  expect(await savedSearchAvailability(url)).toEqual({ enabled: true });
  const saved = createSavedSearchClient(url, { accessToken: token, deviceId });
  const category = await buyers.db.category.findFirstOrThrow();
  const first = await saved.save({ query: '  iPhone 13 ' });
  expect(first.created).toBe(true);
  // Same words in other capitals: the same saved search.
  expect(await saved.save({ query: 'iphone   13' })).toEqual({
    id: first.id,
    created: false,
  });
  // Same words with a category filter: a separate saved search.
  const filtered = await saved.save({
    query: 'iphone 13',
    categoryId: category.id,
    maxPriceKobo: 5000000,
  });
  expect(filtered.created).toBe(true);
  const page = await saved.list();
  expect(page.limit).toBe(20);
  expect(page.items.map((i) => i.id)).toEqual([filtered.id, first.id]);
  expect(page.items[0]).toMatchObject({
    query: 'iphone 13',
    categoryId: category.id,
    maxPriceKobo: 5000000,
  });
  // Another buyer can't see or remove it.
  const other = await buyers.db.buyerSavedSearch.create({
    data: { userId: otherId, query: 'fan', filterKey: 'fan|||' },
  });
  expect(page.items.some((i) => i.id === other.id)).toBe(false);
  await expect(saved.remove(other.id)).rejects.toMatchObject({ status: 404 });
  await saved.remove(first.id);
  expect((await saved.list()).items.map((i) => i.id)).toEqual([filtered.id]);
  await expect(
    saved.save({ query: 'fan', categoryId: randomUUID() }),
  ).rejects.toMatchObject({ status: 400 });
  // Concurrent saves can't pass the limit of 20.
  const results = await Promise.allSettled(
    Array.from({ length: 22 }, (_, i) => saved.save({ query: `item ${i}` })),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(19);
  expect(
    results.filter(
      (r) =>
        r.status === 'rejected' &&
        (r.reason as { status?: number }).status === 409,
    ),
  ).toHaveLength(3);
  expect(await buyers.db.buyerSavedSearch.count({ where: { userId } })).toBe(
    20,
  );
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Device-Id': deviceId,
    'Content-Type': 'application/json',
  };
  for (const body of [
    { query: 'fan', userId: otherId },
    { query: '' },
    { query: 'fan', categoryId: 'not-a-uuid' },
    { query: 'fan', maxPriceKobo: 1.5 },
  ])
    expect(
      (
        await fetch(`${url}/buyers/saved-searches`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
  expect((await fetch(`${url}/buyers/saved-searches`)).status).toBe(401);
  // Switched off: nothing is shown and nothing can be saved.
  const off = new SavedSearchService(buyers.db, false);
  expect(off.enabled).toBe(false);
  expect(await off.list(userId)).toEqual({
    enabled: false,
    limit: 20,
    digest: false,
    items: [],
  });
  await expect(off.save(userId, { query: 'fan' })).rejects.toThrow();
  expect(await off.summary(userId)).toEqual({ newMatches: 0 });
});

it('saved-search alert settings are owner-only and strict', async () => {
  const saved = createSavedSearchClient(url, { accessToken: token, deviceId });
  const mine = (await saved.list()).items[0];
  if (!mine) throw Error('Expected a saved search from the previous test');
  expect(mine).toMatchObject({ instantEmail: false, newMatches: 0 });
  await saved.setInstantEmail(mine.id, true);
  expect((await saved.list()).items[0]?.instantEmail).toBe(true);
  expect(await saved.setDigest(false)).toEqual({ digest: false });
  expect((await saved.list()).digest).toBe(false);
  await saved.setDigest(true);
  expect(await saved.summary()).toEqual({ newMatches: 0 });
  expect((await saved.newItems()).items).toEqual([]);
  await saved.viewed(mine.id);
  const other = await buyers.db.buyerSavedSearch.findFirstOrThrow({
    where: { userId: otherId },
  });
  await expect(saved.setInstantEmail(other.id, true)).rejects.toMatchObject({
    status: 404,
  });
  await expect(saved.viewed(other.id)).rejects.toMatchObject({ status: 404 });
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Device-Id': deviceId,
    'Content-Type': 'application/json',
  };
  for (const [path, body] of [
    [`/buyers/saved-searches/${mine.id}`, { instantEmail: 'yes' }],
    [
      `/buyers/saved-searches/${mine.id}`,
      { instantEmail: true, userId: otherId },
    ],
    ['/buyers/saved-searches/settings', { digest: true, extra: 1 }],
    ['/buyers/saved-searches/not-a-uuid', { instantEmail: true }],
  ] as const)
    expect(
      (
        await fetch(`${url}${path}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
  expect(
    (await fetch(`${url}/buyers/saved-searches/new-items?limit=9`, { headers }))
      .status,
  ).toBe(400);
  expect(
    (
      await fetch(`${url}/buyers/saved-searches/summary?userId=${otherId}`, {
        headers,
      })
    ).status,
  ).toBe(400);
  expect((await fetch(`${url}/buyers/saved-searches/summary`)).status).toBe(
    401,
  );
});
