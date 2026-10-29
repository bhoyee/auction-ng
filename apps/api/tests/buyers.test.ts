import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApi } from '../src/app';
import { BuyerService } from '../src/buyers/buyer-service';
import { createAuthClient } from '../../../packages/api-client/src/auth';
import { createBuyerClient } from '../../../packages/api-client/src/buyers';
import { createPaymentClient } from '../../../packages/api-client/src/payments';
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
  const challenge = await auth.requestCode(email);
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
    data: { name: 'Buyer fixture', slug: randomUUID() },
  });
  const location = await buyers.db.location.create({
    data: {
      name: 'Ikeja test pickup',
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
