import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ArrivalService } from '../src/pickup/arrival-service';
import { LedgerService } from '../src/ledger/ledger-service';
import { AuthService } from '../src/auth/auth-service';
import { encryptPii, hashPii } from '../src/security/pii';
import { createApi } from '../src/app';
import { profileSchema } from '@auction-ng/shared';
import {
  arrivalInputSchema,
  arrivalPageInputSchema,
} from '@auction-ng/shared/pickup-arrival-schemas';
import { createArrivalClient } from '../../../packages/api-client/src/pickup-arrivals';
let ledger: LedgerService,
  service: ArrivalService,
  buyer: string,
  other: string,
  staff: string,
  support: string,
  location: string;
beforeAll(async () => {
  const url =
    process.env.PICKUP_TEST_DATABASE_URL ??
    process.env.LEDGER_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated pickup test database required');
  ledger = new LedgerService(url);
  service = new ArrivalService(ledger);
  buyer = (
    await ledger.db.user.create({
      data: {
        name: 'Synthetic buyer',
        role: 'buyer',
        emailVerifiedAt: new Date(),
        emailHash: hashPii('pickup-fixture@example.test', 'email'),
        emailCiphertext: encryptPii('pickup-fixture@example.test', 'email'),
      },
    })
  ).id;
  other = (
    await ledger.db.user.create({
      data: {
        name: 'Other synthetic buyer',
        role: 'buyer',
        emailHash: hashPii('other-pickup@example.test', 'email'),
        emailCiphertext: encryptPii('other-pickup@example.test', 'email'),
      },
    })
  ).id;
  staff = (
    await ledger.db.user.create({
      data: {
        name: 'Warehouse fixture',
        role: 'warehouse',
        emailHash: hashPii('staff-pickup@example.test', 'email'),
        emailCiphertext: encryptPii('staff-pickup@example.test', 'email'),
      },
    })
  ).id;
  support = (
    await ledger.db.user.create({
      data: {
        name: 'Support fixture',
        role: 'support',
        emailHash: hashPii('support-pickup@example.test', 'email'),
        emailCiphertext: encryptPii('support-pickup@example.test', 'email'),
      },
    })
  ).id;
  location = (
    await ledger.db.location.create({
      data: {
        name: 'Synthetic pickup centre',
        code: randomUUID().slice(0, 30),
        address: 'Synthetic',
        hours: {},
        capacityPerSlot: 20,
      },
    })
  ).id;
});
afterAll(async () => {
  await ledger?.close();
});
async function order(owner = buyer, status = 'paid', collected = false) {
  const invoice = await ledger.db.invoice.create({
    data: {
      userId: owner,
      status,
      hammerTotalKobo: 100000n,
      premiumKobo: 0n,
      lotFeeKobo: 0n,
      vatKobo: 7500n,
      totalKobo: 107500n,
    },
  });
  const fulfilment = await ledger.db.fulfilment.create({
    data: {
      invoiceId: invoice.id,
      userId: owner,
      locationId: location,
      status: collected ? 'collected' : 'ready',
      collectedAt: collected ? new Date() : null,
    },
  });
  return { invoice, fulfilment };
}
it('validates strict arrival fields and bounded cursor pagination', () => {
  expect(
    arrivalInputSchema.safeParse({
      invoiceId: randomUUID(),
      idempotencyKey: randomUUID(),
      userId: buyer,
    }).success,
  ).toBe(false);
  expect(arrivalPageInputSchema.safeParse({ limit: 51 }).success).toBe(false);
  expect(
    arrivalPageInputSchema.safeParse({ cursor: 'arbitrary' }).success,
  ).toBe(false);
});
it('rate-limits arrivals independently from wallet requests and permits staff throughput', async () => {
  const auth = new AuthService({
    databaseUrl:
      process.env.PICKUP_TEST_DATABASE_URL ??
      process.env.LEDGER_TEST_DATABASE_URL,
    mode: 'local',
  });
  const user = randomUUID(),
    ip = `fixture-${randomUUID()}`;
  try {
    for (let i = 0; i < 20; i++) await auth.limitPickupRequests(user, ip);
    await expect(auth.limitPickupRequests(user, ip)).rejects.toThrow();
    await expect(auth.limitPaymentRequests(user, ip)).resolves.toBeUndefined();
    const warehouse = randomUUID();
    for (let i = 0; i < 21; i++)
      await auth.limitPickupRequests(warehouse, ip, true);
  } finally {
    await auth.close();
  }
});
it('records arrival once for concurrent retries without collecting or touching the ledger', async () => {
  const { invoice, fulfilment } = await order(),
    input = { invoiceId: invoice.id, idempotencyKey: randomUUID() };
  const result = await Promise.all(
    Array.from({ length: 4 }, () => service.checkIn(buyer, input)),
  );
  expect(new Set(result.map((r) => r.id)).size).toBe(1);
  expect(result[0]?.status).toBe('waiting');
  expect(
    await ledger.db.pickupArrival.count({
      where: { fulfilmentId: fulfilment.id },
    }),
  ).toBe(1);
  expect(
    (
      await ledger.db.fulfilment.findUniqueOrThrow({
        where: { id: fulfilment.id },
      })
    ).collectedAt,
  ).toBeNull();
  expect(
    (await ledger.db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
      .status,
  ).toBe('paid');
});
it('allows only one active arrival for different concurrent request keys', async () => {
  const { invoice, fulfilment } = await order();
  const result = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      service.checkIn(buyer, {
        invoiceId: invoice.id,
        idempotencyKey: randomUUID(),
      }),
    ),
  );
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    await ledger.db.pickupArrival.count({
      where: { fulfilmentId: fulfilment.id },
    }),
  ).toBe(1);
});
it('rejects another buyer, unpaid, cancelled and collected orders', async () => {
  const own = await order();
  await expect(
    service.checkIn(other, {
      invoiceId: own.invoice.id,
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toThrow();
  for (const [status, collected] of [
    ['pending', false],
    ['cancelled', false],
    ['paid', true],
  ] as const) {
    const row = await order(buyer, status, collected);
    await expect(
      service.checkIn(buyer, {
        invoiceId: row.invoice.id,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();
  }
});
it('binds retry keys to one order and checks ownership of cursors', async () => {
  const a = await order(),
    b = await order(),
    key = randomUUID();
  const first = await service.checkIn(buyer, {
    invoiceId: a.invoice.id,
    idempotencyKey: key,
  });
  await expect(
    service.checkIn(buyer, { invoiceId: b.invoice.id, idempotencyKey: key }),
  ).rejects.toThrow();
  await expect(service.list(other, 10, first.id)).rejects.toThrow();
  const page = await service.list(buyer, 1);
  expect(page.items).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  const next = await service.list(buyer, 1, page.nextCursor ?? undefined);
  expect(next.items[0]?.id).not.toBe(page.items[0]?.id);
});
it('audits staff transitions, exact retries and closure without changing collection', async () => {
  const { invoice, fulfilment } = await order();
  const arrival = await service.checkIn(buyer, {
    invoiceId: invoice.id,
    idempotencyKey: randomUUID(),
  });
  await expect(
    service.update(support, arrival.id, {
      status: 'acknowledged',
      expectedStatus: 'waiting',
    }),
  ).rejects.toThrow();
  await expect(
    service.update(staff, arrival.id, {
      status: 'closed',
      expectedStatus: 'waiting',
    }),
  ).rejects.toThrow();
  await Promise.all([
    service.update(staff, arrival.id, {
      status: 'acknowledged',
      expectedStatus: 'waiting',
    }),
    service.update(staff, arrival.id, {
      status: 'acknowledged',
      expectedStatus: 'waiting',
    }),
  ]);
  expect(
    await ledger.db.auditLog.count({ where: { entityId: arrival.id } }),
  ).toBe(1);
  await service.update(staff, arrival.id, {
    status: 'closed',
    expectedStatus: 'acknowledged',
  });
  expect(
    await ledger.db.auditLog.count({ where: { entityId: arrival.id } }),
  ).toBe(2);
  expect(
    (await service.list(buyer, 50)).items.some((r) => r.id === arrival.id),
  ).toBe(false);
  expect(
    (
      await ledger.db.fulfilment.findUniqueOrThrow({
        where: { id: fulfilment.id },
      })
    ).collectedAt,
  ).toBeNull();
  const again = await service.checkIn(buyer, {
    invoiceId: invoice.id,
    idempotencyKey: randomUUID(),
  });
  expect(again.id).not.toBe(arrival.id);
});
it('removes arrivals from active views when the order is collected elsewhere', async () => {
  const { invoice, fulfilment } = await order();
  const a = await service.checkIn(buyer, {
    invoiceId: invoice.id,
    idempotencyKey: randomUUID(),
  });
  await ledger.db.fulfilment.update({
    where: { id: fulfilment.id },
    data: { status: 'collected', collectedAt: new Date() },
  });
  expect((await service.list(buyer, 50)).items.some((r) => r.id === a.id)).toBe(
    false,
  );
});
it('protects HTTP ownership and staff roles, documents routes and supports the typed client', async () => {
  const app = await createApi({
    databaseUrl:
      process.env.PICKUP_TEST_DATABASE_URL ??
      process.env.LEDGER_TEST_DATABASE_URL,
    mode: 'local',
  });
  const auth = app.get(AuthService);
  vi.spyOn(auth, 'authenticate').mockImplementation(async (token) => {
    if (!token || !['buyer', 'other', 'staff', 'support'].includes(token))
      throw new UnauthorizedException();
    const id =
      token === 'buyer'
        ? buyer
        : token === 'other'
          ? other
          : token === 'staff'
            ? staff
            : support;
    return {
      sessionId: randomUUID(),
      user: profileSchema.parse({
        id,
        name: 'Synthetic',
        email: 'synthetic@example.test',
        role:
          token === 'staff'
            ? 'warehouse'
            : token === 'support'
              ? 'support'
              : 'buyer',
        status: 'active',
        emailVerified: true,
        phone: null,
        phoneVerified: false,
        address: null,
        passwordSet: true,
      }),
    };
  });
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl(),
    deviceId = randomUUID();
  try {
    const client = createArrivalClient(url, { accessToken: 'buyer', deviceId }),
      row = await order();
    const arrival = await client.checkIn({
      invoiceId: row.invoice.id,
      idempotencyKey: randomUUID(),
    });
    expect(arrival.status).toBe('waiting');
    const headers = { Authorization: 'Bearer buyer', 'X-Device-Id': deviceId };
    expect(
      (await fetch(url + '/pickup/staff/arrivals', { headers })).status,
    ).toBe(403);
    expect((await fetch(url + '/pickup/arrivals')).status).toBe(401);
    expect(
      (
        await createArrivalClient(url, { accessToken: 'staff', deviceId }).list(
          true,
        )
      ).items.length,
    ).toBeGreaterThan(0);
    expect(
      (await fetch(url + '/pickup/arrivals?unknown=x', { headers })).status,
    ).toBe(400);
  } finally {
    await app.close();
  }
});
