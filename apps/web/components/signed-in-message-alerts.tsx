'use client';
import dynamic from 'next/dynamic';
import { useBuyer } from '../lib/session';

// Message alerts only matter to a signed-in buyer; guests never download them.
const BuyerMessageAlerts = dynamic(
  () => import('./buyer-message-alerts').then((m) => m.BuyerMessageAlerts),
  { ssr: false },
);

export function SignedInMessageAlerts() {
  const { tokens } = useBuyer();
  return tokens?.user.role === 'buyer' ? <BuyerMessageAlerts /> : null;
}
