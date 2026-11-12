import { PrivateGate } from '../../components/private-gate';
import { MyBids } from '../../components/private-screens';
export default function Page() {
  return (
    <PrivateGate title="My bids">
      <MyBids />
    </PrivateGate>
  );
}
