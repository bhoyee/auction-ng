import { expect, it } from 'vitest';
import {
  liveMonitorDemoPlan,
  assertDemoDatabase,
} from '../apps/api/prisma/demo-catalogue';
it('uses independent past publication times and original 12–72 hour durations', () => {
  const now = new Date('2026-11-07T12:00:00Z'),
    plan = liveMonitorDemoPlan(now);
  expect(plan).toHaveLength(20);
  expect(new Set(plan.map((row) => row.runTimeMs / 3600000))).toEqual(
    new Set([12, 24, 36, 48, 72]),
  );
  for (const row of plan) {
    expect(row.endAt.getTime() - row.startAt.getTime()).toBe(row.runTimeMs);
    expect(row.startAt.getTime()).toBeLessThan(now.getTime());
    expect(row.endAt.getTime()).toBeGreaterThan(now.getTime());
  }
});
it('keeps production and non-demo databases blocked', () => {
  expect(() =>
    assertDemoDatabase('postgres://localhost/auction_ng', 'development'),
  ).toThrow();
  expect(() =>
    assertDemoDatabase(
      'postgres://localhost/auction_ng_demo_123456789012',
      'production',
    ),
  ).toThrow();
});
