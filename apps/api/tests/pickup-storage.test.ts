import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { AuthService, type AuthIdentity } from '../src/auth/auth-service';
import { StaffAdminService } from '../src/staff-admin/staff-admin-service';
import { PickupStorageService } from '../src/pickup/storage-service';
import { profileSchema, staffPermissionsFor } from '@auction-ng/shared';
import { encryptPii, hashPii } from '../src/security/pii';
import type {
  VerifiedTransfer,
  PaymentProvider,
} from '../src/payments/payment-provider';
let ledger: LedgerService,
  auth: AuthService,
  staff: StaffAdminService,
  service: PickupStorageService;
let clock = new Date('2026-11-06T12:00:00.000Z');
const calendar = {
  weekdays: [1, 2, 3, 4, 5],
  closedDates: [],
  opensMinute: 540,
  closesMinute: 1020,
};
beforeAll(() => {
  const url = process.env.STORAGE_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated storage database required');
  ledger = new LedgerService(url);
  auth = new AuthService({ databaseUrl: url });
  staff = new StaffAdminService(ledger, auth, {
    fenceEligibility: async () => {},
  });
  service = new PickupStorageService(ledger, staff, undefined, () => clock);
});
afterAll(async () => {
  await ledger?.close();
  await auth?.close();
});
async function identity(role = 'buyer') {
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
    sessionId: s.id,
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
  } satisfies AuthIdentity;
}
async function fixture() {
  clock = new Date('2026-11-06T12:00:00.000Z');
  const admin = await identity('admin'),
    buyer = await identity();
  const category = await ledger.db.category.create({
    data: { name: 'Storage fixture', slug: randomUUID() },
  });
  const centre = await ledger.db.location.create({
    data: {
      name: 'Storage centre',
      code: randomUUID().slice(0, 30),
      address: 'Synthetic address',
      hours: {},
      capacityPerSlot: 10,
    },
  });
  const lot = await ledger.db.lot.create({
    data: {
      categoryId: category.id,
      locationId: centre.id,
      title: 'Storage fixture item',
      description: 'Synthetic',
      condition: 'open_box',
      retailPriceKobo: 1000000n,
      startPriceKobo: 50000n,
      status: 'closed',
      startAt: new Date(Date.now() - 7200000),
      endAt: new Date(Date.now() - 3600000),
    },
  });
  const invoice = await ledger.db.invoice.create({
    data: {
      userId: buyer.user.id,
      status: 'paid',
      hammerTotalKobo: 100000n,
      premiumKobo: 0n,
      lotFeeKobo: 0n,
      vatKobo: 0n,
      totalKobo: 100000n,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    },
  });
  await ledger.db.fulfilment.create({
    data: {
      invoiceId: invoice.id,
      userId: buyer.user.id,
      locationId: centre.id,
      status: 'ready',
    },
  });
  const line = await ledger.db.invoiceLine.create({
    data: {
      invoiceId: invoice.id,
      lotId: lot.id,
      hammerKobo: 100000n,
      premiumKobo: 0n,
      lotFeeKobo: 0n,
      vatKobo: 0n,
      totalKobo: 100000n,
    },
  });
  await service.configure(admin, {
    locationId: centre.id,
    expectedRevision: 0,
    enabled: true,
    dailyKobo: 100000,
    capKobo: 1000000,
    calendar,
    idempotencyKey: randomUUID(),
    reason: 'Enable notified pickup policy',
  });
  await service.ready(admin, {
    lineIds: [line.id],
    idempotencyKey: randomUUID(),
    reason: 'Item physically ready at centre',
  });
  const storage = await ledger.db.pickupStorageCase.findUniqueOrThrow({
    where: { invoiceLineId: line.id },
  });
  return { admin, buyer, centre, line, storage };
}
it('starts fresh grace for existing paid stock and issues one durable notice', async () => {
  const f = await fixture();
  expect(f.storage.dueAt.toISOString()).toBe('2026-11-13T16:00:00.000Z');
  expect(
    (await service.buyerList(f.buyer.user.id, {})).items[0]?.outstandingKobo,
  ).toBe(0);
  await service.ready(f.admin, {
    lineIds: [f.line.id],
    idempotencyKey: randomUUID(),
    reason: 'Retry ready confirmation',
  });
  expect(
    await ledger.db.pickupStorageCase.count({
      where: { invoiceLineId: f.line.id },
    }),
  ).toBe(1);
  expect(
    await ledger.db.notification.count({
      where: { reference: `storage:ready:${f.storage.id}:1` },
    }),
  ).toBe(1);
});
it('requires explicit funded wallet confirmation and charges once under concurrency', async () => {
  const f = await fixture();
  clock = new Date('2026-11-16T10:00:00.000Z');
  const wallet = await ledger.openWallet(f.buyer.user.id);
  await ledger.topup({
    walletId: wallet.id,
    amountKobo: 500000n,
    reference: randomUUID(),
    idempotencyKey: randomUUID(),
  });
  const payment = await service.quote(f.buyer, {
    caseId: f.storage.id,
    method: 'wallet',
    idempotencyKey: randomUUID(),
  });
  expect(payment.storageKobo).toBe(100000);
  expect(payment.feeKobo).toBe(0);
  expect((await ledger.balances(wallet.id)).availableKobo).toBe(500000n);
  const key = randomUUID();
  await Promise.all(
    Array.from({ length: 5 }, () =>
      service.confirm(f.buyer, {
        paymentId: payment.id,
        consent: true,
        idempotencyKey: key,
      }),
    ),
  );
  expect((await ledger.balances(wallet.id)).availableKobo).toBe(400000n);
  expect(
    (
      await ledger.db.pickupStorageCase.findUniqueOrThrow({
        where: { id: f.storage.id },
      })
    ).paidKobo,
  ).toBe(100000n);
});
it('blocks collection while storage is unpaid and stops accrual after authorised handover', async () => {
  const f = await fixture();
  clock = new Date('2026-11-16T10:00:00.000Z');
  await expect(
    ledger.db.$transaction((tx) => service.collectionGate(tx, [f.line.id])),
  ).rejects.toThrow();
  await service.adjust(f.admin, {
    caseId: f.storage.id,
    expectedRevision: 1,
    action: 'waive',
    idempotencyKey: randomUUID(),
    reason: 'Centre closure caused buyer delay',
  });
  await ledger.db.$transaction((tx) => service.collectionGate(tx, [f.line.id]));
  const frozen = await ledger.db.pickupStorageCase.findUniqueOrThrow({
    where: { id: f.storage.id },
  });
  expect(frozen.collectedAt?.toISOString()).toBe(clock.toISOString());
  clock = new Date('2027-01-01T10:00:00.000Z');
  expect(
    (await service.buyerList(f.buyer.user.id, { view: 'collected' })).items[0]
      ?.outstandingKobo,
  ).toBe(0);
});
it('does not grant fee-adjustment powers to ordinary warehouse staff', async () => {
  const f = await fixture(),
    warehouse = await identity('warehouse');
  await expect(
    service.adjust(warehouse, {
      caseId: f.storage.id,
      expectedRevision: 1,
      action: 'waive',
      idempotencyKey: randomUUID(),
      reason: 'Not authorised to waive',
    }),
  ).rejects.toThrow();
  await expect(
    service.buyerList((await identity()).user.id, {}),
  ).resolves.toMatchObject({ items: [] });
});
it('records direct storage receipts without wallet funding and rejects duplicate reference amounts', async () => {
  const ref = 'auction-storage-' + randomUUID();
  const before = await ledger.db.wallet.count();
  const input = {
    reference: ref,
    idempotencyKey: ref,
    amountKobo: 100000,
    suspense: false,
  };
  const first = await ledger.db.$transaction((tx) =>
    ledger.storageReceiptInTransaction(tx, input),
  );
  const second = await ledger.db.$transaction((tx) =>
    ledger.storageReceiptInTransaction(tx, input),
  );
  expect(second).toBe(first);
  expect(await ledger.db.wallet.count()).toBe(before);
  await expect(
    ledger.db.$transaction((tx) =>
      ledger.storageReceiptInTransaction(tx, { ...input, amountKobo: 200000 }),
    ),
  ).rejects.toThrow();
});

