import { PrivateGate } from '../../components/private-gate';
import { CustomerService } from '../../components/private-screens';
import { Suspense } from 'react';
import { BuyerSkeleton } from '@auction-ng/ui/web/buyer';
export default function Page() {
  return (
    <PrivateGate title="Customer service">
      <Suspense fallback={<BuyerSkeleton />}>
        <CustomerService />
      </Suspense>
    </PrivateGate>
  );
}
