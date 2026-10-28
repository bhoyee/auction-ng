import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from 'redis';
import { LedgerService } from '../src/ledger/ledger-service';
import { BidService } from '../src/bids/bid-service';
import { ClosingService } from '../src/closing/closing-service';
import { PurchaseService } from '../src/purchases/purchase-service';
import { BuyerService } from '../src/buyers/buyer-service';
import { createApi } from '../src/app';
import { createPurchaseClient } from '../../../packages/api-client/src/purchases';
import {
  calculateFixedPrice,
  quotePurchasePayment,
  type PurchaseInput,
  purchasedLotUpdateSchema,
} from '@auction-ng/shared';
import { encryptPii, hashPii } from '../src/security/pii';
import type {
  PaymentProvider,
  VerifiedTransfer,
} from '../src/payments/payment-provider';
let ledger: LedgerService, bids: BidService, purchases: PurchaseService;
let categoryId: string, locationId: string;
const transfers = new Map<string, VerifiedTransfer>();
const provider: PaymentProvider = {
  async initializeCard() {
    return { authorizationUrl: 'https://checkout.paystack.com/synthetic' };
  },
  verifySignature() {
    return true;
  },
  async assignAccount() {},
  async getAccount() {
    return null;
  },
  async verifyTransfer(reference) {
    const row = transfers.get(reference);
    if (!row) throw new Error('Synthetic unverified payment');
    return row;
  },
  async listTransfers() {
    return [];
  },
};
beforeAll(async () => {
  const url = process.env.PURCHASE_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !url ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated purchase database required.');
  ledger = new LedgerService(url);
  bids = new BidService(ledger, {
    enabled: true,
    prefix: `test:purchases:${randomUUID()}:`,
  });
  await bids.start();
  purchases = new PurchaseService(ledger, bids, provider);
  categoryId = (
    await ledger.db.category.create({
      data: { name: 'Purchase fixtures', slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        name: 'Synthetic Lagos hub',
        code: randomUUID().slice(0, 20),
        address: 'Test only',
        hours: {},
        capacityPerSlot: 10,
      },
    })
  ).id;
});
afterAll(async () => {
  await bids?.close();
  await ledger?.close();
});
async function buyer(balance = 10000000n) {
  const token = randomBytes(32).toString('base64url'),
    device = randomUUID();
  const email = `${randomUUID()}@example.test`;
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic buyer',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
    },
  });
  const wallet = await ledger.openWallet(user.id);
  if (balance)
    await ledger.topup({
      walletId: wallet.id,
      amountKobo: balance,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    });
  const session = await ledger.db.authSession.create({
    data: {
      userId: user.id,
      familyId: randomUUID(),
      deviceHash: hashPii(`web:${device}`, 'auth-device'),
      client: 'web',
      accessHash: hashPii(token, 'auth-token'),
      refreshHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  return {
    userId: user.id,
    sessionId: session.id,
    walletId: wallet.id,
    email,
    token,
    device,
  };
}
async function lot() {
  return ledger.db.lot.create({
    data: {
      title: 'Synthetic instant purchase',
      description: 'Fixture',
      condition: 'open_box',
      retailPriceKobo: 2000000n,
      startPriceKobo: 50000n,
      fixedPriceKobo: 1000000n,
      categoryId,
      locationId,
      status: 'open',
      startAt: new Date(Date.now() - 10000),
      endAt: new Date(Date.now() + 3600000),
    },
  });
}
function input(method: PurchaseInput['method'] = 'wallet'): PurchaseInput {
  const q = calculateFixedPrice(1000000);
  const p =
    method === 'wallet'
      ? { amountKobo: q.totalKobo, feeKobo: 0 }
      : quotePurchasePayment(q.totalKobo, method);
  return {
    method,
    idempotencyKey: randomUUID(),
    acceptedPriceKobo: q.priceKobo,
    acceptedTaxKobo: q.taxKobo,
    acceptedProcessingFeeKobo: p.feeKobo,
    acceptedTotalKobo: p.amountKobo,
  };
}
async function payment(id: string, who: Awaited<ReturnType<typeof buyer>>) {
  const row = await ledger.db.purchase.findUniqueOrThrow({ where: { id } });
  const value: VerifiedTransfer = {
    reference: row.providerRef,
    customerCode: 'synthetic',
    customerEmail: who.email,
    amountKobo: Number(row.amountKobo),
    feeKobo: Number(row.processingFeeKobo),
    currency: 'NGN',
    domain: 'test',
    status: 'success',
    channel: row.method === 'bank_transfer' ? 'bank_transfer' : 'card',
    cardCountry: row.method === 'international_card' ? 'US' : 'NG',
  };
  transfers.set(row.providerRef, value);
  return value;
}
it('sells once under simultaneous wallet purchases, creates a tax-only invoice and pickup pass', async () => {
  const a = await buyer(),
    b = await buyer(),
    item = await lot();
  const results = await Promise.allSettled([
    purchases.start(a, item.id, input()),
    purchases.start(b, item.id, input()),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await ledger.db.invoiceLine.count({ where: { lotId: item.id } })).toBe(
    1,
  );
  const line = await ledger.db.invoiceLine.findUniqueOrThrow({
    where: { lotId: item.id },
  });
  expect(line).toMatchObject({
    hammerKobo: 1000000n,
    premiumKobo: 0n,
    lotFeeKobo: 0n,
    vatKobo: 75000n,
    totalKobo: 1075000n,
  });
  expect(
    await ledger.db.fulfilment.count({ where: { invoiceId: line.invoiceId } }),
  ).toBe(1);
  await new ClosingService(ledger, bids).closeLot(item.id);
  const invoiceRow = await ledger.db.invoice.findUniqueOrThrow({
    where: { id: line.invoiceId },
  });
  const reader = new BuyerService(process.env.PURCHASE_TEST_DATABASE_URL);
  try {
    expect(
      (await reader.invoice(invoiceRow.userId, invoiceRow.id)).saleType,
    ).toBe('fixed_price');
  } finally {
    await reader.onModuleDestroy();
  }
  expect(
    await ledger.db.lotSettlement.count({ where: { lotId: item.id } }),
  ).toBe(0);
});
it('publishes one public-safe terminal socket event for a purchase', async () => {
  const observer = createClient({ url: process.env.REDIS_URL });
  await observer.connect();
  const events: unknown[] = [];
  try {
    await observer.subscribe(`${bids.prefix}purchase-updates`, (raw) =>
      events.push(JSON.parse(raw)),
    );
    const who = await buyer(),
      item = await lot(),
      paid = await purchases.start(who, item.id, input());
    await purchases.maintain();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const own = events.filter(
      (event) =>
        purchasedLotUpdateSchema.safeParse(event).success &&
        purchasedLotUpdateSchema.parse(event).lotId === item.id,
    );
    expect(own).toHaveLength(1);
    expect(purchasedLotUpdateSchema.parse(own[0]).endsAt).toBeLessThanOrEqual(
      Date.now(),
    );
    expect(JSON.stringify(own)).not.toContain(who.userId);
    expect(paid.status).toBe('paid');
  } finally {
    await observer.quit();
  }
});
it('returns the original purchase for exact retries and rejects changed amounts', async () => {
  const who = await buyer(),
    item = await lot(),
    request = input();
  const first = await purchases.start(who, item.id, request);
  expect((await purchases.start(who, item.id, request)).id).toBe(first.id);
  await expect(
    purchases.start(who, item.id, { ...request, acceptedTaxKobo: 1 }),
  ).rejects.toThrow();
  expect(
    await ledger.db.ledgerTransaction.count({
      where: { idempotencyKey: `purchase:debit:${first.id}` },
    }),
  ).toBe(1);
});
it('blocks new bid acceptance during checkout and releases all existing bids after purchase', async () => {
  const leader = await buyer(),
    other = await buyer(),
    item = await lot();
  const request = {
    maxKobo: 200000,
    mode: 'direct' as const,
    idempotencyKey: randomUUID(),
  };
  const prepared = await bids.prepare(
    leader,
    item.id,
    request,
    leader.token,
    leader.device,
  );
  await bids.accept(
    item.id,
    {
      preparationId: prepared.preparationId,
      idempotencyKey: request.idempotencyKey,
    },
    leader.token,
    leader.device,
  );
  const next = {
    maxKobo: 300000,
    mode: 'direct' as const,
    idempotencyKey: randomUUID(),
  };
  const contender = await bids.prepare(
    other,
    item.id,
    next,
    other.token,
    other.device,
  );
  const checkout = await purchases.start(other, item.id, input('local_card'));
  await expect(
    bids.accept(
      item.id,
      {
        preparationId: contender.preparationId,
        idempotencyKey: next.idempotencyKey,
      },
      other.token,
      other.device,
    ),
  ).rejects.toThrow();
  const verified = await payment(checkout.id, other);
  await purchases.handlePayment(verified, verified.reference);
  await bids.maintain();
  expect((await ledger.balances(leader.walletId)).heldKobo).toBe(0n);
  expect((await ledger.balances(other.walletId)).heldKobo).toBe(0n);
  expect(await ledger.db.bid.count({ where: { lotId: item.id } })).toBe(1);
  expect((await purchases.get(other.userId, checkout.id)).status).toBe('paid');
  const buyerReads = new BuyerService(process.env.PURCHASE_TEST_DATABASE_URL);
  try {
    expect(
      (await buyerReads.bids(leader.userId, 20)).items.find(
        (entry) => entry.lot.id === item.id,
      )?.outcome,
    ).toBe('cancelled');
  } finally {
    await buyerReads.onModuleDestroy();
  }
});
it.each(['local_card', 'international_card', 'bank_transfer'] as const)(
  'verifies %s exactly once and credits late payments without selling',
  async (method) => {
    const who = await buyer(0n),
      item = await lot();
    const checkout = await purchases.start(who, item.id, input(method));
    await ledger.db.purchase.update({
      where: { id: checkout.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const verified = await payment(checkout.id, who);
    await Promise.all([
      purchases.handlePayment(verified, verified.reference),
      purchases.handlePayment(verified, verified.reference),
    ]);
    expect((await purchases.get(who.userId, checkout.id)).status).toBe(
      'expired',
    );
    expect(
      await ledger.db.invoiceLine.count({ where: { lotId: item.id } }),
    ).toBe(0);
    expect((await ledger.balances(who.walletId)).availableKobo).toBe(
      BigInt(verified.amountKobo - (verified.feeKobo ?? 0)),
    );
  },
);
it('rejects forged provider fields without crediting or selling', async () => {
  const who = await buyer(0n),
    item = await lot(),
    checkout = await purchases.start(who, item.id, input('local_card'));
  const verified = await payment(checkout.id, who);
  for (const changed of [
    { domain: 'live' },
    { amountKobo: 1 },
    { feeKobo: 0 },
    { customerEmail: 'another@example.test' },
    { channel: 'bank_transfer' },
  ])
    await expect(
      purchases.handlePayment({ ...verified, ...changed }, verified.reference),
    ).rejects.toThrow();
  expect((await ledger.balances(who.walletId)).availableKobo).toBe(0n);
  await purchases.cancel(who.userId, checkout.id);
});
it('rolls back a failed debit and leaves the item available without releasing another buyer’s funds', async () => {
  const who = await buyer(0n),
    item = await lot();
  await expect(purchases.start(who, item.id, input())).rejects.toThrow();
  expect(await ledger.db.invoiceLine.count({ where: { lotId: item.id } })).toBe(
    0,
  );
  expect(
    (await ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } })).status,
  ).toBe('open');
});
it('recovers an interrupted external completion without duplicate credit or debit', async () => {
  const who = await buyer(0n),
    item = await lot(),
    checkout = await purchases.start(who, item.id, input('bank_transfer'));
  const verified = await payment(checkout.id, who);
  const debit = vi
    .spyOn(ledger, 'debitInTransaction')
    .mockRejectedValueOnce(new Error('Synthetic transaction failure'));
  await expect(
    purchases.handlePayment(verified, verified.reference),
  ).rejects.toThrow();
  debit.mockRestore();
  await purchases.maintain();
  expect((await purchases.get(who.userId, checkout.id)).status).toBe('paid');
  expect(
    await ledger.db.ledgerTransaction.count({
      where: { idempotencyKey: `purchase:credit:${checkout.id}` },
    }),
  ).toBe(1);
  expect(
    await ledger.db.ledgerTransaction.count({
      where: { idempotencyKey: `purchase:debit:${checkout.id}` },
    }),
  ).toBe(1);
});
it('serializes a simultaneous funded bid and purchase, preserving any accepted history and releasing the hold', async () => {
  const bidder = await buyer(),
    shopper = await buyer(),
    item = await lot();
  const request = {
    maxKobo: 250000,
    idempotencyKey: randomUUID(),
    mode: 'direct' as const,
  };
  const prepared = await bids.prepare(
    bidder,
    item.id,
    request,
    bidder.token,
    bidder.device,
  );
  const results = await Promise.allSettled([
    bids.accept(
      item.id,
      {
        preparationId: prepared.preparationId,
        idempotencyKey: request.idempotencyKey,
      },
      bidder.token,
      bidder.device,
    ),
    purchases.start(shopper, item.id, input()),
  ]);
  expect(results[1]?.status).toBe('fulfilled');
  await purchases.maintain();
  await bids.maintain();
  expect((await ledger.balances(bidder.walletId)).heldKobo).toBe(0n);
  expect(await ledger.db.bid.count({ where: { lotId: item.id } })).toBe(
    results[0]?.status === 'fulfilled' ? 1 : 0,
  );
  expect(await ledger.db.invoiceLine.count({ where: { lotId: item.id } })).toBe(
    1,
  );
});
it('caps reservations at the auction end, protects ownership and resumes bids after cancellation', async () => {
  const who = await buyer(),
    other = await buyer(),
    item = await lot();
  const endAt = new Date(Date.now() + 90000);
  await ledger.db.lot.update({ where: { id: item.id }, data: { endAt } });
  const checkout = await purchases.start(who, item.id, input('bank_transfer'));
  expect(Date.parse(checkout.expiresAt)).toBeLessThanOrEqual(endAt.getTime());
  await expect(purchases.get(other.userId, checkout.id)).rejects.toThrow();
  await expect(purchases.cancel(other.userId, checkout.id)).rejects.toThrow();
  await purchases.cancel(who.userId, checkout.id);
  const request = {
    maxKobo: 100000,
    mode: 'direct' as const,
    idempotencyKey: randomUUID(),
  };
  const prepared = await bids.prepare(
    other,
    item.id,
    request,
    other.token,
    other.device,
  );
  await bids.accept(
    item.id,
    {
      preparationId: prepared.preparationId,
      idempotencyKey: request.idempotencyKey,
    },
    other.token,
    other.device,
  );
  expect((await ledger.balances(other.walletId)).heldKobo).toBeGreaterThan(0n);
  const verified = await payment(checkout.id, who);
  await purchases.handlePayment(verified, verified.reference);
  expect((await purchases.get(who.userId, checkout.id)).status).toBe(
    'cancelled',
  );
  expect(await ledger.db.invoiceLine.count({ where: { lotId: item.id } })).toBe(
    0,
  );
});
it('uses typed protected endpoints and keeps status polling separate from payment-attempt limits', async () => {
  const app = await createApi({
    databaseUrl: process.env.PURCHASE_TEST_DATABASE_URL,
    mode: 'local',
    origins: ['http://localhost:3300'],
    bidOptions: { enabled: true, prefix: bids.prefix },
    paymentProvider: provider,
    emailProvider: { async sendCode() {} },
  });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const who = await buyer(),
      other = await buyer(),
      item = await lot();
    const client = createPurchaseClient(base, {
      accessToken: who.token,
      deviceId: who.device,
    });
    const checkout = await client.start(item.id, input('bank_transfer'));
    expect(checkout.status).toBe('pending');
    for (let index = 0; index < 25; index++)
      expect((await client.get(checkout.id)).id).toBe(checkout.id);
    await expect(
      createPurchaseClient(base, {
        accessToken: other.token,
        deviceId: other.device,
      }).get(checkout.id),
    ).rejects.toMatchObject({ status: 404 });
    const invalid = await fetch(`${base}/lots/${item.id}/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${who.token}`,
        'X-Device-Id': who.device,
      },
      body: JSON.stringify({ ...input(), unexpected: true }),
    });
    expect(invalid.status).toBe(400);
    expect((await client.cancel(checkout.id)).status).toBe('cancelled');
    expect((await fetch(`${base}/purchases/${checkout.id}`)).status).toBe(401);
  } finally {
    await app.close();
  }
});
