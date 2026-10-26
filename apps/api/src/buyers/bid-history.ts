import { acceptedBidEventSchema } from '@auction-ng/shared';
import { hashPii } from '../security/pii';
export function bidHistoryPrice(result: unknown, lotId: string) {
  const event = acceptedBidEventSchema.parse(result);
  // Never return the request amount: a losing automatic request may equal its private maximum.
  return {
    currentPriceKobo: event.state.currentPriceKobo,
    bidderLabel: `Buyer ${hashPii(`${lotId}:${event.state.leader.bidderId}`, 'bid-history').slice(0, 6).toUpperCase()}`,
  };
}
