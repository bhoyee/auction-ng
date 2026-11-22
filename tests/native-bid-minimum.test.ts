import { describe, expect, it } from 'vitest';
import { bidEntryMinimum } from '../apps/mobile/lib/bid-minimum';

describe('native bid button minimum', () => {
  it.each([
    ['pre-bid needs the starting price', true, 50000, null, undefined, 50000],
    ['pre-bid ignores a live price', true, 50000, 90000, undefined, 50000],
    [
      'first live bid may equal the start',
      false,
      50000,
      null,
      undefined,
      50000,
    ],
    [
      'later bids beat the price by a kobo',
      false,
      50000,
      90000,
      undefined,
      90001,
    ],
    ['leader must beat their own limit', false, 50000, 90000, 150000, 150001],
    ['leader limit below the next bid', false, 50000, 90000, 80000, 90001],
  ] as const)(
    '%s',
    (_label, scheduled, start, current, commitment, expected) => {
      expect(
        bidEntryMinimum({
          scheduled,
          startPriceKobo: start,
          currentPriceKobo: current,
          leaderCommitmentKobo: commitment,
        }),
      ).toBe(expected);
    },
  );
});
