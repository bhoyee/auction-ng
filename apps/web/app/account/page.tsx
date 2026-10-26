import { PrivateGate } from '../../components/private-gate';
import { Account } from '../../components/account';
export default function Page() {
  return (
    <PrivateGate title="Your account">
      <Account />
    </PrivateGate>
  );
}
