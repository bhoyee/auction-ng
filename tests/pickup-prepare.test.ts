import { describe, expect, it } from 'vitest';
import {
  normalisePickupReference,
  parsePickupPrepareCursor,
  pickupPrepareCursor,
  pickupPreparePageSchema,
  pickupPrepareQuerySchema,
  pickupPrepareTone,
  pickupPrepareWait,
} from '../packages/shared/src/pickup-prepare';

const now = new Date('2026-11-08T12:00:00.000Z');
const ago = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString();

describe('pickup preparation waiting time', () => {
  it.each([
    [0, 'normal', '0 min'],
    [59, 'normal', '59 min'],
    [60, 'normal', '1 h'],
    [24 * 60 - 1, 'normal', '23 h'],
    [24 * 60, 'warn', '1 d'],
    [27 * 60, 'warn', '1 d 3 h'],
    [48 * 60 - 1, 'warn', '1 d 23 h'],
    [48 * 60, 'alert', '2 d'],
    [10 * 24 * 60, 'alert', '10 d'],
  ] as const)('%i minutes is %s and reads %s', (minutes, tone, label) => {
    expect(pickupPrepareTone(ago(minutes), now)).toBe(tone);
    expect(pickupPrepareWait(ago(minutes), now)).toBe(label);
  });

  it('never shows a negative wait when the server clock is behind', () => {
    expect(pickupPrepareWait(ago(-5), now)).toBe('0 min');
    expect(pickupPrepareTone(ago(-5), now)).toBe('normal');
  });
});

describe('pickup preparation references and cursors', () => {
  it.each([
    [' lv8q7r6p ', 'LV8Q7R6P'],
    ['LV8Q7R6P\n', 'LV8Q7R6P'],
    ['https://lotvanta.ng/lots/lv8q7r6p', 'LV8Q7R6P'],
    ['LV-8Q7R6P', 'LV-8Q7R6P'],
    ['LV8Q 7R6P', 'LV8Q7R6P'],
  ])('normalises %j to %s', (raw, expected) => {
    expect(normalisePickupReference(raw)).toBe(expected);
  });

  it('round-trips the keyset cursor and rejects tampered cursors', () => {
    const id = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
    const cursor = pickupPrepareCursor('2026-11-08T10:00:00.123Z', id);
    expect(parsePickupPrepareCursor(cursor)).toEqual({
      paidAt: '2026-11-08T10:00:00.123Z',
      invoiceLineId: id,
    });
    expect(pickupPrepareQuerySchema.parse({ cursor }).cursor).toBe(cursor);
    expect(() =>
      pickupPrepareQuerySchema.parse({ cursor: "x'; DROP TABLE lots;--" }),
    ).toThrow();
  });

  it('defaults to 25 rows, caps at 50 and rejects unknown fields', () => {
    expect(pickupPrepareQuerySchema.parse({}).limit).toBe(25);
    expect(() => pickupPrepareQuerySchema.parse({ limit: 51 })).toThrow();
    expect(() => pickupPrepareQuerySchema.parse({ view: 'all' })).toThrow();
  });

  it('accepts an empty page with a zero summary', () => {
    expect(
      pickupPreparePageSchema.parse({
        items: [],
        nextCursor: null,
        serverTime: now.toISOString(),
        summary: {
          total: 0,
          overWarn: 0,
          overAlert: 0,
          oldestPaidAt: null,
          centres: [],
        },
      }).items,
    ).toEqual([]);
  });
});
