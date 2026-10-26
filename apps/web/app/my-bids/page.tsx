import { PrivateGate } from '../../components/private-gate';
import { MyBids } from '../../components/my-bids';
export default function Page() {
  return (
    <PrivateGate title="My bids">
      <MyBids />
    </PrivateGate>
  );
}
