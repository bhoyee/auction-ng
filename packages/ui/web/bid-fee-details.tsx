'use client';
import type { calculateInvoiceLine } from '@auction-ng/shared/fees';
import { DEFAULT_FEE_RULES } from '@auction-ng/shared/fees';
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
        <MoneyLine
          label={`Buyer premium (${DEFAULT_FEE_RULES.premiumBps / 100}%)`}
          value={formatNaira(fee.premiumKobo)}
        />
        <MoneyLine label="Lot fee" value={formatNaira(fee.lotFeeKobo)} />
        <MoneyLine
          label={`VAT on fees (${DEFAULT_FEE_RULES.vatBps / 100}%)`}
          value={formatNaira(fee.vatKobo)}
        />
        <MoneyLine
          label="Estimated total including fees"
          value={formatNaira(fee.totalKobo)}
          total
        />
        <p className="agn-detail-bid-notice">
          Buyer premium is Auction NG’s auction service charge on the winning
          bid. VAT here applies to the buyer premium plus the lot fee.
        </p>
        <p className="agn-detail-bid-notice">
          This shows the reservation for your entered amount. You will review it
          again before confirming. Winning charges the final total; being outbid
          releases the reservation.
        </p>
      </BuyerStack>
    </Dialog>
  );
}
