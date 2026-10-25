import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  resolveBid,
  prepareBidSchema,
  type AuctionState,
} from '../packages/shared/src';

const empty: AuctionState = {
  startPriceKobo: 50000,
  currentPriceKobo: null,
  leader: null,
  endsAt: 1000000,
};
const automaticLeader: AuctionState = {
  ...empty,
  currentPriceKobo: 50000,
  leader: { bidderId: 'a', maxKobo: 1000000 },
};
it('defaults new preparations to direct and requires an explicit automatic choice', () => {
  const input = { maxKobo: 500000, idempotencyKey: randomUUID() };
  expect(prepareBidSchema.parse(input).mode).toBe('direct');
  expect(prepareBidSchema.parse({ ...input, mode: 'automatic' }).mode).toBe(
    'automatic',
  );
  for (const mode of ['proxy', '', null, 1])
    expect(prepareBidSchema.safeParse({ ...input, mode }).success).toBe(false);
});
it.each([
  [empty, 'a', 500000, undefined, 500000, 'a'],
  [empty, 'a', 1000000, 'automatic', 50000, 'a'],
  [automaticLeader, 'b', 500000, 'direct', 510000, 'a'],
  [automaticLeader, 'b', 1000000, 'direct', 1000000, 'a'],
  [automaticLeader, 'b', 1200000, 'direct', 1200000, 'b'],
  [automaticLeader, 'b', 1200000, 'automatic', 1010000, 'b'],
  [automaticLeader, 'a', 1200000, 'direct', 1200000, 'a'],
  [automaticLeader, 'a', 1200000, 'automatic', 50000, 'a'],
  [
    { ...automaticLeader, currentPriceKobo: 1000000 },
    'b',
    1025000,
    'direct',
    1025000,
    'b',
  ],
  [
    { ...automaticLeader, currentPriceKobo: 1000000 },
    'b',
    1200000,
    'automatic',
    1025000,
    'b',
  ],
] as const)(
  'resolves mixed-mode case %# without changing the submitted state',
  (state, bidderId, maxKobo, mode, price, winner) => {
    const before = structuredClone(state);
    const result = resolveBid(state, { bidderId, maxKobo, mode }, 1);
    expect(result.currentPriceKobo).toBe(price);
    expect(result.leader?.bidderId).toBe(winner);
    expect(state).toEqual(before);
  },
);
it('rejects equal or below-increment direct bids and does not lower an active commitment', () => {
  const state = resolveBid(empty, { bidderId: 'a', maxKobo: 500000 }, 1);
  for (const maxKobo of [499999, 500000, 524999])
    expect(() => resolveBid(state, { bidderId: 'b', maxKobo }, 2)).toThrow();
  expect(() =>
    resolveBid(state, { bidderId: 'a', maxKobo: 500001 }, 2),
  ).toThrow();
  expect(() =>
    resolveBid(automaticLeader, { bidderId: 'a', maxKobo: 500000 }, 2),
  ).toThrow();
});
