import { z } from 'zod';
export const pickupCalendarSchema = z
  .object({
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length),
    closedDates: z.array(z.iso.date()).max(730).default([]),
    opensMinute: z.number().int().min(0).max(1438),
    closesMinute: z.number().int().min(1).max(1439),
  })
  .strict()
  .refine(
    (value) => value.opensMinute < value.closesMinute,
    'Closing time must follow opening time.',
  );
export type PickupCalendar = z.infer<typeof pickupCalendarSchema>;
export const PICKUP_FREE_WORKING_DAYS = 5;
export const PICKUP_REVIEW_WORKING_DAYS = 10;
export const PICKUP_STORAGE_DAILY_KOBO = 100000;
export const PICKUP_STORAGE_CAP_KOBO = 1000000;
const DAY = 86400000;
function instant(value: string) {
  z.iso.datetime().parse(value);
  return Date.parse(value);
}
function localDay(at: string) {
  return new Date(instant(at) + 3600000).toISOString().slice(0, 10);
}
function shift(day: string, delta: number) {
  return new Date(Date.parse(day + 'T00:00:00.000Z') + delta * DAY)
    .toISOString()
    .slice(0, 10);
}
function open(day: string, calendar: PickupCalendar) {
  const weekday = new Date(day + 'T00:00:00.000Z').getUTCDay() || 7;
  return (
    calendar.weekdays.includes(weekday) && !calendar.closedDates.includes(day)
  );
}
function time(day: string, minute: number) {
  return new Date(
    Date.parse(day + 'T00:00:00.000Z') + (minute - 60) * 60000,
  ).toISOString();
}
function workingDay(
  day: string,
  count: number,
  calendar: PickupCalendar,
  direction = 1,
) {
  let value = day,
    remaining = count;
  for (let n = 0; n < 3660; n++) {
    value = shift(value, direction);
    if (open(value, calendar) && --remaining === 0) return value;
  }
  throw new RangeError('Calendar cannot produce a collection date.');
}
export function pickupStorageDates(readyAt: string, input: PickupCalendar) {
  const calendar = pickupCalendarSchema.parse(input),
    day = localDay(readyAt);
  return {
    dueAt: time(
      workingDay(day, PICKUP_FREE_WORKING_DAYS, calendar),
      calendar.closesMinute,
    ),
    reviewAt: time(
      workingDay(day, PICKUP_REVIEW_WORKING_DAYS, calendar),
      calendar.closesMinute,
    ),
  };
}
export function pickupStorageDays(
  dueAt: string,
  now: string,
  input: PickupCalendar,
) {
  const calendar = pickupCalendarSchema.parse(input),
    nowValue = instant(now);
  if (nowValue <= instant(dueAt)) return 0;
  const end = localDay(now);
  let day = localDay(dueAt),
    count = 0;
  for (let n = 0; n < 36600; n++) {
    day = shift(day, 1);
    if (day > end) return count;
    if (
      open(day, calendar) &&
      nowValue >= Date.parse(time(day, calendar.opensMinute))
    )
      count++;
  }
  throw new RangeError('Storage date interval needs review.');
}
export function pickupStorageReminderTimes(
  dueAt: string,
  input: PickupCalendar,
) {
  const calendar = pickupCalendarSchema.parse(input),
    day = localDay(dueAt);
  return [
    time(workingDay(day, 2, calendar, -1), calendar.opensMinute),
    time(workingDay(day, 1, calendar, -1), calendar.opensMinute),
  ];
}
export function pickupStorageExtensionDates(
  dueDate: string,
  input: PickupCalendar,
) {
  z.iso.date().parse(dueDate);
  const calendar = pickupCalendarSchema.parse(input);
  if (!open(dueDate, calendar))
    throw new RangeError('Choose a centre working day.');
  return {
    dueAt: time(dueDate, calendar.closesMinute),
    reviewAt: time(workingDay(dueDate, 5, calendar), calendar.closesMinute),
  };
}
