import { PrivateGate } from '../../components/private-gate';
import { BuyerHistory } from '../../components/private-screens';
export default function Page() {
  return (
    <PrivateGate title="Your activity">
      <BuyerHistory kind="invoices" />
    </PrivateGate>
  );
}
