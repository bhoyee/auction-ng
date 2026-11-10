import { BuyerHistory } from '../../components/private-screens';
import { PrivateGate } from '../../components/private-gate';
export default function Page() {
  return (
    <PrivateGate title="Pickup passes">
      <BuyerHistory kind="invoices" pickup />
    </PrivateGate>
  );
}
