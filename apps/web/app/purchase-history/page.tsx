import { PrivateGate } from '../../components/private-gate';
import { BuyerHistory } from '../../components/buyer-history';
export default function Page() {
  return (
    <PrivateGate title="Purchase history">
      <BuyerHistory kind="purchases" />
    </PrivateGate>
  );
}
