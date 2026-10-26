import { notFound } from 'next/navigation';
import { buyerResourceIdSchema } from '@auction-ng/shared/buyer-schemas';
import { publicLot, publicLots } from '../../../lib/catalogue';
import { LotDetail } from '../../../components/lot-detail';
import { catalogueCards } from '../../../components/catalogue-grid';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!buyerResourceIdSchema.safeParse(id).success) notFound();
  const lot = await publicLot(id);
  const similar = await publicLots({
    categoryId: lot.categoryId,
    limit: 8,
  }).catch(() => null);
  return (
    <LotDetail
      lot={{
        id: lot.id,
        title: lot.title,
        lotNumber: lot.lotNumber,
        description: lot.description,
        condition: lot.condition,
        startPriceKobo: lot.startPriceKobo,
        retailPriceKobo: lot.retailPriceKobo,
        endsAt: lot.endsAt,
        category: { id: lot.category.id, name: lot.category.name },
        location: { name: lot.location.name },
        images: lot.images.map(({ url, thumbnailUrl }) => ({
          url,
          thumbnailUrl,
        })),
      }}
      similar={catalogueCards(
        similar?.items.filter((item) => item.id !== lot.id).slice(0, 6) ?? [],
      )}
      serverTime={similar?.serverTime}
    />
  );
}
