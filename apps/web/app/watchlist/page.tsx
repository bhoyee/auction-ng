import { PrivateGate } from '../../components/private-gate';
import { Watchlist } from '../../components/watchlist';
export default function Page() {
  return (
    <PrivateGate title="Your activity">
      <Watchlist />
    </PrivateGate>
  );
}
