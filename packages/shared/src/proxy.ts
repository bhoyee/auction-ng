import {
  bidIncrement,
  DEFAULT_INCREMENT_TIERS,
  minNextBid,
  softCloseEnd,
  SOFT_CLOSE_MS,
  DEFAULT_BID_MODE,
  type BidMode,
  type IncrementTier,
} from './auction-rules';
import { assertKobo, fromLedgerKobo } from './money';

export type MaximumBid = Readonly<{ bidderId: string; maxKobo: number }>;
export type AuctionState = Readonly<{
  startPriceKobo: number;
  currentPriceKobo: number | null;
  leader: MaximumBid | null;
  endsAt: number;
}>;
export class InvalidBidError extends Error {}

export function resolveBid(
  state: AuctionState,
  newBid: MaximumBid & { mode?: BidMode },
  serverTime: number,
  tiers: readonly IncrementTier[] = DEFAULT_INCREMENT_TIERS,
  softCloseMs = SOFT_CLOSE_MS,
): AuctionState {
  assertKobo(state.startPriceKobo);
  assertKobo(newBid.maxKobo);
  const direct = (newBid.mode ?? DEFAULT_BID_MODE) === 'direct';
  const submitted = { bidderId: newBid.bidderId, maxKobo: newBid.maxKobo };
  if (!newBid.bidderId.trim())
    throw new InvalidBidError('A bidder is required.');
  const endsAt = softCloseEnd(serverTime, state.endsAt, softCloseMs);
  const { leader, currentPriceKobo } = state;
  if ((leader === null) !== (currentPriceKobo === null))
    throw new InvalidBidError('Inconsistent auction state.');
  if (leader !== null && currentPriceKobo !== null) {
    assertKobo(currentPriceKobo);
    assertKobo(leader.maxKobo);
    if (
      currentPriceKobo < state.startPriceKobo ||
      leader.maxKobo < currentPriceKobo ||
      !leader.bidderId.trim()
    )
      throw new InvalidBidError('Inconsistent leader maximum.');
    if (leader.bidderId === newBid.bidderId) {
      if (newBid.maxKobo <= leader.maxKobo)
        throw new InvalidBidError('Raise your existing maximum.');
      if (
        direct &&
        newBid.maxKobo <
          minNextBid(state.startPriceKobo, currentPriceKobo, tiers)
      )
        throw new InvalidBidError('Bid is below the minimum next bid.');
      return {
        ...state,
        currentPriceKobo: direct ? newBid.maxKobo : currentPriceKobo,
        leader: submitted,
        endsAt,
      };
    }
  }
  if (
    newBid.maxKobo < minNextBid(state.startPriceKobo, currentPriceKobo, tiers)
  )
    throw new InvalidBidError('Bid is below the minimum next bid.');
  if (leader === null || currentPriceKobo === null)
    return {
      ...state,
      currentPriceKobo: direct ? newBid.maxKobo : state.startPriceKobo,
      leader: submitted,
      endsAt,
    };
  const increment = BigInt(bidIncrement(currentPriceKobo, tiers));
  const challengerWins = newBid.maxKobo > leader.maxKobo;
  const winner = challengerWins ? submitted : leader;
  const loser = challengerWins ? leader : newBid;
  // Cap in bigint before converting: the losing maximum plus increment can overflow.
  const candidate = BigInt(loser.maxKobo) + increment;
  const price =
    candidate < BigInt(winner.maxKobo) ? candidate : BigInt(winner.maxKobo);
  return {
    ...state,
    currentPriceKobo:
      direct && challengerWins ? newBid.maxKobo : fromLedgerKobo(price),
    leader: { ...winner },
    endsAt,
  };
}
