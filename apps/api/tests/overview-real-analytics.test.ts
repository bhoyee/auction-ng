import { describe, expect, it } from 'vitest';
import {
  buildAggregateOverview,
  type DailyMetric,
} from '../src/staff-admin/overview-aggregates';

const query = {
  from: '2026-11-01',
  to: '2026-11-07',
  compare: 'none',
  grain: 'day',
} as const;
const daily: DailyMetric[] = [
  {
    day: '2026-11-01',
    revenue: 17250n,
    gmv: 100000n,
    sold: 1n,
    closed: 2n,
    listed: 3n,
    bidLots: 2n,
    paid: 1n,
    collected: 1n,
  },
  {
    day: '2026-11-02',
    revenue: -17250n,
    gmv: 200000n,
    sold: 1n,
    closed: 1n,
    listed: 1n,
    bidLots: 1n,
    paid: 1n,
    collected: 0n,
  },
];
describe('actual Overview aggregate presentation', () => {
  it('uses integer kobo, keeps refunds negative and never treats GMV as revenue', () => {
    const data = buildAggregateOverview('kpis', query, daily, 1n, 2n);
    expect(data.kpis.find((row) => row.id === 'netRevenue')?.value).toBe(0);
    expect(data.kpis.find((row) => row.id === 'gmv')?.value).toBe(300000);
    expect(data.kpis.find((row) => row.id === 'sellThrough')?.value).toBe(6667);
    expect(data.kpis.find((row) => row.id === 'activeBidders')?.value).toBe(1);
    expect(data.kpis.find((row) => row.id === 'pickupBacklog')?.value).toBe(2);
  });
  it('preserves exact revenue totals across day/week/month buckets and fills empty dates', () => {
    for (const grain of ['day', 'week', 'month'] as const) {
      const data = buildAggregateOverview(
        'revenue',
        { ...query, grain },
        daily,
        0n,
        0n,
      );
      expect(data.series.reduce((sum, row) => sum + row.value, 0)).toBe(0);
      expect(data.series.every((row) => row.previous === null)).toBe(true);
    }
    expect(
      buildAggregateOverview('revenue', query, daily, 0n, 0n).series,
    ).toHaveLength(7);
  });
  it('rejects unsafe monetary totals instead of truncating or rounding them', () => {
    expect(() =>
      buildAggregateOverview(
        'kpis',
        query,
        [
          {
            ...daily[0],
            gmv: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
          } as DailyMetric,
        ],
        0n,
        0n,
      ),
    ).toThrow();
  });
  it('zero data means zero activity, not a demo fallback or NaN sell-through', () => {
    const data = buildAggregateOverview('kpis', query, [], 0n, 0n);
    expect(data.kpis.every((row) => row.value === 0)).toBe(true);
  });
});
