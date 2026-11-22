import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  bidStatusInputSchema,
  bidStatusSchema,
} from '../packages/shared/src/bid-status-schemas';
import { cardBidStatus } from '../packages/shared/src/card-bid-status';

describe('cardBidStatus', () => {
  it.each([
    // state, live, isLeader, sawLead, expected
    [undefined, false, false, false, undefined],
    [undefined, true, false, false, undefined],
    [undefined, true, true, false, 'Winning'],
    [undefined, true, false, true, 'Outbid'],
    [undefined, false, false, true, undefined],
    ['bidding', true, true, false, 'Winning'],
    ['bidding', true, false, false, 'Outbid'],
    ['bidding', false, false, false, undefined],
    ['bidding', false, true, true, undefined],
    ['won', false, false, false, 'Won'],
    ['won', true, false, false, 'Won'],
    ['lost', false, false, false, 'Lost'],
    ['lost', true, true, true, 'Lost'],
  ] as const)(
    'state %s, live %s, leader %s, saw lead %s gives %s',
    (state, live, isLeader, sawLead, expected) => {
      expect(cardBidStatus({ state, live, isLeader, sawLead })).toBe(expected);
    },
  );
});

describe('bid status schemas', () => {
  it('accepts 1 to 50 lot ids and rejects unknown fields', () => {
    const id = randomUUID();
    expect(bidStatusInputSchema.safeParse({ lotIds: [id] }).success).toBe(true);
    expect(bidStatusInputSchema.safeParse({ lotIds: [] }).success).toBe(false);
    expect(
      bidStatusInputSchema.safeParse({
        lotIds: Array.from({ length: 51 }, () => randomUUID()),
      }).success,
    ).toBe(false);
    expect(
      bidStatusInputSchema.safeParse({ lotIds: [id], extra: 1 }).success,
    ).toBe(false);
    expect(
      bidStatusSchema.safeParse({ items: [{ lotId: id, state: 'pending' }] })
        .success,
    ).toBe(false);
  });
});
