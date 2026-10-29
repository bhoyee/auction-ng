import { PrivateGate } from '../../components/private-gate';
import { BuyerHistory } from '../../components/buyer-history';
export default function Page() {
  return (
    <PrivateGate title="Awaiting pickup">
      <BuyerHistory kind="collections" />
    </PrivateGate>
  );
}
