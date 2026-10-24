import { describe, expect, it } from 'vitest';
import {
  assertKobo,
  addKobo,
  formatNaira,
  toLedgerKobo,
  fromLedgerKobo,
} from '../packages/shared/src/money';
import {
  bidIncrement,
  minNextBid,
  softCloseEnd,
} from '../packages/shared/src/auction-rules';
import {
  calculateInvoiceLine,
  estimatedTotal,
} from '../packages/shared/src/fees';
import { resolveBid, type AuctionState } from '../packages/shared/src/proxy';

describe('integer kobo', () => {
  it.each([NaN, Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER + 1])(
    'rejects %s',
    (value) => {
      expect(() => assertKobo(value)).toThrow();
    },
  );
  it('converts exactly and rejects overflow', () => {
    expect(toLedgerKobo(123)).toBe(123n);
    expect(fromLedgerKobo(123n)).toBe(123);
    expect(() => fromLedgerKobo(-1n)).toThrow();
    expect(() => fromLedgerKobo(9007199254740992n)).toThrow();
    expect(addKobo(2, 3)).toBe(5);
    expect(() => addKobo(Number.MAX_SAFE_INTEGER, 1)).toThrow();
  });
  it.each([
    [0, '₦0'],
    [1250000, '₦12,500'],
    [1250001, '₦12,500.01'],
    [110, '₦1.10'],
    [Number.MAX_SAFE_INTEGER, '₦90,071,992,547,409.91'],
  ])('formats %s', (amount, expected) => {
    expect(formatNaira(Number(amount))).toBe(expected);
  });
});

describe('auction settings', () => {
  it.each([
    [0, 10000],
    [499999, 10000],
    [500000, 25000],
    [1999999, 25000],
    [2000000, 50000],
    [4999999, 50000],
    [5000000, 100000],
    [19999999, 100000],
    [20000000, 250000],
    [49999999, 250000],
    [50000000, 500000],
  ])('increment at %s', (price, increment) => {
    expect(bidIncrement(price)).toBe(increment);
  });
  it('supports configurable increments and minimums', () => {
    expect(bidIncrement(100, [{ fromKobo: 0, incrementKobo: 5 }])).toBe(5);
    expect(minNextBid(50000, null)).toBe(50000);
    expect(minNextBid(50000, 50000)).toBe(60000);
    expect(() => bidIncrement(0, [])).toThrow();
    expect(() =>
      bidIncrement(0, [{ fromKobo: 1, incrementKobo: 1 }]),
    ).toThrow();
    expect(() =>
      bidIncrement(0, [{ fromKobo: 0, incrementKobo: 0 }]),
    ).toThrow();
    expect(() =>
      bidIncrement(0, [
        { fromKobo: 0, incrementKobo: 1 },
        { fromKobo: 0, incrementKobo: 1 },
      ]),
    ).toThrow();
  });
  it('extends at the inclusive boundary, repeatedly, using server time', () => {
    expect(softCloseEnd(1000, 121001)).toBe(121001);
    expect(softCloseEnd(1000, 121000)).toBe(121000);
    expect(softCloseEnd(2000, 121000)).toBe(122000);
    expect(softCloseEnd(3000, 122000)).toBe(123000);
    expect(softCloseEnd(1000, 2000, 5000)).toBe(6000);
    expect(() => softCloseEnd(1000, 1000)).toThrow();
    expect(() => softCloseEnd(0, 1000, 0)).toThrow();
  });
});

describe('fees rounded half up once per charge', () => {
  it.each([
    [0, 0, 2250, 32250],
    [1, 0, 2250, 32251],
    [10, 2, 2250, 32262],
    [50000, 7500, 2813, 90313],
    [1250000, 187500, 16313, 1483813],
  ])('calculates %s kobo', (hammer, premium, vat, total) => {
    expect(calculateInvoiceLine(hammer)).toEqual({
      hammerKobo: hammer,
      premiumKobo: premium,
      lotFeeKobo: 30000,
      vatKobo: vat,
      totalKobo: total,
    });
    expect(estimatedTotal(hammer)).toBe(total);
  });
  it('supports configurable rates and fees with exact large products', () => {
    expect(
      estimatedTotal(10, { premiumBps: 500, lotFeeKobo: 0, vatBps: 0 }),
    ).toBe(11);
    expect(
      estimatedTotal(9007199254740991, {
        premiumBps: 0,
        lotFeeKobo: 0,
        vatBps: 0,
      }),
    ).toBe(9007199254740991);
    expect(() => estimatedTotal(Number.MAX_SAFE_INTEGER)).toThrow();
    expect(() =>
      estimatedTotal(1, { premiumBps: 10001, lotFeeKobo: 0, vatBps: 0 }),
    ).toThrow();
  });
});

