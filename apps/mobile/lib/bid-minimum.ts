import {
  MIN_BID_INCREASE_KOBO,
  minNextBid,
} from '@auction-ng/shared/auction-rules';
import { addKobo } from '@auction-ng/shared/money';

/**
 * The lowest amount the bid button accepts (owner request 2026-11-22), so a
 * bid the server would refuse is never sent. Pre-bids need the starting
 * price. Live bids need the starting price before any bid, then more than
 * the current price. A leader raising their own bid must also go above
 * their existing limit. The server still validates every bid.
 */
export function bidEntryMinimum(input: {
  scheduled: boolean;
  startPriceKobo: number;
  currentPriceKobo: number | null;
  leaderCommitmentKobo?: number;
}): number {
  if (input.scheduled) return input.startPriceKobo;
  const next = minNextBid(input.startPriceKobo, input.currentPriceKobo);
  return input.leaderCommitmentKobo === undefined
    ? next
    : Math.max(
        next,
        addKobo(input.leaderCommitmentKobo, MIN_BID_INCREASE_KOBO),
      );
}
