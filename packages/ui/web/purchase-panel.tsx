import type { ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import { formatNaira } from '@auction-ng/shared/money';
export function PurchasePanel({ children }: { children: ReactNode }) {
  return (
    <section className="agn-purchase-panel" aria-label="Instant purchase">
      <h2>
        <Trophy size={22} aria-hidden="true" /> Instant win
      </h2>
      {children}
    </section>
  );
}
export function PurchaseTotal({
  priceKobo,
  taxKobo,
  feeKobo,
  totalKobo,
}: {
  priceKobo: number;
  taxKobo: number;
  feeKobo: number;
  totalKobo: number;
}) {
  return (
    <dl className="agn-purchase-total">
      <div>
        <dt>Fixed item price</dt>
        <dd>{formatNaira(priceKobo)}</dd>
      </div>
      <div>
        <dt>Tax (7.5%)</dt>
        <dd>{formatNaira(taxKobo)}</dd>
      </div>
      <div>
        <dt>Processing charge</dt>
        <dd>{formatNaira(feeKobo)}</dd>
      </div>
      <div>
        <dt>Total to pay</dt>
        <dd>{formatNaira(totalKobo)}</dd>
      </div>
    </dl>
  );
}