const empty: AuctionState = {
  startPriceKobo: 50000,
  currentPriceKobo: null,
  leader: null,
  endsAt: 1000000,
};
const led: AuctionState = {
  ...empty,
  currentPriceKobo: 50000,
  leader: { bidderId: 'a', maxKobo: 100000 },
};
describe('proxy bids', () => {
  it('applies configured rules and soft close only to accepted bids', () => {
    const state = { ...empty, endsAt: 1000 };
    expect(
      resolveBid(
        state,
        { bidderId: 'a', maxKobo: 50000 },
        500,
        [{ fromKobo: 0, incrementKobo: 1 }],
        1000,
      ).endsAt,
    ).toBe(1500);
    const near = { ...led, endsAt: 1000 };
    expect(
      resolveBid(near, { bidderId: 'a', maxKobo: 100001 }, 500)
        .currentPriceKobo,
    ).toBe(50000);
    expect(
      resolveBid(near, { bidderId: 'a', maxKobo: 100001 }, 500).endsAt,
    ).toBe(120500);
    expect(() =>
      resolveBid(
        { ...led, leader: { bidderId: ' ', maxKobo: 100000 } },
        { bidderId: 'b', maxKobo: 150000 },
        1,
      ),
    ).toThrow();
    expect(() =>
      resolveBid(
        { ...led, currentPriceKobo: 1 },
        { bidderId: 'b', maxKobo: 150000 },
        1,
      ),
    ).toThrow();
  });
  it.each([
    [empty, 'a', 100000, 'a', 50000, 100000],
    [led, 'b', 150000, 'b', 110000, 150000],
    [led, 'b', 105000, 'b', 105000, 105000],
    [led, 'b', 80000, 'a', 90000, 100000],
    [led, 'b', 100000, 'a', 100000, 100000],
    [led, 'a', 150000, 'a', 50000, 150000],
  ] as const)(
    'resolves case %# without mutation',
    (state, bidderId, maxKobo, winner, price, max) => {
      const before = structuredClone(state);
      expect(resolveBid(state, { bidderId, maxKobo }, 1)).toEqual({
        ...state,
        currentPriceKobo: price,
        leader: { bidderId: winner, maxKobo: max },
      });
      expect(state).toEqual(before);
    },
  );
  it('rejects closed, below-minimum and non-increasing own maximum', () => {
    expect(() =>
      resolveBid(empty, { bidderId: 'a', maxKobo: 49999 }, 1),
    ).toThrow();
    expect(() =>
      resolveBid(led, { bidderId: 'b', maxKobo: 59999 }, 1),
    ).toThrow();
    expect(() =>
      resolveBid(led, { bidderId: 'a', maxKobo: 100000 }, 1),
    ).toThrow();
    expect(() =>
      resolveBid(led, { bidderId: 'a', maxKobo: 90000 }, 1),
    ).toThrow();
    expect(() =>
      resolveBid(led, { bidderId: 'b', maxKobo: 150000 }, 1000000),
    ).toThrow();
    expect(() =>
      resolveBid(
        { ...empty, currentPriceKobo: 50000 },
        { bidderId: 'a', maxKobo: 100000 },
        1,
      ),
    ).toThrow();
    expect(() =>
      resolveBid(
        { ...led, leader: { bidderId: 'a', maxKobo: 1 } },
        { bidderId: 'b', maxKobo: 100000 },
        1,
      ),
    ).toThrow();
    expect(() =>
      resolveBid(empty, { bidderId: '', maxKobo: 100000 }, 1),
    ).toThrow();
  });
  it('uses the increment at the current price and caps without overflowing', () => {
    const state = {
      ...led,
      currentPriceKobo: 499999,
      leader: { bidderId: 'a', maxKobo: 500000 },
    };
    expect(
      resolveBid(state, { bidderId: 'b', maxKobo: 600000 }, 1).currentPriceKobo,
    ).toBe(510000);
    const high = {
      ...led,
      currentPriceKobo: 50000,
      leader: { bidderId: 'a', maxKobo: Number.MAX_SAFE_INTEGER },
    };
    expect(
      resolveBid(high, { bidderId: 'b', maxKobo: Number.MAX_SAFE_INTEGER }, 1)
        .currentPriceKobo,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
});
