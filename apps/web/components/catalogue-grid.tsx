import type { CatalogueLot } from '@auction-ng/shared/catalogue-schemas';
import { ClientCatalogueGrid } from './client-catalogue-grid';
export type CardLot = Pick<
  CatalogueLot,
  | 'id'
  | 'categoryId'
  | 'lotNumber'
  | 'title'
  | 'condition'
  | 'status'
  | 'startPriceKobo'
  | 'retailPriceKobo'
  | 'bidCount'
  | 'endsAt'
  | 'isTopDeal'
  | 'topDealOrder'
> & {
  fixedPriceKobo?: number | null;
  location: Pick<CatalogueLot['location'], 'name'>;
  thumbnail: { thumbnailUrl: string } | null;
  secondImage?: string;
};
export function catalogueCards(lots: CatalogueLot[]): CardLot[] {
  return lots.map((lot) => ({
    id: lot.id,
    fixedPriceKobo: lot.fixedPriceKobo,
    categoryId: lot.categoryId,
    lotNumber: lot.lotNumber,
    title: lot.title,
    condition: lot.condition,
    status: lot.status,
    startPriceKobo: lot.startPriceKobo,
    retailPriceKobo: lot.retailPriceKobo,
    bidCount: lot.bidCount,
    endsAt: lot.endsAt,
    isTopDeal: lot.isTopDeal,
    topDealOrder: lot.topDealOrder,
    location: { name: lot.location.name },
    thumbnail: lot.thumbnail
      ? { thumbnailUrl: lot.thumbnail.thumbnailUrl }
      : null,
    ...(lot.secondaryThumbnailUrl
      ? { secondImage: lot.secondaryThumbnailUrl }
      : {}),
  }));
}
export function CatalogueGrid({
  lots,
  rail,
  columns,
  serverTime,
  topDealsOnly,
}: {
  lots: CatalogueLot[];
  rail?: boolean;
  columns?: 3 | 4;
  serverTime?: string;
  topDealsOnly?: boolean;
}) {
  const cards = catalogueCards(lots);
  return (
    <ClientCatalogueGrid
      lots={cards}
      rail={rail}
      columns={columns}
      serverTime={serverTime}
      topDealsOnly={topDealsOnly}
    />
  );
}
