import { describe, expect, it } from 'vitest';
import {
  batchMarginKobo,
  batchPickProblem,
  batchSaveSchema,
  batchDeleteSchema,
  batchPurgeAt,
  batchTotalCostKobo,
  moneyBackKobo,
  nextBatchStatus,
  percentOf,
  recoveryCurve,
  recoveryPercent,
  shareBatchCost,
  sniffBatchFile,
} from '../packages/shared/src/batches';

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b);

it('uses an exact thirty-day restore window and strict deletion commands', () => {
  expect(batchPurgeAt('2026-11-26T10:30:00.000Z')).toBe(
    '2026-12-26T10:30:00.000Z',
  );
  const command = {
    id: '00000000-0000-4000-8000-000000000001',
    expectedUpdatedAt: '2026-11-26T10:30:00.000Z',
    idempotencyKey: '00000000-0000-4000-8000-000000000002',
    reason: 'Created by mistake',
    confirmation: 'B-0001',
  };
  expect(batchDeleteSchema.safeParse(command).success).toBe(true);
  expect(batchDeleteSchema.safeParse({ ...command, force: true }).success).toBe(
    false,
  );
  expect(batchDeleteSchema.safeParse({ ...command, reason: '' }).success).toBe(
    false,
  );
});

describe('batch cost', () => {
  it('adds the four costs', () => {
    expect(
      batchTotalCostKobo({
        costSupplierKobo: 300_000_000,
        costTransportKobo: 8_500_000,
        costCustomsKobo: 0,
        costOtherKobo: 1_500_000,
      }),
    ).toBe(310_000_000);
  });
  it('shares by retail value, with leftover kobo on the priciest lot', () => {
    const shares = shareBatchCost(100, 'retail', [
      { id: 'a', retailPriceKobo: 1 },
      { id: 'b', retailPriceKobo: 1 },
      { id: 'c', retailPriceKobo: 4 },
    ]);
    expect(Object.fromEntries(shares)).toEqual({ a: 16, b: 16, c: 68 });
  });
  it('shares equally, leftover to the priciest, lowest id on a tie', () => {
    expect(
      Object.fromEntries(
        shareBatchCost(100, 'equal', [
          { id: 'b', retailPriceKobo: 5 },
          { id: 'a', retailPriceKobo: 5 },
          { id: 'c', retailPriceKobo: 1 },
        ]),
      ),
    ).toEqual({ a: 34, b: 33, c: 33 });
  });
  it('falls back to equally when no lot has a retail price', () => {
    expect(
      Object.fromEntries(
        shareBatchCost(10, 'retail', [
          { id: 'a', retailPriceKobo: 0 },
          { id: 'b', retailPriceKobo: 0 },
        ]),
      ),
    ).toEqual({ a: 5, b: 5 });
  });
  it('always adds up to the exact batch cost', () => {
    let seed = 7;
    const random = (max: number) =>
      (seed = (seed * 48_271) % 2_147_483_647) % max;
    for (let run = 0; run < 300; run++) {
      const total = 1 + random(2_000_000_000);
      const lots = Array.from({ length: 1 + random(60) }, (_, i) => ({
        id: `lot-${i}`,
        retailPriceKobo: random(3) ? random(90_000_000) : 0,
      }));
      for (const method of ['retail', 'equal'] as const) {
        const shares = shareBatchCost(total, method, lots);
        expect(sum(shares)).toBe(total);
        expect(Math.min(...shares.values())).toBeGreaterThanOrEqual(0);
      }
    }
    // Beyond what a double can multiply exactly.
    const big = shareBatchCost(9_007_199_254_740_991, 'retail', [
      { id: 'a', retailPriceKobo: 900_000_000_001 },
      { id: 'b', retailPriceKobo: 3 },
    ]);
    expect(sum(big)).toBe(9_007_199_254_740_991);
  });
  it('has no shares without lots', () => {
    expect(shareBatchCost(100, 'retail', []).size).toBe(0);
  });
});

describe('money back', () => {
  it('counts hammer and premium on paid invoices only', () => {
    expect(
      moneyBackKobo([
        { invoiceStatus: 'paid', hammerKobo: 1_000, premiumKobo: 150 },
        { invoiceStatus: 'pending', hammerKobo: 9_000, premiumKobo: 900 },
        { invoiceStatus: 'refunded', hammerKobo: 5_000, premiumKobo: 750 },
        { invoiceStatus: 'cancelled', hammerKobo: 5_000, premiumKobo: 750 },
      ]),
    ).toBe(1_150);
  });
  it('works out margin and recovery', () => {
    expect(batchMarginKobo(492_000_000, 320_000_000)).toBe(172_000_000);
    expect(batchMarginKobo(0, 460_000_000)).toBe(-460_000_000);
    expect(recoveryPercent(492_000_000, 320_000_000)).toBe(154);
    expect(recoveryPercent(1, 0)).toBeNull();
    expect(percentOf(1, 8)).toBe(13); // 12.5 rounds half up
  });
  it('marks the day the money back reaches the cost', () => {
    const curve = recoveryCurve(
      '2026-10-28',
      '2026-11-02',
      new Map([
        ['2026-10-20', 10],
        ['2026-10-29', 40],
        ['2026-10-31', 60],
        ['2026-11-01', 5],
      ]),
      100,
    );
    expect(curve.points.map((p) => p.cumulativeKobo)).toEqual([
      10, 50, 50, 110, 115, 115,
    ]);
    expect(curve).toMatchObject({
      breakEvenOn: '2026-10-31',
      breakEvenDay: 3,
    });
    expect(
      recoveryCurve('2026-10-28', '2026-10-28', new Map(), 100).breakEvenDay,
    ).toBeNull();
  });
});

