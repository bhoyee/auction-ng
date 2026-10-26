import { notFound } from 'next/navigation';
import { buyerResourceIdSchema } from '@auction-ng/shared/buyer-schemas';
import { publicLot } from '../../../lib/catalogue';
import { LotDetail } from '../../../components/lot-detail';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!buyerResourceIdSchema.safeParse(id).success) notFound();
  return <LotDetail lot={await publicLot(id)} />;
}
