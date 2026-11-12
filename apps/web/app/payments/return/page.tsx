import { PrivateGate } from '../../../components/private-gate';
import { PaymentReturn } from '../../../components/private-screens';
export default function Page() {
  return (
    <PrivateGate title="Checking payment">
      <PaymentReturn />
    </PrivateGate>
  );
}
