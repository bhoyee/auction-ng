import { BuyerGrid } from '@auction-ng/ui/web/buyer-grids';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { LotCardSkeleton } from '@auction-ng/ui/web/auction';
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
