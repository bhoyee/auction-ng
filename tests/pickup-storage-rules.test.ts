import { describe, expect, it } from 'vitest';
import {
  pickupStorageDates,
  pickupStorageDays,
  pickupStorageReminderTimes,
  pickupCalendarSchema,
} from '../packages/shared/src/pickup-storage-rules';
import { calculateStorageCharge } from '../packages/shared/src/fees';
const calendar = {
  weekdays: [1, 2, 3, 4, 5],
  closedDates: [] as string[],
  opensMinute: 540,
  closesMinute: 1020,
};
describe('pickup working-day dates in Africa/Lagos', () => {
  it('gives five full working days after readiness and flags review after ten', () => {
    const dates = pickupStorageDates('2026-11-06T12:00:00.000Z', calendar);
    expect(dates.dueAt).toBe('2026-11-13T16:00:00.000Z');
    expect(dates.reviewAt).toBe('2026-11-20T16:00:00.000Z');
  });
  it('skips explicit closures and counts an enabled Saturday', () => {
    expect(
      pickupStorageDates('2026-11-06T12:00:00.000Z', {
        ...calendar,
        closedDates: ['2026-11-11'],
      }).dueAt,
    ).toBe('2026-11-16T16:00:00.000Z');
    expect(
      pickupStorageDates('2026-11-06T12:00:00.000Z', {
        ...calendar,
        weekdays: [1, 2, 3, 4, 5, 6],
      }).dueAt,
    ).toBe('2026-11-12T16:00:00.000Z');
  });
  it.each([
    ['2026-11-13T16:00:00.000Z', 0],
    ['2026-11-14T12:00:00.000Z', 0],
    ['2026-11-16T07:59:59.999Z', 0],
    ['2026-11-16T08:00:00.000Z', 1],
    ['2026-11-17T08:00:00.000Z', 2],
  ])('counts chargeable days only at centre opening: %s', (now, expected) => {
    expect(pickupStorageDays('2026-11-13T16:00:00.000Z', now, calendar)).toBe(
      expected,
    );
  });
  it('counts WAT dates across UTC midnight', () => {
    expect(pickupStorageDates('2026-11-08T23:30:00.000Z', calendar).dueAt).toBe(
      '2026-11-16T16:00:00.000Z',
    );
  });
  it('schedules reminders on two different preceding working days', () => {
    expect(
      pickupStorageReminderTimes('2026-11-13T16:00:00.000Z', calendar),
    ).toEqual(['2026-11-11T08:00:00.000Z', '2026-11-12T08:00:00.000Z']);
  });
  it('rejects empty calendars, invalid dates and reversed hours', () => {
    for (const value of [
      { ...calendar, weekdays: [] },
      { ...calendar, closedDates: ['2026-02-30'] },
      { ...calendar, opensMinute: 1100 },
      { ...calendar, unknown: true },
    ])
      expect(pickupCalendarSchema.safeParse(value).success).toBe(false);
    expect(() => pickupStorageDates('bad', calendar)).toThrow();
  });
});
describe('storage charge in integer kobo', () => {
  it.each([
    [0, 0],
    [1, 100000],
    [5, 500000],
    [10, 1000000],
    [1000000, 1000000],
  ])('caps %i days at the agreed amount', (days, total) => {
    expect(
      calculateStorageCharge({
        dailyKobo: 100000,
        capKobo: 1000000,
        days,
        carriedKobo: 0,
        paidKobo: 0,
        waived: false,
      }),
    ).toEqual({ assessedKobo: total, outstandingKobo: total });
  });
  it('preserves carried charges across an extension without exceeding the cap', () => {
    expect(
      calculateStorageCharge({
        dailyKobo: 100000,
        capKobo: 1000000,
        days: 3,
        carriedKobo: 900000,
        paidKobo: 400000,
        waived: false,
      }),
    ).toEqual({ assessedKobo: 1000000, outstandingKobo: 600000 });
  });
  it('waives storage explicitly and never turns payments into a negative bill', () => {
    expect(
      calculateStorageCharge({
        dailyKobo: 100000,
        capKobo: 1000000,
        days: 3,
        carriedKobo: 0,
        paidKobo: 200000,
        waived: true,
      }).outstandingKobo,
    ).toBe(0);
    expect(
      calculateStorageCharge({
        dailyKobo: 0,
        capKobo: 0,
        days: 20,
        carriedKobo: 0,
        paidKobo: 100,
        waived: false,
      }).outstandingKobo,
    ).toBe(0);
  });
  it('rejects unsafe and fractional money or days', () => {
    const input = {
      dailyKobo: 100000,
      capKobo: 1000000,
      days: 1,
      carriedKobo: 0,
      paidKobo: 0,
      waived: false,
    };
    for (const changes of [
      { days: -1 },
      { days: 1.1 },
      { dailyKobo: Number.MAX_SAFE_INTEGER + 1 },
      { capKobo: -1 },
      { paidKobo: 0.5 },
    ])
      expect(() => calculateStorageCharge({ ...input, ...changes })).toThrow();
  });
});
