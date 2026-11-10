import { PrivateGate } from '../../components/private-gate';
import { Wallet } from '../../components/private-screens';
export default function Page() {
  return (
    <PrivateGate title="Your wallet">
      <Wallet />
    </PrivateGate>
  );
}
