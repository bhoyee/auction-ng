import { PrivateGate } from '../../../components/private-gate';
import { PaymentReturn } from '../../../components/payment-return';
export default function Page() {
  return (
    <PrivateGate title="Checking payment">
      <PaymentReturn />
    </PrivateGate>
  );
}
