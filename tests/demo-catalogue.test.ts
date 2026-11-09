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
  it('creates twelve categories and twenty lots in each requested closing window', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    const lots = demoLotPlan(now);
    expect(lots).toHaveLength(120);
    for (let category = 0; category < 12; category++)
      expect(lots.filter((lot) => lot.category === category)).toHaveLength(10);
    const hour = 60 * 60 * 1000;
    for (const hours of [6, 12, 24, 72, 96, 120]) {
      const group = lots.filter((lot) => {
        const remaining = lot.endAt.getTime() - now.getTime();
        return (
          remaining >= hours * hour && remaining < hours * hour + 20 * 60000
        );
      });
      expect(group).toHaveLength(20);
      expect(new Set(group.map((lot) => lot.endAt.getTime())).size).toBe(20);
    }
    expect(
      lots.every(
        (lot) =>
          lot.startAt < now &&
          lot.endAt > now &&
          lot.endAt.getTime() <= now.getTime() + 120 * hour + 19 * 60000,
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
