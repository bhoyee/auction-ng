import { notFound } from 'next/navigation';
import { buyerResourceIdSchema } from '@auction-ng/shared/buyer-schemas';
import { PrivateGate } from '../../../../components/private-gate';
import { Invoice } from '../../../../components/invoice';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!buyerResourceIdSchema.safeParse(id).success) notFound();
  return (
    <PrivateGate title="Your invoice">
      <Invoice id={id} pass />
    </PrivateGate>
  );
}
