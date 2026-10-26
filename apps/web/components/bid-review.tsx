'use client';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Button } from '@auction-ng/ui/web/button';
import { BuyerLink, BuyerStack, MoneyLine } from '@auction-ng/ui/web/buyer';
import { formatNaira } from '@auction-ng/shared/money';
import type { calculateInvoiceLine } from '@auction-ng/shared/fees';

export function BidReview({
  fee,
  direct,
  amount,
  message,
  shortfall,
  busy,
  disabled,
  pending,
  onClose,
  onConfirm,
  onCancel,
}: {
  fee: ReturnType<typeof calculateInvoiceLine> | null;
  direct: boolean;
  amount: number;
  message: string;
  shortfall: number;
  busy: boolean;
  disabled: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Confirm your bid"
      presentation="sheet"
    >
      <BuyerStack>
        {fee && (
          <>
            <MoneyLine
              label={direct ? 'Bid amount' : 'Maximum hammer price'}
              value={formatNaira(fee.hammerKobo)}
            />
            <MoneyLine
              label="Buyer premium"
              value={formatNaira(fee.premiumKobo)}
            />
            <MoneyLine label="Lot fee" value={formatNaira(fee.lotFeeKobo)} />
            <MoneyLine label="VAT on fees" value={formatNaira(fee.vatKobo)} />
            <MoneyLine
              label="Total reserved from your wallet"
              value={formatNaira(fee.totalKobo)}
              total
            />
          </>
        )}
        <p>
          Being outbid releases your reservation. Winning charges the final
          total. Late bids may extend this auction.
        </p>
        {message && <p role="status">{message}</p>}
        {shortfall > 0 && (
          <p>
            Your wallet needs another {formatNaira(shortfall)}.{' '}
            <BuyerLink href="/wallet">Add funds</BuyerLink>
          </p>
        )}
        <Button busy={busy} disabled={disabled} onClick={onConfirm}>
          {pending ? 'Retry this bid' : `Place bid ${formatNaira(amount)}`}
        </Button>
        {pending && (
          <Button variant="secondary" busy={busy} onClick={onCancel}>
            Check or cancel pending bid
          </Button>
        )}
      </BuyerStack>
    </Dialog>
  );
}
