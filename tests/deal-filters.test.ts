import { expect, it } from 'vitest';
import {
  dealBandsMatch,
  dealListInputSchema,
  dealListQuerySchema,
  publicBrowseStateSchema,
} from '../packages/shared/src/deal-filters';
const now = Date.parse('2026-10-29T22:30:00Z');
const state = {
  open: true,
  startPriceKobo: 50000,
  currentPriceKobo: 4000000,
  endsAt: now + 1800000,
};
it.each([
  [[], [], true],
  [['under-30000'], [], false],
  [['under-100000'], [], true],
  [['under-30000', 'under-100000'], ['under-1h'], true],
  [['100000-plus'], ['under-1h'], false],
  [[], ['today', 'tomorrow'], true],
])(
  'matches live prices with multiple options (%j, %j)',
  (prices, ends, expected) => {
    expect(
      dealBandsMatch(state, dealListInputSchema.parse({ prices, ends }), now),
    ).toBe(expected);
  },
);
it('keeps the overlapping under-price choices and exact thresholds correct', () => {
  const under = dealListInputSchema.parse({ prices: ['under-30000'] });
  expect(
    dealBandsMatch({ ...state, currentPriceKobo: 2999999 }, under, now),
  ).toBe(true);
  expect(
    dealBandsMatch({ ...state, currentPriceKobo: 3000000 }, under, now),
  ).toBe(false);
  expect(
    dealBandsMatch(
      { ...state, currentPriceKobo: 10000000 },
      dealListInputSchema.parse({ prices: ['under-100000'] }),
      now,
    ),
  ).toBe(false);
  expect(
    dealBandsMatch(
      { ...state, currentPriceKobo: 10000000 },
      dealListInputSchema.parse({ prices: ['100000-plus'] }),
      now,
    ),
  ).toBe(true);
});
it('uses Nigerian calendar midnight for today and tomorrow, rather than rolling 24-hour windows', () => {
  const today = dealListInputSchema.parse({ ends: ['today'] }),
    tomorrow = dealListInputSchema.parse({ ends: ['tomorrow'] });
  for (const [stamp, isToday, isTomorrow] of [
    ['2026-10-29T22:59:59Z', true, false],
    ['2026-10-29T23:00:00Z', false, true],
    ['2026-10-30T22:59:59Z', false, true],
    ['2026-10-30T23:00:00Z', false, false],
  ] as const) {
    const current = { ...state, endsAt: Date.parse(stamp) };
    expect(dealBandsMatch(current, today, now)).toBe(isToday);
    expect(dealBandsMatch(current, tomorrow, now)).toBe(isTomorrow);
  }
});
it('includes exactly one hour and excludes closed/elapsed lots', () => {
  expect(
    dealBandsMatch(
      { ...state, endsAt: now + 3600000 },
      dealListInputSchema.parse({ ends: ['under-1h'] }),
      now,
    ),
  ).toBe(true);
  expect(
    dealBandsMatch(
      { ...state, endsAt: now + 3600001 },
      dealListInputSchema.parse({ ends: ['under-1h'] }),
      now,
    ),
  ).toBe(false);
  expect(
    dealBandsMatch(
      { ...state, open: false },
      dealListInputSchema.parse({}),
      now,
    ),
  ).toBe(false);
  expect(
    dealBandsMatch(
      { ...state, endsAt: now },
      dealListInputSchema.parse({}),
      now,
    ),
  ).toBe(false);
});
it('selects every condition by default but preserves an explicitly empty selection', () => {
  expect(dealListInputSchema.parse({}).conditions).toHaveLength(5);
  expect(dealListQuerySchema.parse({}).conditions).toHaveLength(5);
  expect(dealListInputSchema.parse({ conditions: [] }).conditions).toEqual([]);
  expect(dealListQuerySchema.parse({ conditions: '' }).conditions).toEqual([]);
});
it('strips private leader, limits and hold fields', () => {
  const result = publicBrowseStateSchema.parse({
    ...state,
    leader: { bidderId: 'private', maxKobo: 99999999 },
    groupId: 'private',
  });
  expect(Object.keys(result).sort()).toEqual([
    'currentPriceKobo',
    'endsAt',
    'open',
    'startPriceKobo',
  ]);
});
it('validates and canonicalises URL multi-selections', () => {
  expect(
    dealListQuerySchema.parse({
      conditions: 'open_box,new,open_box',
      prices: 'under-30000',
    }).conditions,
  ).toEqual(['new', 'open_box']);
  for (const input of [
    { conditions: 'broken' },
    { locationId: 'anything' },
    { limit: '51' },
  ])
    expect(dealListQuerySchema.safeParse(input).success).toBe(false);
});
