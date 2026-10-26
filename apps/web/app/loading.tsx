import { BuyerGrid, BuyerPage, LotCardSkeleton } from '@auction-ng/ui/web';
export default function Loading() {
  return (
    <BuyerPage title="Loading auctions">
      <BuyerGrid>
        {Array.from({ length: 4 }, (_, index) => (
          <LotCardSkeleton key={index} />
        ))}
      </BuyerGrid>
    </BuyerPage>
  );
}
