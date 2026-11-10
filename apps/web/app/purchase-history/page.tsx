import { PrivateGate } from '../../components/private-gate';
import { PurchaseHistory } from '../../components/private-screens';
export default function Page() {
  return (
    <PrivateGate title="Purchase history">
      <PurchaseHistory />
    </PrivateGate>
  );
}
