import { PrivateGate } from '../../components/private-gate';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { BuyerLink } from '@auction-ng/ui/web/buyer';
export default function Page() {
  return (
    <PrivateGate title="Shipments">
      <BuyerPage title="Shipments">
        <EmptyState
          title="Collection is available now"
          action={
            <BuyerLink href="/awaiting-pickup">
              View orders awaiting pickup
            </BuyerLink>
          }
        >
          Delivery and shipment tracking are not available yet. Collect paid
          orders from the location shown on each invoice.
        </EmptyState>
      </BuyerPage>
    </PrivateGate>
  );
}
