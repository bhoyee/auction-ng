import { expect, it } from 'vitest';
import {
  dealBandsMatch,
  dealListInputSchema,
  dealListQuerySchema,
  publicBrowseStateSchema,
} from '../packages/shared/src/deal-filters';
const state = {
  open: true,
  startPriceKobo: 50000,
  currentPriceKobo: 3000000,
  endsAt: 7200000,
};
it.each([
  [[], [], true],
  [['under-5000'], [], false],
  [['20000-50000'], [], true],
  [['under-5000', '20000-50000'], ['1-6h'], true],
  [['20000-50000'], ['under-1h'], false],
  [[], ['under-1h', '1-6h'], true],
])(
  'combines multiple bands using the live bid, not the starting bid (%j, %j)',
  (prices, ends, expected) => {
    const filters = dealListInputSchema.parse({ prices, ends });
    expect(dealBandsMatch(state, filters, 0)).toBe(expected);
  },
);
it('uses half-open price/time ranges and excludes terminal or elapsed states', () => {
  const filters = dealListInputSchema.parse({
    prices: ['5000-20000'],
    ends: ['1-6h'],
  });
  expect(
    dealBandsMatch({ ...state, currentPriceKobo: 500000 }, filters, 0),
  ).toBe(true);
  expect(
    dealBandsMatch({ ...state, currentPriceKobo: 2000000 }, filters, 0),
  ).toBe(false);
  expect(
    dealBandsMatch({ ...state, open: false }, dealListInputSchema.parse({}), 0),
  ).toBe(false);
  expect(
    dealBandsMatch(state, dealListInputSchema.parse({}), state.endsAt),
  ).toBe(false);
  expect(
    dealBandsMatch(
      { ...state, endsAt: 90000000 },
      dealListInputSchema.parse({ ends: ['under-1h'] }),
      0,
    ),
  ).toBe(false);
});
it('strips private leader/limit fields from the live browse read model', () => {
  const publicState = publicBrowseStateSchema.parse({
    ...state,
    leader: { bidderId: 'private-user', maxKobo: 99999999 },
    groupId: 'private-hold',
  });
  expect(Object.keys(publicState).sort()).toEqual([
    'currentPriceKobo',
    'endsAt',
    'open',
    'startPriceKobo',
  ]);
  expect(JSON.stringify(publicState)).not.toMatch(/private|99999999/);
});
it('validates and canonicalises URL multi-selections without accepting unknown fields', () => {
  const parsed = dealListQuerySchema.parse({
    conditions: 'open_box,new,open_box',
    prices: 'under-5000',
  });
  expect(parsed.conditions).toEqual(['new', 'open_box']);
  expect(dealListQuerySchema.safeParse({ conditions: 'broken' }).success).toBe(
    false,
  );
  expect(
    dealListQuerySchema.safeParse({ locationId: 'anything' }).success,
  ).toBe(false);
  expect(dealListQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
});
