import { catalogueListQuerySchema } from '@auction-ng/shared/catalogue-schemas';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerLink } from '@auction-ng/ui/web/buyer';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { CatalogueGrid } from '../../components/catalogue-grid';
import { publicLots } from '../../lib/catalogue';
export const metadata = { title: 'Top Deals | Auction NG' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const input = catalogueListQuerySchema.safeParse({
    ...params,
    topDeals: 'true',
    limit: '24',
  });
  if (!input.success)
    return (
      <BuyerPage title="Top Deals">
        <EmptyState
          title="This page link is invalid"
          action={<BuyerLink href="/top-deals">Open Top Deals</BuyerLink>}
        >
          Open Top Deals again to see the current selection.
        </EmptyState>
      </BuyerPage>
    );
  const lots = await publicLots(input.data);
  const nextQuery = new URLSearchParams(
    Object.entries(input.data).flatMap(([key, value]) =>
      key !== 'cursor' && value !== undefined ? [[key, String(value)]] : [],
    ),
  );
  if (lots.nextCursor) nextQuery.set('cursor', lots.nextCursor);
  return (
    <BuyerPage
      title="Top Deals"
      description="Selected by our team. See the condition notes and total cost before bidding."
    >
      {lots.items.length ? (
        <CatalogueGrid
          lots={lots.items}
          serverTime={lots.serverTime}
          topDealsOnly
        />
      ) : (
        <EmptyState
          title="New deals are being selected"
          action={<BuyerLink href="/search">Explore all auctions</BuyerLink>}
        >
          Our next selection will appear here. Lots in their final 20 minutes
          are in Closing now.
        </EmptyState>
      )}
      {lots.nextCursor && (
        <BuyerLink href={`/top-deals?${nextQuery}`}>More Top Deals</BuyerLink>
      )}
    </BuyerPage>
  );
}
