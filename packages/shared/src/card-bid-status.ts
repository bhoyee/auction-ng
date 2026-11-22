// No zod here: buyer pages import this rule into every card bundle.
export type CardBidStatus = 'Winning' | 'Outbid' | 'Won' | 'Lost';

/**
 * One rule for web and mobile cards (owner decision 2026-11-22). Live
 * positions come only from a connected realtime state, so a reconnecting
 * card shows no pill rather than a stale one. `sawLead` covers a bid placed
 * moments ago that is not persisted yet: the buyer led, so losing the lead
 * later means outbid.
 */
export function cardBidStatus(input: {
  state?: 'bidding' | 'won' | 'lost';
  live: boolean;
  isLeader?: boolean;
  sawLead?: boolean;
}): CardBidStatus | undefined {
  if (input.state === 'won') return 'Won';
  if (input.state === 'lost') return 'Lost';
  if (!input.live) return undefined;
  if (input.isLeader) return 'Winning';
  return input.state === 'bidding' || input.sawLead ? 'Outbid' : undefined;
}
