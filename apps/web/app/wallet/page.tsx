import { PrivateGate } from '../../components/private-gate';
import { Wallet } from '../../components/wallet';
export default function Page() {
  return (
    <PrivateGate title="Your wallet">
      <Wallet />
    </PrivateGate>
  );
}
