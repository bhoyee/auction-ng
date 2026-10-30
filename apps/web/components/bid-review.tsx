'use client';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Toast } from '@auction-ng/ui/web/toast';
import { Button } from '@auction-ng/ui/web/button';
import { BuyerLink, BuyerStack, MoneyLine } from '@auction-ng/ui/web/buyer';
import { formatNaira } from '@auction-ng/shared/money';
import type { calculateInvoiceLine } from '@auction-ng/shared/fees';

export function BidReview({
  fee,
  direct,
  amount,
  message,
  messageTone = 'error',
  shortfall,
  busy,
  disabled,
  pendingOperation,
  onClose,
  onConfirm,
  onCancelled,
  onBusyChange,
  onMessageChange,
}: {
  fee: ReturnType<typeof calculateInvoiceLine> | null;
  direct: boolean;
  amount: number;
  message: string;
  messageTone?: 'success' | 'error';
  shortfall: number;
  busy: boolean;
  disabled: boolean;
  pendingOperation: { cancel: () => Promise<unknown> } | null;
  onClose: () => void;
  onConfirm: () => void;
  onCancelled: () => void;
  onBusyChange: (busy: boolean) => void;
  onMessageChange: (message: string, tone?: 'success' | 'error') => void;
}) {
  const pending = pendingOperation !== null;
  async function cancel() {
    if (!pendingOperation || busy) return;
    onBusyChange(true);
    try {
      const value = await pendingOperation.cancel();
      const { cancelBidResultSchema } =
        await import('@auction-ng/shared/bid-schemas');
      const result = cancelBidResultSchema.parse(value);
      if (result.status === 'ready') {
        onMessageChange(
          'This bid is still being checked. Retry its result shortly.',
        );
        return;
      }
      onMessageChange(
        result.status === 'accepted'
          ? 'This bid was accepted. Check your current live position.'
          : 'This bid is no longer pending. Check your wallet and live price before bidding again.',
        result.status === 'accepted' ? 'success' : 'error',
      );
      onCancelled();
    } catch {
      onMessageChange(
        'The bid could not be checked. Reconnect and retry this same operation.',
      );
    } finally {
      onBusyChange(false);
    }
  }
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
        {message && (
          <Toast
            emphasis
            tone={messageTone}
            onClose={() => onMessageChange('')}
          >
            {message}
          </Toast>
        )}
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
          <Button variant="secondary" busy={busy} onClick={() => void cancel()}>
            Check or cancel pending bid
          </Button>
        )}
      </BuyerStack>
    </Dialog>
  );
}
