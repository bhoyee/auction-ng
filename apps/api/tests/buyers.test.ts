import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApi } from '../src/app';
import { BuyerService } from '../src/buyers/buyer-service';
import { createAuthClient } from '../../../packages/api-client/src/auth';
import { createBuyerClient } from '../../../packages/api-client/src/buyers';
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
