import { PrivateGate } from '../../components/private-gate';
import { PickupCheckIn } from '../../components/pickup-check-in';
export default function Page() {
  return (
    <PrivateGate title="Check-in">
      <PickupCheckIn />
    </PrivateGate>
  );
}
