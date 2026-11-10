import { PrivateGate } from '../../components/private-gate';
import { PickupCheckIn } from '../../components/private-screens';
export default function Page() {
  return (
    <PrivateGate title="Check-in">
      <PickupCheckIn />
    </PrivateGate>
  );
}
