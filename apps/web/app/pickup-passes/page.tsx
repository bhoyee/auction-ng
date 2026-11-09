import { BuyerHistory } from '../../components/buyer-history';
import { PrivateGate } from '../../components/private-gate';
export default function Page() {
  return (
    <PrivateGate title="Pickup passes">
      <BuyerHistory kind="invoices" pickup />
    </PrivateGate>
  );
}
