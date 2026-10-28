export const merchandisingRules = {
  closingWindowMs: 20 * 60 * 1000,
  maxOrder: 9999,
  roles: ['admin'],
  editableStatuses: ['draft', 'scheduled', 'open', 'closing'],
} as const;

export function topDealEligible(
  lot: { isTopDeal?: boolean; status: string; endsAt: string },
  now: number,
) {
  return (
    lot.isTopDeal === true &&
    (lot.status === 'open' || lot.status === 'closing') &&
    Date.parse(lot.endsAt) - now > merchandisingRules.closingWindowMs
  );
}
