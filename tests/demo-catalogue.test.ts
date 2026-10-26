import { describe, expect, it } from 'vitest';
import {
  assertDemoDatabase,
  demoLotPlan,
} from '../apps/api/prisma/demo-catalogue';

describe('isolated photographic marketplace seed', () => {
  it('refuses main, production and non-local database targets', () => {
    expect(() =>
      assertDemoDatabase(
        'postgresql://local:local@localhost:5432/auction_ng',
        'development',
      ),
    ).toThrow();
    expect(() =>
      assertDemoDatabase(
        'postgresql://local:local@localhost:5432/auction_ng_demo_1234567890',
        'production',
      ),
    ).toThrow();
    expect(() =>
      assertDemoDatabase(
        'postgresql://local:local@remote.example:5432/auction_ng_demo_1234567890',
        'development',
      ),
    ).toThrow();
    expect(() =>
      assertDemoDatabase(
        'postgresql://local:local@localhost:5432/auction_ng_demo_1234567890',
        'development',
      ),
    ).not.toThrow();
  });
  it('creates ten lots in each of twelve categories with eight initially closing', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    const lots = demoLotPlan(now);
    expect(lots).toHaveLength(120);
    for (let category = 0; category < 12; category++)
      expect(lots.filter((lot) => lot.category === category)).toHaveLength(10);
    expect(
      lots.filter((lot) => lot.endAt.getTime() - now.getTime() <= 900000),
    ).toHaveLength(8);
    expect(
      lots.every(
        (lot) =>
          lot.startAt < now &&
          lot.endAt > now &&
          lot.endAt.getTime() <= now.getTime() + 21600000,
      ),
    ).toBe(true);
  });
  it('uses exact integer kobo, retail estimates and an attainable low-price rail', () => {
    const lots = demoLotPlan(new Date());
    expect(Math.min(...lots.map((lot) => lot.startPriceKobo))).toBe(250000);
    expect(Math.max(...lots.map((lot) => lot.startPriceKobo))).toBe(85000000);
    expect(
      lots.filter((lot) => lot.startPriceKobo < 1000000).length,
    ).toBeGreaterThanOrEqual(8);
    expect(
      lots.every(
        (lot) =>
          Number.isSafeInteger(lot.startPriceKobo) &&
          Number.isSafeInteger(lot.retailPriceKobo) &&
          lot.retailPriceKobo > lot.startPriceKobo,
      ),
    ).toBe(true);
  });
});
