import { PrivateGate } from '../../components/private-gate';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerLink } from '@auction-ng/ui/web/buyer';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
export default function Page() {
  return (
    <PrivateGate title="Check-in">
      <BuyerPage title="Check-in">
        <EmptyState
          title="Online check-in is not available yet"
          action={
            <BuyerLink href="/awaiting-pickup">View awaiting pickup</BuyerLink>
          }
        >
          When you arrive, speak to staff at the collection desk. Open your
          pickup pass from Awaiting pickup. This page does not register your
          arrival or mark your order as collected.
        </EmptyState>
      </BuyerPage>
    </PrivateGate>
  );
}
