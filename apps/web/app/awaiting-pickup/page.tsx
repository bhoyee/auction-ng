import { PrivateGate } from '../../components/private-gate';
import { AwaitingPickup } from '../../components/private-screens';
export default function Page() {
  return (
    <PrivateGate title="Awaiting pickup">
      <AwaitingPickup />
    </PrivateGate>
  );
}
