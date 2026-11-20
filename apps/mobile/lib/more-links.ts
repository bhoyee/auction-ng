export const guestMoreLinks = [
  { label: 'How GiddyDeal works', path: '/help#bidding' },
  { label: 'Privacy', path: '/privacy-policy' },
  { label: 'Terms & Conditions', path: '/terms-of-use' },
] as const;

export const mobileSupportEmail =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || 'inof@auction.ng';
