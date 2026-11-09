import { PrivateGate } from '../../components/private-gate';
import { AwaitingPickup } from '../../components/awaiting-pickup';
export default function Page() {
  return (
    <PrivateGate title="Awaiting pickup">
      <AwaitingPickup />
    </PrivateGate>
  );
}
