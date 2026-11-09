import { notFound } from 'next/navigation';
import { buyerResourceIdSchema } from '@auction-ng/shared/buyer-schemas';
import { PrivateGate } from '../../../../components/private-gate';
import { PickupCheckIn } from '../../../../components/pickup-check-in';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!buyerResourceIdSchema.safeParse(id).success) notFound();
  return (
    <PrivateGate title="Your invoice">
      <PickupCheckIn />
    </PrivateGate>
  );
}
