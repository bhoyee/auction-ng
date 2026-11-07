import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { OverviewMaintenance } from '../src/staff-admin/overview-maintenance';
import { readAggregateOverview } from '../src/staff-admin/overview-aggregates';
import { OverviewMaintenanceController } from '../src/staff-admin/overview-maintenance-controller';
import { formatMetricMoney } from '@auction-ng/shared';
import { StaffAdminService } from '../src/staff-admin/staff-admin-service';
import { encryptPii, hashPii } from '../src/security/pii';
let ledger: LedgerService, maintenance: OverviewMaintenance;
const q = {
  from: '2025-01-02',
  to: '2025-01-03',
  grain: 'day',
  compare: 'none',
} as const;
const namespace = 'analytics-isolated-test';
beforeAll(async () => {
  const url = process.env.OVERVIEW_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('An isolated analytics database is required.');
  ledger = new LedgerService(url);
  maintenance = new OverviewMaintenance(ledger);
  const db = ledger.db;
  if (
    (await db.lotSettlement.count({
      where: { namespace, endAt: new Date('2025-01-01T23:30:00Z') },
    })) === 3
  )
    return;
  const user = await db.user.create({
    data: {
      name: 'Synthetic analytics buyer',
      emailHash: hashPii('analytics@example.test', 'email'),
      emailCiphertext: encryptPii('analytics@example.test', 'email'),
    },
  });
  const location = await db.location.create({
    data: {
      name: 'Synthetic centre',
      code: 'ANALYTICS',
      address: 'Test address',
      hours: {},
      capacityPerSlot: 10,
    },
  });
  const category = await db.category.create({
    data: { name: 'Synthetic electronics', slug: 'analytics-electronics' },
  });
  await db.bidEngineRuntime.create({
    data: { namespace, redisRunId: 'synthetic-only' },
  });
  const fee = await db.auctionFeePolicy.findFirstOrThrow();
  const wallet = await ledger.openWallet(user.id);
  const session = await db.authSession.create({
    data: {
      userId: user.id,
      familyId: randomUUID(),
      deviceHash: 'a'.repeat(64),
      client: 'web',
      accessHash: 'a'.repeat(64),
      refreshHash: 'b'.repeat(64),
      accessExpiresAt: new Date('2090-01-01'),
      expiresAt: new Date('2090-01-01'),
    },
  });
  for (let index = 0; index < 3; index++) {
    const endAt = new Date('2025-01-01T23:30:00Z'); // Jan 2 in WAT.
    const lot = await db.lot.create({
      data: {
        title: 'Synthetic auction ' + index,
        description: 'Isolated fixture',
        condition: 'like_new',
        retailPriceKobo: 100000n,
        startPriceKobo: 500n,
        categoryId: category.id,
        locationId: location.id,
        startAt: new Date('2024-12-31'),
        endAt,
        status: 'closed',
      },
    });
    const invoice =
      index < 2
        ? await db.invoice.create({
            data: {
              userId: user.id,
              hammerTotalKobo: BigInt((index + 1) * 10000),
              premiumKobo: BigInt((index + 1) * 1500),
              lotFeeKobo: 300n,
              vatKobo: 135n,
              totalKobo: BigInt((index + 1) * 11500 + 435),
              status: index === 0 ? 'refunded' : 'paid',
              createdAt: endAt,
              lines: {
                create: {
                  lotId: lot.id,
                  hammerKobo: BigInt((index + 1) * 10000),
                  premiumKobo: BigInt((index + 1) * 1500),
                  lotFeeKobo: 300n,
                  vatKobo: 135n,
                  totalKobo: BigInt((index + 1) * 11500 + 435),
                },
              },
            },
          })
        : null;
    await db.lotSettlement.create({
      data: {
        lotId: lot.id,
        namespace,
        feeVersion: fee.version,
        streamId: `${index + 1}-0`,
        barrierId: `${index + 1}-0`,
        endAt,
        closedAt: endAt,
        snapshot: {},
        status: index < 2 ? 'paid' : 'unsold',
        ...(invoice
          ? {
              invoiceId: invoice.id,
              winnerId: user.id,
              groupId: randomUUID(),
              hammerKobo: BigInt((index + 1) * 10000),
            }
          : {}),
      },
    });
    if (invoice)
      await db.fulfilment.create({
        data: {
          invoiceId: invoice.id,
          userId: user.id,
          locationId: location.id,
          status: 'ready',
        },
      });
    if (index === 0 && invoice)
      await db.staffRefund.create({
        data: {
          invoiceId: invoice.id,
          actorId: user.id,
          amountKobo: invoice.totalKobo,
          reasonCiphertext: Buffer.from('synthetic'),
          createdAt: new Date('2025-01-03T01:00:00Z'),
        },
      });
    if (index < 2) {
      const id = randomUUID();
      await db.bidFundingIntent.create({
        data: {
          id,
          userId: user.id,
          sessionId: session.id,
          walletId: wallet.id,
          lotId: lot.id,
          groupId: randomUUID(),
          requestKey: randomUUID(),
          requestHash: 'c'.repeat(64),
          binding: 'd'.repeat(64),
          namespace,
          maxKobo: 20000n,
          totalKobo: 24000n,
          reservedKobo: 0n,
          feeVersion: fee.version,
          expiresAt: endAt,
          status: 'released',
        },
      });
      await db.bidAcceptance.create({
        data: {
          id,
          namespace,
          streamId: `${index + 1}-0`,
          fingerprint: 'e'.repeat(64),
          result: {},
          createdAt: new Date(
            index === 0 ? '2025-01-01T23:45:00Z' : '2025-01-03T01:00:00Z',
          ),
        },
      });
    }
  }
}, 30000);
afterAll(async () => {
  await ledger?.close();
});
afterEach(() => vi.unstubAllEnvs());
it('refreshes exact persisted revenue/GMV, full refunds and cross-day distinct bidders without changing money', async () => {
  const before = await ledger.db.ledgerEntry.count();
  await expect(maintenance.refresh(true)).resolves.toMatchObject({
    status: 'refreshed',
  });
  const result = await ledger.db.$transaction((tx) =>
    readAggregateOverview(tx, 'kpis', q),
  );
  expect(result.mode).toBe('aggregate');
  expect(result.data?.kpis.find((row) => row.id === 'netRevenue')?.value).toBe(
    3300,
  );
  expect(result.data?.kpis.find((row) => row.id === 'gmv')?.value).toBe(30000);
  const [direct] = await ledger.db.$queryRaw<
    { value: bigint }[]
  >`SELECT sum(hammer_kobo)::bigint AS value FROM lot_settlements WHERE winner_id IS NOT NULL AND (end_at AT TIME ZONE 'Africa/Lagos')::date BETWEEN ${q.from}::date AND ${q.to}::date`;
  expect(
    BigInt(result.data?.kpis.find((row) => row.id === 'gmv')?.value ?? -1),
  ).toBe(direct?.value);
  expect(result.data?.kpis.find((row) => row.id === 'lotsSold')?.value).toBe(2);
  expect(
    result.data?.kpis.find((row) => row.id === 'activeBidders')?.value,
  ).toBe(1);
  expect(
    result.data?.kpis.find((row) => row.id === 'pickupBacklog')?.value,
  ).toBe(1);
  const revenue = await ledger.db.$transaction((tx) =>
    readAggregateOverview(tx, 'revenue', q),
  );
  expect(revenue.data?.series.map((row) => row.value)).toEqual([5100, -1800]);
  expect(formatMetricMoney(-1800)).toBe('−₦18');
  expect(await ledger.db.ledgerEntry.count()).toBe(before);
}, 30000);
it('is idempotent, groups category totals exactly and never invents expense/cost records', async () => {
  await maintenance.refresh(true);
  const categories = await ledger.db.$transaction((tx) =>
    readAggregateOverview(tx, 'categories', q),
  );
  expect(categories.data?.rows).toEqual([
    { label: 'Synthetic electronics', value: 30000 },
  ]);
  for (const widget of ['monthly-finance', 'stock-age'] as const) {
    const result = await ledger.db.$transaction((tx) =>
      readAggregateOverview(tx, widget, q),
    );
    expect(result.mode).toBe('unavailable');
    expect(result.data).toBeUndefined();
  }
}, 30000);
it('maintains one refresh writer and retains consistent projections under concurrent jobs', async () => {
  const results = await Promise.all([
    maintenance.refresh(true),
    maintenance.refresh(true),
  ]);
  expect(results.some((row) => row.status === 'refreshed')).toBe(true);
  const result = await ledger.db.$transaction((tx) =>
    readAggregateOverview(tx, 'kpis', q),
  );
  expect(result.data?.kpis.find((row) => row.id === 'gmv')?.value).toBe(30000);
}, 30000);
it('rejects anonymous maintenance requests before reading or changing any data', async () => {
  const controller = new OverviewMaintenanceController({ ledger } as never);
  await expect(
    controller.refresh(undefined, { history: true }, {}),
  ).rejects.toThrow();
});
it('filters actual queues and denies financial reads using current staff capabilities', async () => {
  vi.stubEnv('ADMIN_OVERVIEW_DEMO_ENABLED', 'false');
  const permissions = ['dashboard.view', 'support.manage'];
  const staff = new StaffAdminService(ledger, {} as never, {} as never);
  vi.spyOn(staff, 'actor').mockImplementation(async (_tx, _who, permission) => {
    if (!permissions.includes(permission)) throw new ForbiddenException();
    return {
      user: {} as never,
      permissions: permissions as never,
      roleName: 'Support',
    };
  });
  const rows = await staff.overviewWidget({} as never, 'attention', q);
  expect(rows.mode).toBe('aggregate');
  expect(rows.data?.rows.map((row) => row.destination)).toEqual(['support']);
  await expect(
    staff.overviewWidget({} as never, 'kpis', q),
  ).rejects.toBeInstanceOf(ForbiddenException);
});
it('reads a year of seeded aggregate dates within the Overview API budget', async () => {
  const db = ledger.db;
  const source = await db.lot.findFirstOrThrow({
    where: { settlement: { namespace } },
  });
  const fee = await db.auctionFeePolicy.findFirstOrThrow();
  const dates = Array.from({ length: 366 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    endAt: new Date(Date.UTC(2024, 0, 1 + index, 15)),
  }));
  await db.lot.createMany({
    skipDuplicates: true,
    data: dates.map((row) => ({
      ...row,
      title: 'Synthetic yearly auction',
      description: 'Isolated performance fixture',
      condition: 'like_new',
      retailPriceKobo: 10000n,
      startPriceKobo: 500n,
      categoryId: source.categoryId,
      locationId: source.locationId,
      startAt: new Date(row.endAt.getTime() - 3600000),
      status: 'closed',
    })),
  });
  await db.lotSettlement.createMany({
    skipDuplicates: true,
    data: dates.map((row) => ({
      lotId: row.id,
      namespace,
      feeVersion: fee.version,
      streamId: '1-0',
      barrierId: '1-0',
      endAt: row.endAt,
      closedAt: row.endAt,
      snapshot: {},
      status: 'unsold',
    })),
  });
  await maintenance.refresh(true);
  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const result = await db.$transaction((tx) =>
      readAggregateOverview(tx, 'kpis', {
        ...q,
        from: '2024-01-01',
        to: '2024-12-31',
      }),
    );
    times.push(performance.now() - start);
    expect(
      result.data?.kpis.find((row) => row.id === 'sellThrough')?.value,
    ).toBe(0);
  }
  times.sort((a, b) => a - b);
  expect(times[9]).toBeLessThan(300);
}, 30000);
