import { BuyerLink } from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
export default function NotFound() {
  return (
    <BuyerPage narrow title="Page not found">
      <EmptyState
        title="This link is no longer available"
        action={<BuyerLink href="/">Browse auctions</BuyerLink>}
      >
        Check the address, or search for the item using the search box above.
      </EmptyState>
    </BuyerPage>
  );
}
