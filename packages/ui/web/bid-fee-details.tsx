'use client';
import type { calculateInvoiceLine } from '@auction-ng/shared/fees';
import { DEFAULT_FEE_RULES, type FeeRules } from '@auction-ng/shared/fees';
import { formatNaira } from '@auction-ng/shared/money';
import { Dialog } from './dialog';
import { BuyerStack, MoneyLine } from './buyer';

export function BidFeeDetails({
  fee,
  rules = DEFAULT_FEE_RULES,
  direct,
  onClose,
}: {
  fee: ReturnType<typeof calculateInvoiceLine>;
  direct: boolean;
  rules?: FeeRules;
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
          label={`Service charge (${rules.premiumBps / 100}%)`}
          value={formatNaira(fee.premiumKobo)}
        />
        <MoneyLine label="Lot fee" value={formatNaira(fee.lotFeeKobo)} />
        <MoneyLine
          label={`VAT on fees (${rules.vatBps / 100}%)`}
          value={formatNaira(fee.vatKobo)}
        />
        <MoneyLine
          label="Estimated total including fees"
          value={formatNaira(fee.totalKobo)}
          total
        />
        <p className="agn-detail-bid-notice">
          Service charge is Auction NG’s auction fee on the winning bid. VAT
          here applies to the service charge plus the lot fee.
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