describe('batch status', () => {
  const base = {
    status: 'received' as const,
    autoClose: true,
    itemsReceived: 3,
    lots: 0,
    published: false,
    sold: 0,
    writtenOff: 0,
  };
  it('moves to Selling when the first lot is published', () => {
    expect(nextBatchStatus(base)).toBe('received');
    expect(nextBatchStatus({ ...base, lots: 1, published: true })).toBe(
      'selling',
    );
  });
  it('closes when every received item is sold or written off', () => {
    const selling = {
      ...base,
      status: 'selling' as const,
      published: true,
      lots: 3,
      sold: 2,
    };
    expect(nextBatchStatus(selling)).toBe('selling');
    expect(nextBatchStatus({ ...selling, writtenOff: 1 })).toBe('closed');
    // Selling all 3 of 200 items doesn't close it.
    expect(nextBatchStatus({ ...selling, sold: 3, itemsReceived: 200 })).toBe(
      'selling',
    );
    expect(nextBatchStatus({ ...selling, sold: 3, itemsReceived: null })).toBe(
      'selling',
    );
  });
  it('stays open after a hand reopen, and closed stays closed', () => {
    const done = {
      ...base,
      status: 'selling' as const,
      published: true,
      lots: 3,
      sold: 3,
    };
    expect(nextBatchStatus({ ...done, autoClose: false })).toBe('selling');
    expect(nextBatchStatus({ ...base, status: 'closed' })).toBe('closed');
  });
  it('lets lots join only an open batch at their location', () => {
    expect(
      batchPickProblem({
        status: 'arriving',
        locationId: 'a',
        lotLocationId: 'a',
      }),
    ).toBeNull();
    expect(
      batchPickProblem({
        status: 'closed',
        locationId: 'a',
        lotLocationId: 'a',
      }),
    ).toContain('closed');
    expect(
      batchPickProblem({
        status: 'selling',
        locationId: 'a',
        lotLocationId: 'b',
      }),
    ).toContain('another pickup location');
  });
});

describe('batch form', () => {
  const input = {
    id: null,
    expectedUpdatedAt: null,
    idempotencyKey: crypto.randomUUID(),
    supplierId: crypto.randomUUID(),
    name: 'Konga returns, November',
    supplierRef: '',
    boughtOn: '2026-11-23',
    locationId: crypto.randomUUID(),
    status: 'arriving',
    expectedOn: '2026-11-27',
    itemsExpected: 200,
    categoryIds: [],
    costSupplierKobo: 300_000_000,
    costTransportKobo: 0,
    costCustomsKobo: 0,
    costOtherKobo: 0,
    costShareMethod: 'retail',
    paidFrom: null,
    notes: '',
  };
  const problem = (change: object) =>
    batchSaveSchema.safeParse({ ...input, ...change }).error?.issues[0]
      ?.message;
  it('accepts a full batch with no account chosen', () => {
    expect(batchSaveSchema.parse(input)).toMatchObject({
      supplierRef: null,
      paidFrom: null,
      notes: null,
    });
  });
  it('says what is missing in plain words', () => {
    expect(problem({ supplierId: '' })).toBe('Pick a supplier.');
    expect(problem({ itemsExpected: 0 })).toContain('at least 1');
    expect(problem({ costSupplierKobo: 0 })).toContain('more than ₦0');
    expect(problem({ expectedOn: null })).toBe('Pick the day you expect it.');
    expect(problem({ status: 'received', expectedOn: null })).toBeUndefined();
    expect(problem({ extra: 1 })).toBeDefined();
  });
});

it('recognises attachments by content, not by name', () => {
  const bytes = (...v: number[]) => new Uint8Array(v);
  expect(sniffBatchFile(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe(
    'application/pdf',
  );
  expect(sniffBatchFile(bytes(0xff, 0xd8, 0xff))).toBe('image/jpeg');
  expect(sniffBatchFile(bytes(0x50, 0x4b, 3, 4))).toContain('spreadsheetml');
  expect(sniffBatchFile(new TextEncoder().encode('<html>'))).toBeNull();
});
