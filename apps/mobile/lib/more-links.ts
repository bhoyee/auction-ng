export const guestMoreLinks = [
  { label: 'How Auction NG works', path: '/help#bidding' },
  { label: 'FAQs', path: '/help#faqs' },
  { label: 'Privacy', path: '/privacy-policy' },
  { label: 'Terms & Conditions', path: '/terms-of-use' },
] as const;

export const mobileSupportEmail =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || 'inof@auction.ng';
