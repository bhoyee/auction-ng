import { expect, it } from 'vitest';
import {
  preBidChangeSchema,
  preBidScheduleSchema,
  canChangePreBid,
} from '../packages/shared/src/prebid-schemas';
it('allows changes strictly before the server launch time', () => {
  expect(canChangePreBid('scheduled', 999, 1000, false)).toBe(true);
  expect(canChangePreBid('scheduled', 1000, 1000, false)).toBe(false);
  expect(canChangePreBid('scheduled', 999, 1000, true)).toBe(false);
  expect(canChangePreBid('open', 999, 1000, false)).toBe(false);
});
it('validates exact integer money, revision, policy version and request keys', () => {
  const value = {
    maxKobo: 50000,
    feeVersion: 'auction-fees-v1',
    expectedRevision: 0,
    idempotencyKey: '22222222-2222-4222-8222-222222222222',
  };
  expect(preBidChangeSchema.safeParse(value).success).toBe(true);
  for (const change of [
    { maxKobo: 0 },
    { maxKobo: 50000.5 },
    { expectedRevision: -1 },
    { extra: true },
    { feeVersion: '' },
  ])
    expect(preBidChangeSchema.safeParse({ ...value, ...change }).success).toBe(
      false,
    );
});
it('rejects an end before launch and unknown admin fields', () => {
  const value = {
    action: 'schedule',
    startsAt: '2026-11-03T10:00:00.000Z',
    endsAt: '2026-11-03T22:00:00.000Z',
    expectedUpdatedAt: '2026-11-01T10:00:00.000Z',
    idempotencyKey: '22222222-2222-4222-8222-222222222222',
    reason: 'Schedule upcoming stock',
  };
  expect(preBidScheduleSchema.safeParse(value).success).toBe(true);
  expect(
    preBidScheduleSchema.safeParse({
      ...value,
      endsAt: value.expectedUpdatedAt,
    }).success,
  ).toBe(false);
  expect(
    preBidScheduleSchema.safeParse({ ...value, extra: true }).success,
  ).toBe(false);
});
