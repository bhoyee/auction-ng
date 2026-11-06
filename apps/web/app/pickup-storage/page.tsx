import { PrivateGate } from '../../components/private-gate';
import { PickupStorage } from '../../components/pickup-storage';
export default function Page() {
  return (
    <PrivateGate title="Pickup storage">
      <PickupStorage />
    </PrivateGate>
  );
}
