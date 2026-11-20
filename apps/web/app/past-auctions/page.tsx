import Link from 'next/link';
import { pageQuerySchema } from '@auction-ng/shared/catalogue-schemas';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerGrid } from '@auction-ng/ui/web/buyer-grids';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { PastAuctionCard } from '@auction-ng/ui/web/past-auction-card';
import { publicPastAuctions } from '../../lib/catalogue';

export const metadata = { title: 'Past Deals | GiddyDeal' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = pageQuerySchema.safeParse(params);
  if (!parsed.success)
    return (
      <BuyerPage title="Past Deals">
        <EmptyState
          title="This page link is invalid"
          action={<Link href="/past-auctions">Return to Past Deals</Link>}
        >
          Open Past Deals again to see the latest completed purchases.
        </EmptyState>
      </BuyerPage>
    );
  const page = await publicPastAuctions(parsed.data.cursor);
  return (
    <BuyerPage
      title="Past Deals"
      description="Successfully purchased lots. Unsold and unpaid deals are not listed."
    >
      {page.items.length ? (
        <BuyerGrid>
          {page.items.map((lot) => (
            <PastAuctionCard
              key={lot.id}
              title={lot.title}
              reference={lot.lotNumber}
              priceKobo={lot.finalPriceKobo}
              endsAt={lot.endsAt}
              image={lot.thumbnail?.thumbnailUrl}
            />
          ))}
        </BuyerGrid>
      ) : (
        <EmptyState
          title="No completed purchases to show"
          action={<Link href="/search">Explore current deals</Link>}
        >
          Paid deal results will appear here after purchases are completed.
        </EmptyState>
      )}
      {page.nextCursor && (
        <nav
          className="agn-past-auction-pagination"
          aria-label="Past deals pages"
        >
          <Link
            href={`/past-auctions?cursor=${encodeURIComponent(page.nextCursor)}`}
          >
            View older purchases
          </Link>
        </nav>
      )}
    </BuyerPage>
  );
}