async function externalFixture() {
  const f = await fixture();
  clock = new Date('2026-11-16T10:00:00.000Z');
  const payment = await ledger.db.pickupStoragePayment.create({
    data: {
      caseId: f.storage.id,
      userId: f.buyer.user.id,
      requestKey: randomUUID(),
      confirmationKey: randomUUID(),
      caseRevision: 1,
      method: 'bank_transfer',
      storageKobo: 100000n,
      feeKobo: 1500n,
      amountKobo: 101500n,
      providerRef: 'auction-storage-' + randomUUID(),
      expiresAt: new Date(clock.getTime() + 600000),
    },
  });
  const transfer: VerifiedTransfer = {
    reference: payment.providerRef,
    customerCode: 'synthetic',
    amountKobo: 101500,
    feeKobo: 1500,
    currency: 'NGN',
    domain: 'test',
    status: 'success',
    channel: 'bank_transfer',
    customerEmail: f.buyer.user.email ?? undefined,
  };
  return { ...f, payment, transfer };
}
it('settles a verified direct receipt once under duplicate concurrent callbacks without opening a wallet', async () => {
  const f = await externalFixture();
  await Promise.all(
    Array.from({ length: 4 }, () =>
      service.handlePayment(f.transfer, f.payment.providerRef),
    ),
  );
  expect(
    await ledger.db.wallet.findUnique({ where: { userId: f.buyer.user.id } }),
  ).toBeNull();
  expect(
    (
      await ledger.db.pickupStorageCase.findUniqueOrThrow({
        where: { id: f.storage.id },
      })
    ).paidKobo,
  ).toBe(100000n);
  expect((await service.payment(f.buyer.user.id, f.payment.id)).status).toBe(
    'paid',
  );
});
it('quarantines a late verified payment for review without paying storage or crediting a wallet', async () => {
  const f = await externalFixture();
  clock = new Date(clock.getTime() + 600001);
  await service.handlePayment(f.transfer, f.payment.providerRef);
  expect((await service.payment(f.buyer.user.id, f.payment.id)).status).toBe(
    'review',
  );
  expect(
    (
      await ledger.db.pickupStorageCase.findUniqueOrThrow({
        where: { id: f.storage.id },
      })
    ).paidKobo,
  ).toBe(0n);
  expect(
    await ledger.db.pickupStorageException.count({
      where: { caseId: f.storage.id, kind: 'unapplied_provider_payment' },
    }),
  ).toBe(1);
});
it('rejects wrong payer, amount and live-domain callbacks before posting money', async () => {
  const f = await externalFixture();
  for (const changed of [
    { customerEmail: 'another@example.test' },
    { amountKobo: 1 },
    { domain: 'live' },
  ]) {
    await expect(
      service.handlePayment(
        { ...f.transfer, ...changed },
        f.payment.providerRef,
      ),
    ).rejects.toThrow();
  }
  expect((await service.payment(f.buyer.user.id, f.payment.id)).status).toBe(
    'pending',
  );
});
it('does not invalidate payment consent or ready notices when assigning review work', async () => {
  const f = await externalFixture();
  await service.adjust(f.admin, {
    caseId: f.storage.id,
    expectedRevision: 1,
    action: 'assign',
    assignedToId: f.admin.user.id,
    idempotencyKey: randomUUID(),
    reason: 'Assign pickup follow-up',
  });
  await service.handlePayment(f.transfer, f.payment.providerRef);
  expect((await service.payment(f.buyer.user.id, f.payment.id)).status).toBe(
    'paid',
  );
});
it('prevents a waiver racing an active checkout and leaves the amount unchanged', async () => {
  const f = await externalFixture();
  await expect(
    service.adjust(f.admin, {
      caseId: f.storage.id,
      expectedRevision: 1,
      action: 'waive',
      idempotencyKey: randomUUID(),
      reason: 'Requested exceptional waiver',
    }),
  ).rejects.toThrow();
  expect(
    (
      await ledger.db.pickupStorageCase.findUniqueOrThrow({
        where: { id: f.storage.id },
      })
    ).waived,
  ).toBe(false);
});
it('extends collection without silently waiving accrued storage and snapshots future settings', async () => {
  const f = await fixture();
  clock = new Date('2026-11-16T10:00:00.000Z');
  await service.adjust(f.admin, {
    caseId: f.storage.id,
    expectedRevision: 1,
    action: 'extend',
    dueDate: '2026-11-20',
    idempotencyKey: randomUUID(),
    reason: 'Buyer approved later collection',
  });
  await service.configure(f.admin, {
    locationId: f.centre.id,
    expectedRevision: 1,
    enabled: true,
    dailyKobo: 200000,
    capKobo: 2000000,
    calendar,
    idempotencyKey: randomUUID(),
    reason: 'Update future item policy only',
  });
  const row = await ledger.db.pickupStorageCase.findUniqueOrThrow({
    where: { id: f.storage.id },
  });
  expect(service.charge(row).outstandingKobo).toBe(100000);
  expect(row.dailyKobo).toBe(100000n);
  clock = new Date('2026-11-23T10:00:00.000Z');
  expect(service.charge(row).outstandingKobo).toBe(200000);
});
it('queues two reminders on separate working days and does not duplicate them on retry', async () => {
  const f = await fixture();
  clock = new Date('2026-11-11T09:00:00.000Z');
  await service.maintain();
  await service.maintain();
  expect(
    await ledger.db.notification.count({
      where: { reference: `storage:reminder1:${f.storage.id}:1` },
    }),
  ).toBe(1);
  expect(
    await ledger.db.notification.count({
      where: { reference: `storage:reminder2:${f.storage.id}:1` },
    }),
  ).toBe(0);
  clock = new Date('2026-11-12T09:00:00.000Z');
  await service.maintain();
  await service.maintain();
  expect(
    await ledger.db.notification.count({
      where: { reference: `storage:reminder2:${f.storage.id}:1` },
    }),
  ).toBe(1);
});
it('flags ten-working-day review without forfeiting, relisting or charging a wallet', async () => {
  const f = await fixture();
  clock = new Date('2026-11-20T17:00:00.000Z');
  await service.maintain();
  await service.maintain();
  expect(
    await ledger.db.pickupStorageException.count({
      where: { caseId: f.storage.id, kind: 'buyer_contact_required' },
    }),
  ).toBe(1);
  expect(
    await ledger.db.wallet.findUnique({ where: { userId: f.buyer.user.id } }),
  ).toBeNull();
  expect(
    (await ledger.db.lot.findUniqueOrThrow({ where: { id: f.line.lotId } }))
      .status,
  ).toBe('closed');
});
it('rejects insufficient wallet funds without settling or creating a negative balance', async () => {
  const f = await fixture();
  clock = new Date('2026-11-16T10:00:00.000Z');
  const wallet = await ledger.openWallet(f.buyer.user.id);
  const payment = await service.quote(f.buyer, {
    caseId: f.storage.id,
    method: 'wallet',
    idempotencyKey: randomUUID(),
  });
  await expect(
    service.confirm(f.buyer, {
      paymentId: payment.id,
      consent: true,
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toThrow();
  expect((await ledger.balances(wallet.id)).availableKobo).toBe(0n);
  expect((await service.payment(f.buyer.user.id, payment.id)).status).toBe(
    'pending',
  );
});
it('serializes concurrent waiver and wallet payment so they cannot both complete', async () => {
  const f = await fixture();
  clock = new Date('2026-11-16T10:00:00.000Z');
  const wallet = await ledger.openWallet(f.buyer.user.id);
  await ledger.topup({
    walletId: wallet.id,
    amountKobo: 500000n,
    reference: randomUUID(),
    idempotencyKey: randomUUID(),
  });
  const payment = await service.quote(f.buyer, {
    caseId: f.storage.id,
    method: 'wallet',
    idempotencyKey: randomUUID(),
  });
  const results = await Promise.allSettled([
    service.confirm(f.buyer, {
      paymentId: payment.id,
      consent: true,
      idempotencyKey: randomUUID(),
    }),
    service.adjust(f.admin, {
      caseId: f.storage.id,
      expectedRevision: 1,
      action: 'waive',
      reason: 'Requested exceptional storage waiver',
      idempotencyKey: randomUUID(),
    }),
  ]);
  const row = await ledger.db.pickupStorageCase.findUniqueOrThrow({
    where: { id: f.storage.id },
  });
  // A post-payment waiver may waive future charges, but never refunds the settled receipt.
  expect(results[0]?.status).toBe('fulfilled');
  expect(row.paidKobo).toBe(100000n);
  expect((await ledger.balances(wallet.id)).availableKobo).toBe(400000n);
});
it('initializes hosted transfer checkout once with a trusted callback and the disclosed gross amount', async () => {
  const f = await fixture();
  clock = new Date('2026-11-16T10:00:00.000Z');
  const requests: Parameters<PaymentProvider['initializeCard']>[0][] = [];
  const provider: PaymentProvider = {
    initializeCard: async (input) => {
      requests.push(input);
      return {
        authorizationUrl: 'https://checkout.paystack.com/synthetic-storage',
      };
    },
    verifySignature: () => false,
    assignAccount: async () => {},
    getAccount: async () => null,
    verifyTransfer: async () => {
      throw Error('No external request in this test');
    },
    listTransfers: async () => [],
  };
  const checkout = new PickupStorageService(
    ledger,
    staff,
    provider,
    () => clock,
  );
  const quote = await checkout.quote(f.buyer, {
    caseId: f.storage.id,
    method: 'bank_transfer',
    idempotencyKey: randomUUID(),
  });
  const key = randomUUID();
  await checkout.confirm(f.buyer, {
    paymentId: quote.id,
    idempotencyKey: key,
    consent: true,
  });
  await checkout.confirm(f.buyer, {
    paymentId: quote.id,
    idempotencyKey: key,
    consent: true,
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.amountKobo).toBe(quote.amountKobo);
  expect(requests[0]?.channel).toBe('bank_transfer');
  expect(new URL(requests[0]?.callbackUrl ?? '').pathname).toBe(
    '/pickup-storage',
  );
  expect(
    await ledger.db.wallet.findUnique({ where: { userId: f.buyer.user.id } }),
  ).toBeNull();
});
it('keeps an unconfirmed provider payment pending without falsely reporting settlement', async () => {
  const f = await externalFixture();
  const provider: PaymentProvider = {
    initializeCard: async () => {
      throw Error('Not used');
    },
    verifySignature: () => false,
    assignAccount: async () => {},
    getAccount: async () => null,
    verifyTransfer: async () => ({ ...f.transfer, status: 'pending' }),
    listTransfers: async () => [],
  };
  const checkout = new PickupStorageService(
    ledger,
    staff,
    provider,
    () => clock,
  );
  expect((await checkout.verify(f.buyer.user.id, f.payment.id)).status).toBe(
    'pending',
  );
  expect(
    (
      await ledger.db.pickupStorageCase.findUniqueOrThrow({
        where: { id: f.storage.id },
      })
    ).paidKobo,
  ).toBe(0n);
});
