'use client';
import { BuyerLink, BuyerPanel } from '@auction-ng/ui/web/buyer';
import { useBuyer } from '../lib/session';
export function BuyerGuide() {
  const { tokens } = useBuyer();
  if (tokens) return null;
  return (
    <BuyerPanel>
      <h2>How it works</h2>
      <p>
        Top up your wallet, bid on a lot, then collect from its warehouse if you
        win. The total, including auction fees, is shown before you confirm.
      </p>
      <BuyerLink href="/help">Read the bidding guide</BuyerLink>
    </BuyerPanel>
  );
}
