import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  calculateInvoiceLine,
  companyDetailsSchema,
  invoiceListPageSchema,
  invoicePickupViewSchema,
  invoiceResultSchema,
  invoiceViewSchema,
} from '@auction-ng/shared';
import { createApi } from '../src/app';
import { recalculateQueued } from '../src/batches/batch-recalc';
import { invoicePdf, receiptPdf } from '../src/invoices/invoice-pdf';
import { InvoiceService } from '../src/invoices/invoice-service';
import { storageCaseCharge } from '../src/pickup/storage-collection';
import { LedgerService } from '../src/ledger/ledger-service';
import { encryptPii, hashPii } from '../src/security/pii';

// Invoices: every role, refunds asked for by one person and approved by
// another, exact wallet credits, PDFs and receipts.
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
let buyer: Who;
let walletId = '';
let categoryId = '';
let locationId = '';
const unique = () => randomUUID().slice(0, 8);

beforeAll(async () => {
  const url = process.env.INVOICES_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !url ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated invoices database required.');
  app = await createApi({
    databaseUrl: url,
    mode: 'local',
    origins: ['http://localhost:3301'],
    emailProvider: { async sendCode() {} },
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  ledger = new LedgerService(url);
  for (const role of roles) people[role] = await person(role);
  buyer = await person('buyer');
  walletId = (await ledger.openWallet(buyer.userId)).id;
  await ledger.topup({
    walletId,
    amountKobo: 900_000_000n,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  categoryId = (
    await ledger.db.category.create({
      data: { name: `Kitchen ${unique()}`, slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        code: randomUUID().slice(0, 30),
        name: `Ikeja hub ${unique()}`,
        address: '14 Oba Akran Avenue',
        hours: {},
        capacityPerSlot: 20,
      },
    })
  ).id;
});
afterAll(async () => {
  await ledger?.close();
  await app?.close();
});

async function person(role: string): Promise<Who> {
  const email = `${randomUUID()}@example.test`;
  const phone = `+234803${randomInt(1000000, 9999999)}`;
  const token = randomBytes(32).toString('base64url');
  const device = randomUUID();
  const user = await ledger.db.user.create({
    data: {
      name: role === 'buyer' ? `Chiamaka Obi ${unique()}` : `Test ${role}`,
      role,
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      phoneHash: hashPii(phone, 'phone'),
      phoneCiphertext: encryptPii(phone, 'phone'),
      emailVerifiedAt: new Date(),
      ...(role === 'buyer'
        ? {}
        : {
            staffCredential: {
              create: { passwordHash: 'synthetic-not-a-login' },
            },
          }),
    },
  });
  await ledger.db.authSession.create({
    data: {
      userId: user.id,
      client: 'web',
      ...(role === 'buyer' ? { buyerMfa: true } : { staffAuthenticated: true }),
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
async function call(who: Who, path: string, body?: unknown) {
  const response = await fetch(`${base}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${who.token}`,
      'X-Device-Id': who.device,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // PDFs aren't JSON.
  }
  return { status: response.status, json, text };
}
async function ok<T>(
  shape: { parse(value: unknown): T },
  who: Who,
  path: string,
  body?: unknown,
) {
  const r = await call(who, 'admin/invoices' + path, body);
  if (r.status !== 200) throw new Error(`${path} -> ${r.status} ${r.text}`);
  return shape.parse(r.json);
}
const available = async () =>
  Number((await ledger.balances(walletId)).availableKobo);
/** A won, paid and prepared invoice, with a real wallet charge. */
async function invoice(
  hammer = 950_000,
  batchId: string | null = null,
  holds = 0,
) {
  const lot = await ledger.db.lot.create({
    data: {
      title: `Binatone blender ${unique()}`,
      description: 'Synthetic',
      condition: 'open_box',
      retailPriceKobo: 4_000_000n,
      startPriceKobo: 100_000n,
      status: 'closed',
      startAt: new Date(Date.now() - 7_200_000),
      endAt: new Date(Date.now() - 3_600_000),
      categoryId,
      locationId,
      batchId,
    },
  });
  const line = calculateInvoiceLine(hammer);
  const amounts = {
    premiumKobo: BigInt(line.premiumKobo),
    lotFeeKobo: BigInt(line.lotFeeKobo),
    vatKobo: BigInt(line.vatKobo),
    totalKobo: BigInt(line.totalKobo),
  };
  if (!holds)
    await ledger.debit({
      walletId,
      amountKobo: BigInt(line.totalKobo),
      idempotencyKey: `settlement:debit:${lot.id}`,
      reference: `settlement:debit:${lot.id}`,
    });
  // A winner who raised their bid pays through one charge per raise.
  for (let i = 0; i < holds; i++) {
    const each = Math.floor(line.totalKobo / holds);
    await ledger.debit({
      walletId,
      amountKobo: BigInt(i === 0 ? line.totalKobo - each * (holds - 1) : each),
      idempotencyKey: `settlement:${lot.id}:${i}`,
      reference: `settlement:${lot.id}:${i}`,
    });
  }
  const row = await ledger.db.invoice.create({
    data: {
      userId: buyer.userId,
      status: 'paid',
      hammerTotalKobo: BigInt(line.hammerKobo),
      ...amounts,
      lines: {
        create: {
          lotId: lot.id,
          hammerKobo: BigInt(line.hammerKobo),
          ...amounts,
        },
      },
    },
    include: { lines: true },
  });
  await ledger.db.fulfilment.create({
    data: {
      invoiceId: row.id,
      userId: buyer.userId,
      locationId,
      qrTokenHash: randomUUID(),
      qrTokenCiphertext: encryptPii('synthetic', 'pickup-pass'),
    },
  });
  const first = row.lines[0];
  if (!first) throw new Error('No line.');
  return { ...row, line: first, total: line.totalKobo, lotId: lot.id };
}
type Invoice = Awaited<ReturnType<typeof invoice>>;
const refundBody = (inv: Invoice, amountKobo: number) => ({
  idempotencyKey: randomUUID(),
  invoiceId: inv.id,
  reason: 'damaged',
  note: 'Jug is cracked',
  lines: [{ lineId: inv.line.id, amountKobo }],
});
const decision = (
  requestId: string,
  approve = true,
  step: 'manager' | 'admin' = 'admin',
) => ({
  idempotencyKey: randomUUID(),
  requestId,
  approve,
  step,
  note: 'Checked the photos',
});
const request = async (who: Who, inv: Invoice, amount: number) => {
  const body = refundBody(inv, amount);
  await ok(invoiceResultSchema, who, '/refunds', body);
  return body.idempotencyKey;
};
/** The first of the two approvals. */
const first = (id: string, who = people.manager) =>
  ok(
    invoiceResultSchema,
    who,
    '/refunds/decide',
    decision(id, true, 'manager'),
  );

describe('reading invoices', () => {
  it('lists, searches by number, name and full phone, and counts tabs', async () => {
    const inv = await invoice();
    await invoice();
    const user = await ledger.db.user.findUniqueOrThrow({
      where: { id: buyer.userId },
    });
    const list = (q: string) =>
      ok(invoiceListPageSchema, people.finance, '?' + q);
    expect((await list(`search=${inv.number}`)).items).toHaveLength(1);
    expect(
      (await list(`search=${encodeURIComponent(user.name)}`)).items.length,
    ).toBeGreaterThan(0);
    const { decryptPii } = await import('../src/security/pii');
    const phone = decryptPii(Buffer.from(user.phoneCiphertext ?? []), 'phone');
    const found = await list(`search=0${phone.slice(4)}`);
    expect(found.items.length).toBeGreaterThan(0);
    // Only a masked phone leaves the list.
    expect(found.items[0]?.phone).toBe(`0803 ••• ${phone.slice(-4)}`);
    const row = (await list(`search=${inv.number}`)).items[0];
    expect(row).toMatchObject({
      payment: 'paid',
      pickup: 'preparing',
      totalKobo: inv.total,
    });
    expect(
      (await list('tab=not_collected')).counts.not_collected,
    ).toBeGreaterThan(0);
    expect((await call(people.finance, 'admin/invoices?limit=51')).status).toBe(
      400,
    );
    // Collected has its own tab and status.
    await ledger.db.fulfilment.update({
      where: { invoiceId: inv.id },
      data: { status: 'collected', collectedAt: new Date() },
    });
    for (const q of ['tab=collected', 'pickup=collected']) {
      const page = await list(q);
      expect(page.items.map((i) => i.number)).toContain(inv.number);
      expect(page.items.every((i) => i.pickup === 'collected')).toBe(true);
      expect(page.counts.collected).toBeGreaterThan(0);
    }
    for (const state of ['preparing', 'ready', 'overdue', 'cancelled'] as const)
      expect(
        (await list(`pickup=${state}`)).items.every((i) => i.pickup === state),
      ).toBe(true);
    const first = await list('limit=1');
    expect(first.nextCursor).not.toBeNull();
  });

  it('shows one invoice with its payment, buyer and timeline', async () => {
    const inv = await invoice();
    const view = await ok(invoiceViewSchema, people.support, `/${inv.number}`);
    expect(view).toMatchObject({
      payment: 'paid',
      totalKobo: inv.total,
      paidKobo: inv.total,
      balanceKobo: 0,
      refundBlocked: null,
    });
    expect(view.payments).toEqual([
      expect.objectContaining({ amountKobo: -inv.total }),
    ]);
    expect(view.paidAt).not.toBeNull();
    expect(view.buyer.phone).toMatch(/^0803\d{7}$/);
    expect(view.access).toMatchObject({
      canRequestRefund: true,
    });
    expect((await call(people.admin, 'admin/invoices/INV-NOPE')).status).toBe(
      404,
    );
  });

  it('gives warehouse the pickup without money, and intake nothing', async () => {
    const inv = await invoice();
    const r = await call(
      people.warehouse,
      `admin/invoices/${inv.number}/pickup`,
    );
    expect(r.status).toBe(200);
    invoicePickupViewSchema.parse(r.json);
    expect(r.text).not.toMatch(/kobo/i);
    for (const path of ['', `/${inv.number}`, `/${inv.number}/pdf`, '/export'])
      for (const role of ['warehouse', 'intake'] as const)
        expect([
          path,
          (await call(people[role], 'admin/invoices' + path)).status,
        ]).toEqual([path, 403]);
    expect(
      (await call(people.intake, `admin/invoices/${inv.number}/pickup`)).status,
    ).toBe(403);
  });
});

describe('refunds', () => {
  it('pay part back to the wallet, once, and keep the pickup', async () => {
    const supplier = await ledger.db.supplier.create({
      data: { name: `S ${unique()}`, type: 'retailer' },
    });
    const batch = await ledger.db.batch.create({
      data: {
        name: 'B',
        supplierId: supplier.id,
        locationId,
        boughtOn: new Date(),
        receivedOn: new Date(),
        status: 'received',
        itemsExpected: 1,
        costSupplierKobo: 500_000n,
      },
    });
    const inv = await invoice(950_000, batch.id);
    const before = await available();
    const body = refundBody(inv, 500_000);
    await ok(invoiceResultSchema, people.support, '/refunds', body);
    // An exact retry asks once.
    await ok(invoiceResultSchema, people.support, '/refunds', body);
    expect(
      await ledger.db.refundRequest.count({ where: { invoiceId: inv.id } }),
    ).toBe(1);
    expect(await available()).toBe(before);
    expect(
      (await ok(invoiceViewSchema, people.finance, `/${inv.number}`)).payment,
    ).toBe('refund_pending');
    const approve = decision(body.idempotencyKey);
    // The admin waits for the manager, and no money moves on the first yes.
    expect(
      (await call(people.admin, 'admin/invoices/refunds/decide', approve))
        .status,
    ).toBe(403);
    await first(body.idempotencyKey);
    expect(await available()).toBe(before);
    await ok(invoiceResultSchema, people.admin, '/refunds/decide', approve);
    await ok(invoiceResultSchema, people.admin, '/refunds/decide', approve);
    expect(await available()).toBe(before + 500_000);
    const view = await ok(invoiceViewSchema, people.finance, `/${inv.number}`);
    expect(view).toMatchObject({
      payment: 'partly_refunded',
      refundedKobo: 500_000,
      pickup: { state: 'preparing' },
    });
    expect(view.payments.map((p) => p.amountKobo)).toEqual([
      -inv.total,
      500_000,
    ]);
    // Batch money back loses exactly the hammer and premium returned.
    await recalculateQueued(ledger.db);
    const row = await ledger.db.invoiceLine.findUniqueOrThrow({
      where: { id: inv.line.id },
    });
    const stats = await ledger.db.batchStats.findUniqueOrThrow({
      where: { batchId: batch.id },
    });
    expect(stats.moneyBackKobo).toBe(
      row.hammerKobo +
        row.premiumKobo -
        row.refundedHammerKobo -
        row.refundedPremiumKobo,
    );
    // The rest makes it a full refund, which cancels the pickup.
    const rest = await request(people.support, inv, inv.total - 500_000);
    await first(rest);
    await ok(
      invoiceResultSchema,
      people.admin,
      '/refunds/decide',
      decision(rest),
    );
    expect(await available()).toBe(before + inv.total);
    expect(
      await ok(invoiceViewSchema, people.finance, `/${inv.number}`),
    ).toMatchObject({ payment: 'refunded', pickup: { state: 'cancelled' } });
    expect(
      (await app.get(InvoiceService).mismatches()).mismatches,
    ).not.toContain(inv.number);
  });

  it('need a manager, then an admin, who are never the same person', async () => {
    const inv = await invoice();
    const decide = async (who: Who, id: string, step: 'manager' | 'admin') =>
      (
        await call(
          who,
          'admin/invoices/refunds/decide',
          decision(id, true, step),
        )
      ).status;
    const id = await request(people.support, inv, 1_000);
    // Not support or finance, and not an admin first.
    for (const who of [people.support, people.finance, people.admin])
      for (const step of ['manager', 'admin'] as const)
        expect(await decide(who, id, step)).toBe(403);
    const other = await person('manager');
    const view = await ok(invoiceViewSchema, other, `/${inv.number}`);
    expect(view.refunds[0]).toMatchObject({
      step: 'manager',
      canApprove: true,
    });
    // An approval for a step they were not shown is refused.
    expect(await decide(other, id, 'admin')).toBe(409);
    expect(await decide(other, id, 'manager')).toBe(200);
    // The first approver can't also be the second.
    expect(await decide(other, id, 'admin')).toBe(403);
    const set = (data: object) =>
      ledger.db.refundRequest.update({ where: { id }, data });
    const done = { status: 'approved', decidedAt: new Date() };
    await expect(set({ ...done, decidedById: other.userId })).rejects.toThrow();
    await expect(
      set({ firstApprovedById: people.finance.userId }),
    ).rejects.toThrow();
    const waiting = await ok(
      invoiceListPageSchema,
      people.finance,
      '?tab=refund_pending&from=2020-01-01&to=2020-01-02',
    );
    expect(waiting.items.map((i) => i.number)).toContain(inv.number);
    const before = await available();
    expect(await decide(people.admin, id, 'admin')).toBe(200);
    expect(await available()).toBe(before + 1_000);
    const after = await ok(invoiceViewSchema, people.admin, `/${inv.number}`);
    expect(after.refunds[0]).toMatchObject({
      status: 'approved',
      firstApprovedBy: 'Test manager',
      decidedBy: 'Test admin',
    });
    // A manager's own request counts as theirs: only an admin is left.
    const byManager = await request(people.manager, inv, 1_000);
    expect(await decide(people.manager, byManager, 'admin')).toBe(403);
    expect(await available()).toBe(before + 1_000);
    expect(await decide(people.admin, byManager, 'admin')).toBe(200);
    // An admin may ask and finish, with a manager in between, never alone.
    const byAdmin = await request(people.admin, inv, 1_000);
    expect(await decide(people.admin, byAdmin, 'manager')).toBe(403);
    expect(await decide(people.admin, byAdmin, 'admin')).toBe(403);
    expect(await available()).toBe(before + 2_000);
    expect(await decide(people.manager, byAdmin, 'manager')).toBe(200);
    expect(await decide(people.admin, byAdmin, 'admin')).toBe(200);
    expect(await available()).toBe(before + 3_000);
    // Either can say no at their turn, and no money moves.
    const no = await request(people.support, inv, 1_000);
    await ok(
      invoiceResultSchema,
      people.manager,
      '/refunds/decide',
      decision(no, false, 'manager'),
    );
    expect(await available()).toBe(before + 3_000);
  });

  it('stop storage when the whole invoice is refunded', async () => {
    const make = async () => {
      const inv = await invoice();
      const at = new Date(Date.now() - 40 * 86_400_000);
      const item = await ledger.db.pickupStorageCase.create({
        data: {
          invoiceLineId: inv.line.id,
          userId: buyer.userId,
          locationId,
          dailyKobo: 100_000n,
          capKobo: 1_000_000n,
          calendar: {
            weekdays: [1, 2, 3, 4, 5],
            closedDates: [],
            opensMinute: 540,
            closesMinute: 1020,
          },
          policyRevision: 1,
          readyAt: at,
          notifiedAt: at,
          originalDueAt: at,
          dueAt: at,
          reviewAt: at,
          reminderOneAt: at,
          reminderTwoAt: at,
        },
      });
      const payment = await ledger.db.pickupStoragePayment.create({
        data: {
          caseId: item.id,
          userId: buyer.userId,
          requestKey: randomUUID(),
          caseRevision: 1,
          method: 'wallet',
          storageKobo: 100_000n,
          feeKobo: 0n,
          amountKobo: 100_000n,
          providerRef: randomUUID(),
          expiresAt: new Date(Date.now() + 600_000),
        },
      });
      return { inv, item, payment };
    };
    const refund = async (
      m: Awaited<ReturnType<typeof make>>,
      kobo: number,
    ) => {
      const id = await request(people.support, m.inv, kobo);
      await first(id);
      await ok(
        invoiceResultSchema,
        people.admin,
        '/refunds/decide',
        decision(id),
      );
      return {
        item: await ledger.db.pickupStorageCase.findUniqueOrThrow({
          where: { id: m.item.id },
        }),
        payment: await ledger.db.pickupStoragePayment.findUniqueOrThrow({
          where: { id: m.payment.id },
        }),
      };
    };
    const part = await make();
    // A part refund keeps the item, so storage goes on.
    expect(await refund(part, 1_000)).toMatchObject({
      item: { waived: false },
      payment: { status: 'pending' },
    });
    const full = await make();
    const after = await refund(full, full.inv.total);
    expect(after).toMatchObject({
      item: { waived: true, termsRevision: 2 },
      payment: { status: 'cancelled' },
    });
    expect(storageCaseCharge(after.item, new Date()).outstandingKobo).toBe(0);
  });

  it('never refund more than was paid, or twice at once', async () => {
    const inv = await invoice();
    expect(
      (
        await call(
          people.support,
          'admin/invoices/refunds',
          refundBody(inv, inv.total + 1),
        )
      ).json,
    ).toMatchObject({ field: 'lines' });
    const id = await request(people.support, inv, inv.total);
    expect(
      (await call(people.support, 'admin/invoices/refunds', refundBody(inv, 1)))
        .status,
    ).toBe(409);
    const before = await available();
    const admins = [people.admin, await person('admin'), await person('admin')];
    await first(id);
    const results = await Promise.all(
      admins.map((who) =>
        call(who, 'admin/invoices/refunds/decide', decision(id)),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await available()).toBe(before + inv.total);
  });

  it('cross the several charges of a raised bid', async () => {
    const inv = await invoice(950_000, null, 3);
    const before = await available();
    const part = Math.ceil(inv.total / 2);
    for (const amount of [part, inv.total - part]) {
      const id = await request(people.support, inv, amount);
      await first(id);
      const body = decision(id);
      const sent = await Promise.all(
        Array.from({ length: 3 }, () =>
          call(people.admin, 'admin/invoices/refunds/decide', body),
        ),
      );
      // Overlapping sends of one approval all get the same answer.
      expect(sent.map((r) => r.status)).toEqual([200, 200, 200]);
    }
    expect(await available()).toBe(before + inv.total);
    const view = await ok(invoiceViewSchema, people.admin, `/${inv.number}`);
    expect(view).toMatchObject({ payment: 'refunded', balanceKobo: 0 });
  });

  it('are refused once collected, even if asked for before', async () => {
    const inv = await invoice();
    const id = await request(people.support, inv, 5_000);
    await first(id);
    await ledger.db.fulfilment.update({
      where: { invoiceId: inv.id },
      data: { status: 'collected', collectedAt: new Date() },
    });
    const before = await available();
    const r = await call(
      people.admin,
      'admin/invoices/refunds/decide',
      decision(id),
    );
    expect(r.status).toBe(409);
    expect(r.text).toContain('Collected');
    expect(await available()).toBe(before);
  });

  it('need the right permission, which an admin can give', async () => {
    const inv = await invoice();
    for (const role of ['intake', 'warehouse'] as const)
      expect(
        (await call(people[role], 'admin/invoices/refunds', refundBody(inv, 1)))
          .status,
      ).toBe(403);
    const id = await request(people.support, inv, 1_000);
    expect(
      (
        await call(
          people.support,
          'admin/invoices/refunds/decide',
          decision(id),
        )
      ).status,
    ).toBe(403);
    const role = await ledger.db.staffRole.create({
      data: {
        name: `Refunds ${unique()}`,
        key: randomUUID(),
        permissions: ['invoices.read', 'refunds.manage'],
      },
    });
    const who = await person('warehouse');
    await ledger.db.staffMembership.create({
      data: { userId: who.userId, roleId: role.id },
    });
    await first(id, who);
  });
});

describe('notes, resend, disputes and company', () => {
  it('adds internal notes and limits resending to 3 an hour', async () => {
    const inv = await invoice();
    await ok(invoiceResultSchema, people.support, '/notes', {
      idempotencyKey: randomUUID(),
      invoiceId: inv.id,
      body: 'Buyer called about the jug',
    });
    const send = () =>
      call(people.support, 'admin/invoices/resend', {
        idempotencyKey: randomUUID(),
        invoiceId: inv.id,
      });
    for (let i = 0; i < 3; i++) expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
    const view = await ok(invoiceViewSchema, people.admin, `/${inv.number}`);
    expect(view.notes[0]?.body).toBe('Buyer called about the jug');
    expect(view.messages).toHaveLength(3);
    const stored = await ledger.db.invoiceNote.findFirstOrThrow({
      where: { invoiceId: inv.id },
    });
    expect(Buffer.from(stored.bodyCiphertext).toString()).not.toContain('jug');
  });

  it('opens one dispute as a support ticket', async () => {
    const inv = await invoice();
    const body = {
      idempotencyKey: randomUUID(),
      invoiceId: inv.id,
      message: 'The jug on this blender is cracked.',
    };
    expect(
      (await call(people.finance, 'admin/invoices/disputes', body)).status,
    ).toBe(403);
    await ok(invoiceResultSchema, people.support, '/disputes', body);
    await ok(invoiceResultSchema, people.support, '/disputes', body);
    const view = await ok(invoiceViewSchema, people.admin, `/${inv.number}`);
    expect(view.payment).toBe('disputed');
    expect(view.disputes).toHaveLength(1);
    expect(
      (
        await call(people.support, 'admin/invoices/disputes', {
          ...body,
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe(409);
  });

  it('keeps company details to people who manage them', async () => {
    expect((await call(people.manager, 'admin/invoices/company')).status).toBe(
      403,
    );
    const r = await call(people.admin, 'admin/invoices/company');
    const details = companyDetailsSchema.parse(
      (r.json as { details: unknown }).details,
    );
    expect(details).toMatchObject({ name: 'GiddyDeal', rcNumber: '' });
    const save = (expectedRevision: number) =>
      call(people.admin, 'admin/invoices/company', {
        idempotencyKey: randomUUID(),
        details: { ...details, rcNumber: '1234567' },
        expectedRevision,
      });
    const revision = (r.json as { revision: number }).revision;
    expect((await save(revision)).status).toBe(200);
    expect((await save(revision)).status).toBe(409);
  });
});

describe('PDF', () => {
  const text = async (pdf: Promise<Buffer>) => {
    const content = await pdf;
    expect(content.subarray(0, 5).toString()).toBe('%PDF-');
    return {
      content,
      pages: (content.toString('latin1').match(/\/Type \/Page\b/g) ?? [])
        .length,
    };
  };
  const company = companyDetailsSchema.parse({ name: 'GiddyDeal' });
  const line = calculateInvoiceLine(950_000);
  const data = (lines: number, stamp: 'PAID' | 'REFUNDED' | 'PROCESSING') => ({
    number: 'INV-TEST1234',
    status: stamp === 'REFUNDED' ? 'refunded' : 'paid',
    stamp,
    fixedPrice: false,
    issuedAt: new Date(),
    paidAt: new Date(),
    buyer: {
      name: 'Chiamaka Obi',
      phone: '08035554417',
      email: 'c@example.test',
    },
    pickup: {
      name: 'Ikeja hub',
      address: '14 Oba Akran Avenue',
      dueAt: new Date(),
      dailyKobo: 100_000,
      collectedAt: null,
      open: stamp !== 'REFUNDED',
    },
    premiumBps: 1500,
    vatBps: 750,
    lines: Array.from({ length: lines }, (_, i) => ({
      title: `Item ${i + 1}`,
      lotNumber: `LOT-${i}`,
      ...line,
    })),
    hammerKobo: line.hammerKobo * lines,
    premiumKobo: line.premiumKobo * lines,
    lotFeeKobo: line.lotFeeKobo * lines,
    vatKobo: line.vatKobo * lines,
    totalKobo: line.totalKobo * lines,
    paidKobo: stamp === 'PROCESSING' ? 0 : line.totalKobo * lines,
    refunds:
      stamp === 'REFUNDED'
        ? [{ at: new Date(), amountKobo: line.totalKobo * lines }]
        : [],
  });
  it('fits one lot on one page and thirty on two', async () => {
    expect((await text(invoicePdf(data(1, 'PAID'), company))).pages).toBe(1);
    expect((await text(invoicePdf(data(30, 'PAID'), company))).pages).toBe(2);
    for (const stamp of ['REFUNDED', 'PROCESSING'] as const)
      expect((await text(invoicePdf(data(1, stamp), company))).pages).toBe(1);
  });
  it('makes a combined receipt', async () => {
    const r = await text(
      receiptPdf(
        {
          buyer: { name: 'Chiamaka Obi', email: null },
          from: new Date(),
          to: new Date(),
          invoices: Array.from({ length: 40 }, (_, i) => ({
            number: `INV-${i}`,
            paidAt: new Date(),
            items: `Item ${i}`,
            hammerKobo: 1000,
            feesKobo: 200,
            totalKobo: 1200,
            refundedKobo: i % 2 ? 100 : 0,
          })),
        },
        company,
      ),
    );
    expect(r.pages).toBeGreaterThan(1);
  });
  it('downloads for staff and the owner only', async () => {
    const inv = await invoice();
    const staff = await call(
      people.support,
      `admin/invoices/${inv.number}/pdf`,
    );
    expect(staff.status).toBe(200);
    expect(staff.text.startsWith('%PDF')).toBe(true);
    const mine = await call(buyer, `buyers/invoices/${inv.id}/pdf`);
    expect(mine.status).toBe(200);
    const other = await person('buyer');
    expect((await call(other, `buyers/invoices/${inv.id}/pdf`)).status).toBe(
      404,
    );
    expect(
      (await call(other, `buyers/invoices/${inv.id}/refunds`)).status,
    ).toBe(404);
    const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
    expect(
      (
        await call(buyer, `buyers/receipt?from=${today}&to=${today}`)
      ).text.startsWith('%PDF'),
    ).toBe(true);
    expect(
      (await call(other, `buyers/receipt?from=${today}&to=${today}`)).status,
    ).toBe(404);
    expect(
      (
        await call(
          people.support,
          `admin/invoices/${inv.number}/receipt?from=${today}&to=${today}`,
        )
      ).status,
    ).toBe(200);
  });
});
