import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { LedgerService } from '../src/ledger/ledger-service';
import { VisitService } from '../src/pickup/visit-service';
import { AuthService } from '../src/auth/auth-service';
import { createApi } from '../src/app';
import { encryptPii, hashPii } from '../src/security/pii';
import {
  profileSchema,
  confirmCollectionSchema,
  prepareVisitPassSchema,
  PICKUP_PASS_TTL_MS,
  collectionHistoryInputSchema,
} from '@auction-ng/shared';
import { createPickupVisitClient } from '../../../packages/api-client/src/pickup-visits';
let ledger: LedgerService,
  service: VisitService,
  staff: string,
  support: string,
  category: string,
  clock: Date;
async function user(role = 'buyer') {
  const email = randomUUID() + '@example.test';
  return ledger.db.user.create({
    data: {
      name: 'Synthetic pickup buyer',
      role,
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
    },
  });
}
beforeAll(async () => {
  const url =
    process.env.PICKUP_TEST_DATABASE_URL ??
    process.env.LEDGER_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated database required');
  ledger = new LedgerService(url);
  service = new VisitService(ledger, () => clock);
  staff = (await user('warehouse')).id;
  support = (await user('support')).id;
  category = (
    await ledger.db.category.create({
      data: { name: 'Synthetic pickup category', slug: randomUUID() },
    })
  ).id;
});
beforeEach(() => {
  clock = new Date();
});
afterAll(async () => {
  await ledger?.close();
});
async function fixture(count = 2, owner?: string, centre?: string) {
  const userId = owner ?? (await user()).id;
  const locationId =
    centre ??
    (
      await ledger.db.location.create({
        data: {
          name: 'Synthetic collection centre',
          code: randomUUID().slice(0, 30),
          address: 'Synthetic address',
          hours: {},
          capacityPerSlot: 20,
        },
      })
    ).id;
  const invoice = await ledger.db.invoice.create({
    data: {
      userId,
      status: 'paid',
      hammerTotalKobo: BigInt(100000 * count),
      premiumKobo: 0n,
      lotFeeKobo: 0n,
      vatKobo: BigInt(7500 * count),
      totalKobo: BigInt(107500 * count),
    },
  });
  const fulfilment = await ledger.db.fulfilment.create({
    data: { invoiceId: invoice.id, userId, locationId, status: 'ready' },
  });
  const lines = [];
  for (let i = 0; i < count; i++) {
    const lot = await ledger.db.lot.create({
      data: {
        title: 'Synthetic item ' + i,
        description: 'Synthetic test fixture',
        condition: 'open_box',
        retailPriceKobo: 200000n,
        startPriceKobo: 50000n,
        categoryId: category,
        locationId,
        startAt: new Date(Date.now() - 60000),
        endAt: new Date(Date.now() + 60000),
        status: 'closed',
      },
    });
    lines.push(
      await ledger.db.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          lotId: lot.id,
          hammerKobo: 100000n,
          premiumKobo: 0n,
          lotFeeKobo: 0n,
          vatKobo: 7500n,
          totalKobo: 107500n,
        },
      }),
    );
  }
  return { userId, locationId, invoice, fulfilment, lines };
}
async function checked(count = 2) {
  const f = await fixture(count),
    pass = await service.prepare(f.userId, f.locationId),
    visit = await service.scan(staff, pass.token);
  return { ...f, pass, visit };
}
const ids = (lines: { id: string }[]) => lines.map((l) => l.id);
it('lists only handed-over items, including partial and legacy pickups, without duplication', async () => {
  const f = await checked(2);
  const first = f.lines[0];
  if (!first) throw Error('Missing fixture');
  await service.collect(staff, f.visit.id, {
    idempotencyKey: randomUUID(),
    lineIds: [first.id],
    finishVisit: false,
  });
  const lot = await ledger.db.lot.findUniqueOrThrow({
    where: { id: first.lotId },
  });
  const page = await service.history(staff, { limit: 10, q: f.invoice.number });
  expect(page.items.map((item) => item.id)).toEqual([first.id]);
  expect(page.items[0]).toMatchObject({
    itemNumber: lot.lotNumber,
    invoiceNumber: f.invoice.number,
    staffName: 'Synthetic pickup buyer',
  });
  expect(JSON.stringify(page)).not.toContain(f.pass.token);
  await ledger.db.fulfilment.update({
    where: { id: f.fulfilment.id },
    data: { status: 'collected', collectedAt: new Date() },
  });
  const legacy = await service.history(staff, {
    limit: 10,
    q: f.invoice.number,
  });
  expect(legacy.items).toHaveLength(2);
  expect(new Set(legacy.items.map((item) => item.id)).size).toBe(2);
  expect(
    legacy.items.find((item) => item.id !== first.id)?.staffName,
  ).toBeNull();
  await expect(
    service.history(support, { limit: 10, q: '' }),
  ).rejects.toThrow();
  await expect(
    service.history(f.userId, { limit: 10, q: '' }),
  ).rejects.toThrow();
});
it('paginates collected items stably and validates history query fields', async () => {
  const f = await checked(3);
  await service.collect(staff, f.visit.id, {
    idempotencyKey: randomUUID(),
    lineIds: ids(f.lines),
    finishVisit: true,
  });
  const first = await service.history(staff, { limit: 2, q: f.invoice.number });
  expect(first.items).toHaveLength(2);
  expect(first.nextCursor).toBeTruthy();
  const second = await service.history(staff, {
    limit: 2,
    q: f.invoice.number,
    cursor: first.nextCursor ?? undefined,
  });
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(
    new Set([...first.items, ...second.items].map((item) => item.id)).size,
  ).toBe(3);
  expect(
    (await service.history(staff, { limit: 10, q: randomUUID() })).items,
  ).toHaveLength(0);
  for (const input of [
    { limit: 51 },
    { cursor: 'bad' },
    { q: 'x'.repeat(121) },
    { extra: true },
  ])
    expect(collectionHistoryInputSchema.safeParse(input).success).toBe(false);
});
it('rejects extra pass fields and repeated collection item IDs', () => {
  expect(
    prepareVisitPassSchema.safeParse({
      locationId: randomUUID(),
      userId: randomUUID(),
    }).success,
  ).toBe(false);
  const id = randomUUID();
  expect(
    confirmCollectionSchema.safeParse({
      idempotencyKey: randomUUID(),
      lineIds: [id, id],
    }).success,
  ).toBe(false);
});
it('prepares one encrypted pass concurrently without registering arrival', async () => {
  const f = await fixture();
  const passes = await Promise.all(
    Array.from({ length: 3 }, () => service.prepare(f.userId, f.locationId)),
  );
  expect(new Set(passes.map((p) => p.token)).size).toBe(1);
  expect(passes[0]?.visit).toBeNull();
  const stored = await ledger.db.pickupVisitPass.findUniqueOrThrow({
    where: {
      userId_locationId: { userId: f.userId, locationId: f.locationId },
    },
  });
  expect(Buffer.from(stored.tokenCiphertext).toString()).not.toContain(
    passes[0]?.token,
  );
  expect(
    await ledger.db.pickupVisit.count({ where: { userId: f.userId } }),
  ).toBe(0);
});
it('uses one visit for multiple orders and repeated token/short-code scans', async () => {
  const f = await fixture();
  await fixture(1, f.userId, f.locationId);
  const pass = await service.prepare(f.userId, f.locationId);
  const visits = await Promise.all([
    service.scan(staff, pass.token),
    service.scan(staff, pass.code),
    service.scan(staff, pass.code),
  ]);
  expect(new Set(visits.map((v) => v.id)).size).toBe(1);
  const visit = visits[0];
  if (!visit) throw Error('Missing visit');
  expect((await service.items(staff, visit.id, 50)).items).toHaveLength(3);
  expect(
    await ledger.db.auditLog.count({
      where: { entityId: visit.id, action: 'pickup.visit.scan' },
    }),
  ).toBe(1);
  expect(
    (
      await ledger.db.fulfilment.findUniqueOrThrow({
        where: { id: f.fulfilment.id },
      })
    ).collectedAt,
  ).toBeNull();
});
it('rejects expired passes and replaced codes; fences pass ownership', async () => {
  const f = await fixture(),
    pass = await service.prepare(f.userId, f.locationId);
  clock = new Date(clock.getTime() + PICKUP_PASS_TTL_MS + 1);
  await expect(service.scan(staff, pass.token)).rejects.toThrow();
  const fresh = await service.prepare(f.userId, f.locationId, true);
  expect(fresh.token).not.toBe(pass.token);
  await expect(service.scan(staff, pass.code)).rejects.toThrow();
  await expect(service.pass((await user()).id, fresh.id)).rejects.toThrow();
  expect((await service.scan(staff, fresh.code)).status).toBe('waiting');
});
it('preserves partial orders and closes the visit only after explicit confirmation', async () => {
  const f = await checked(),
    line = f.lines[0];
  if (!line) throw Error('Missing line');
  await service.collect(staff, f.visit.id, {
    idempotencyKey: randomUUID(),
    lineIds: [line.id],
    finishVisit: true,
  });
  expect(
    (
      await ledger.db.fulfilment.findUniqueOrThrow({
        where: { id: f.fulfilment.id },
      })
    ).collectedAt,
  ).toBeNull();
  expect((await service.items(staff, f.visit.id, 50)).items).toHaveLength(1);
  expect((await service.pass(f.userId, f.pass.id)).visit?.status).toBe(
    'completed',
  );
  expect((await service.centres(f.userId, 10)).items).toHaveLength(1);
  expect(
    (await ledger.db.invoice.findUniqueOrThrow({ where: { id: f.invoice.id } }))
      .totalKobo,
  ).toBe(f.invoice.totalKobo);
});
it('collects remaining items on another visit and removes only fully collected orders', async () => {
  const f = await checked(),
    line = f.lines[0];
  if (!line) throw Error('Missing line');
  await service.collect(staff, f.visit.id, {
    idempotencyKey: randomUUID(),
    lineIds: [line.id],
    finishVisit: true,
  });
  const next = await service.prepare(f.userId, f.locationId, true),
    visit = await service.scan(staff, next.code),
    remaining = await service.items(staff, visit.id, 50);
  await service.collect(staff, visit.id, {
    idempotencyKey: randomUUID(),
    lineIds: ids(remaining.items),
    finishVisit: true,
  });
  expect(
    (
      await ledger.db.fulfilment.findUniqueOrThrow({
        where: { id: f.fulfilment.id },
      })
    ).status,
  ).toBe('collected');
  expect((await service.centres(f.userId, 10)).items).toHaveLength(0);
  expect(
    (await ledger.db.invoice.findUniqueOrThrow({ where: { id: f.invoice.id } }))
      .status,
  ).toBe('paid');
  expect(await ledger.db.wallet.count({ where: { userId: f.userId } })).toBe(0);
});
it('retries concurrent collection confirmation once without duplicate receipts or audit', async () => {
  const f = await checked(),
    input = {
      idempotencyKey: randomUUID(),
      lineIds: ids(f.lines),
      finishVisit: true,
    };
  const receipts = await Promise.all([
    service.collect(staff, f.visit.id, input),
    service.collect(staff, f.visit.id, input),
  ]);
  expect(receipts[0]?.id).toBe(receipts[1]?.id);
  expect(
    await ledger.db.pickupCollectionItem.count({
      where: { receiptId: input.idempotencyKey },
    }),
  ).toBe(2);
  expect(
    await ledger.db.auditLog.count({
      where: { entityId: f.visit.id, action: 'pickup.visit.collect' },
    }),
  ).toBe(1);
});
it('prevents concurrent confirmations from handing over the same item twice', async () => {
  const f = await checked(1);
  const result = await Promise.allSettled([
    service.collect(staff, f.visit.id, {
      idempotencyKey: randomUUID(),
      lineIds: ids(f.lines),
      finishVisit: true,
    }),
    service.collect(staff, f.visit.id, {
      idempotencyKey: randomUUID(),
      lineIds: ids(f.lines),
      finishVisit: true,
    }),
  ]);
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    await ledger.db.pickupCollectionReceipt.count({
      where: { visitId: f.visit.id },
    }),
  ).toBe(1);
});
it('rejects changed confirmation payloads, foreign buyers and foreign centres atomically', async () => {
  const f = await checked(),
    foreign = await fixture(1),
    elsewhere = await fixture(1, f.userId),
    key = randomUUID();
  const first = f.lines[0],
    second = f.lines[1];
  if (!first || !second) throw Error('Missing lines');
  for (const bad of [foreign, elsewhere])
    await expect(
      service.collect(staff, f.visit.id, {
        idempotencyKey: randomUUID(),
        lineIds: [first.id, ...ids(bad.lines)],
        finishVisit: true,
      }),
    ).rejects.toThrow();
  expect(
    await ledger.db.pickupCollectionReceipt.count({
      where: { visitId: f.visit.id },
    }),
  ).toBe(0);
  await service.collect(staff, f.visit.id, {
    idempotencyKey: key,
    lineIds: [first.id],
    finishVisit: false,
  });
  await expect(
    service.collect(staff, f.visit.id, {
      idempotencyKey: key,
      lineIds: [second.id],
      finishVisit: false,
    }),
  ).rejects.toThrow();
  expect((await service.pass(f.userId, f.pass.id)).visit?.status).toBe(
    'waiting',
  );
});
it('rechecks paid status immediately before collection', async () => {
  const f = await checked();
  await ledger.db.invoice.update({
    where: { id: f.invoice.id },
    data: { status: 'pending' },
  });
  await expect(
    service.collect(staff, f.visit.id, {
      idempotencyKey: randomUUID(),
      lineIds: ids(f.lines),
      finishVisit: true,
    }),
  ).rejects.toThrow();
  expect(
    await ledger.db.pickupCollectionReceipt.count({
      where: { visitId: f.visit.id },
    }),
  ).toBe(0);
});
it('supports audited cancellation without collection and rejects unauthorised staff', async () => {
  const f = await checked();
  await expect(service.items(support, f.visit.id, 10)).rejects.toThrow();
  await expect(service.scan(support, f.pass.code)).rejects.toThrow();
  await service.cancel(staff, f.visit.id, 'Buyer left the centre');
  await service.cancel(staff, f.visit.id, 'Buyer left the centre');
  expect(
    await ledger.db.auditLog.count({
      where: { entityId: f.visit.id, action: 'pickup.visit.cancel' },
    }),
  ).toBe(1);
  expect(
    (
      await ledger.db.fulfilment.findUniqueOrThrow({
        where: { id: f.fulfilment.id },
      })
    ).collectedAt,
  ).toBeNull();
  await expect(
    service.collect(staff, f.visit.id, {
      idempotencyKey: randomUUID(),
      lineIds: ids(f.lines),
      finishVisit: true,
    }),
  ).rejects.toThrow();
});
it('paginates item checklists without repeats and supports receipts across orders', async () => {
  const f = await checked(2),
    another = await fixture(1, f.userId, f.locationId),
    page = await service.items(staff, f.visit.id, 1);
  expect(page.nextCursor).not.toBeNull();
  const next = await service.items(
    staff,
    f.visit.id,
    1,
    page.nextCursor ?? undefined,
  );
  expect(next.items[0]?.id).not.toBe(page.items[0]?.id);
  await service.collect(staff, f.visit.id, {
    idempotencyKey: randomUUID(),
    lineIds: [...ids(f.lines), ...ids(another.lines)],
    finishVisit: true,
  });
  expect(
    (
      await ledger.db.fulfilment.findUniqueOrThrow({
        where: { id: another.fulfilment.id },
      })
    ).status,
  ).toBe('collected');
});
it('protects HTTP roles, strictly validates requests and keeps QR secrets out of queues', async () => {
  const f = await fixture(1),
    app = await createApi({
      databaseUrl:
        process.env.PICKUP_TEST_DATABASE_URL ??
        process.env.LEDGER_TEST_DATABASE_URL,
      mode: 'local',
    });
  vi.spyOn(app.get(AuthService), 'authenticate').mockImplementation(
    async (token) => {
      if (!token || !['buyer', 'warehouse', 'support'].includes(token))
        throw new UnauthorizedException();
      return {
        permissions: token === 'warehouse' ? ['pickup.manage'] : [],
        sessionId: randomUUID(),
        user: profileSchema.parse({
          id:
            token === 'buyer'
              ? f.userId
              : token === 'warehouse'
                ? staff
                : support,
          name: 'Synthetic',
          email: 'synthetic@example.test',
          role: token === 'warehouse' ? 'warehouse' : token,
          status: 'active',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          address: null,
          passwordSet: true,
        }),
      };
    },
  );
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl(),
    deviceId = randomUUID(),
    buyer = createPickupVisitClient(url, { accessToken: 'buyer', deviceId }),
    desk = createPickupVisitClient(url, { accessToken: 'warehouse', deviceId });
  try {
    const pass = await buyer.prepare(f.locationId),
      visit = await desk.scan(pass.code),
      queue = await desk.queue();
    expect(JSON.stringify(queue)).not.toContain(pass.token);
    expect(JSON.stringify(queue)).not.toContain(pass.code);
    const itemPage = await desk.items(visit.id);
    expect(itemPage.items).toHaveLength(1);
    const receipt = await desk.collect(visit.id, {
      idempotencyKey: randomUUID(),
      lineIds: ids(itemPage.items),
      finishVisit: true,
    });
    expect(receipt.visitId).toBe(visit.id);
    expect(
      (await desk.history()).items.some((item) => item.id === f.lines[0]?.id),
    ).toBe(true);
    const headers = { Authorization: 'Bearer buyer', 'X-Device-Id': deviceId };
    expect((await fetch(url + '/pickup/visits', { headers })).status).toBe(403);
    expect((await fetch(url + '/pickup/collections', { headers })).status).toBe(
      403,
    );
    expect((await fetch(url + '/pickup/collections')).status).toBe(401);
    expect(
      (
        await fetch(url + '/pickup/collections?limit=51', {
          headers: {
            Authorization: 'Bearer warehouse',
            'X-Device-Id': deviceId,
          },
        })
      ).status,
    ).toBe(400);
    expect((await fetch(url + '/pickup/centres')).status).toBe(401);
    expect(
      (await fetch(url + '/pickup/centres?extra=1', { headers })).status,
    ).toBe(400);
    expect(
      (
        await fetch(url + '/pickup/visit-pass/' + pass.id, { headers })
      ).headers.get('cache-control'),
    ).toBe('no-store');
  } finally {
    await app.close();
  }
});
