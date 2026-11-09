import { PrivateGate } from '../../components/private-gate';
import { PurchaseHistory } from '../../components/purchase-history';
export default function Page() {
  return (
    <PrivateGate title="Purchase history">
      <PurchaseHistory />
    </PrivateGate>
  );
}
