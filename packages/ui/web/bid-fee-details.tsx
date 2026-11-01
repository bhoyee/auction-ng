'use client';
import type { calculateInvoiceLine } from '@auction-ng/shared/fees';
import { formatNaira } from '@auction-ng/shared/money';
import { Dialog } from './dialog';
import { BuyerStack, MoneyLine } from './buyer';

export function BidFeeDetails({
  fee,
  direct,
  onClose,
}: {
  fee: ReturnType<typeof calculateInvoiceLine>;
  direct: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open title="Estimated bid fees" onClose={onClose}>
      <BuyerStack>
        <MoneyLine
          label={direct ? 'Bid amount' : 'Maximum hammer price'}
          value={formatNaira(fee.hammerKobo)}
        />
        <MoneyLine label="Buyer premium" value={formatNaira(fee.premiumKobo)} />
        <MoneyLine label="Lot fee" value={formatNaira(fee.lotFeeKobo)} />
        <MoneyLine label="VAT on fees" value={formatNaira(fee.vatKobo)} />
        <MoneyLine
          label="Estimated total including fees"
          value={formatNaira(fee.totalKobo)}
          total
        />
        <p className="agn-detail-bid-notice">
          This shows the reservation for your entered amount. You will review it
          again before confirming. Winning charges the final total; being outbid
          releases the reservation.
        </p>
      </BuyerStack>
    </Dialog>
  );
}
