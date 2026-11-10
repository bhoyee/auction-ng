import { PrivateGate } from '../../components/private-gate';
import { Account } from '../../components/private-screens';
export default function Page() {
  return (
    <PrivateGate title="Your account">
      <Account />
    </PrivateGate>
  );
}
