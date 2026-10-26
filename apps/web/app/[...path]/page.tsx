import { notFound } from 'next/navigation';
import { buyerResourceIdSchema } from '@auction-ng/shared';
import {
  BuyerLink,
  BuyerPage,
  BuyerPanel,
  BuyerRow,
  BuyerStack,
  EmptyState,
} from '@auction-ng/ui/web';
import {
  publicCategories,
  publicLocations,
  publicLots,
} from '../../lib/catalogue';
import { CatalogueGrid } from '../../components/catalogue-grid';

export default async function BuyerRoute({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path } = await params;
  const [section, id] = path;
  if (section === 'categories' && !id) {
    const categories = await publicCategories();
    return (
      <BuyerPage title="Browse categories">
        <BuyerRow>
          {categories.items.length ? (
            categories.items.map((category) => (
              <BuyerLink key={category.id} href={`/categories/${category.id}`}>
                {category.name}
              </BuyerLink>
            ))
          ) : (
            <EmptyState title="Categories are being prepared">
              Check back when the first auctions are published.
            </EmptyState>
          )}
        </BuyerRow>
      </BuyerPage>
    );
  }
  if (
    section === 'ending-soon' ||
    (section === 'categories' &&
      id &&
      buyerResourceIdSchema.safeParse(id).success &&
      path.length === 2)
  ) {
    const query = await searchParams;
    const cursor =
      typeof query.cursor === 'string' &&
      /^[A-Za-z0-9_-]{1,2048}$/.test(query.cursor)
        ? query.cursor
        : undefined;
    const lots = await publicLots({
      limit: 24,
      cursor,
      ...(section === 'categories' ? { categoryId: id } : { endingSoon: true }),
    });
    return (
      <BuyerPage
        title={section === 'categories' ? 'Category auctions' : 'Ending soon'}
        description="Browse lots and check their condition. Sign in to follow live bidding."
      >
        <BuyerStack>
          {lots.items.length ? (
            <CatalogueGrid lots={lots.items} />
          ) : (
            <EmptyState
              title="No auctions here yet"
              action={<BuyerLink href="/">Browse all auctions</BuyerLink>}
            >
              Try another category or check again later.
            </EmptyState>
          )}
          {lots.nextCursor && (
            <BuyerLink href={`?cursor=${encodeURIComponent(lots.nextCursor)}`}>
              Next page
            </BuyerLink>
          )}
        </BuyerStack>
      </BuyerPage>
    );
  }
  if (section === 'locations' && path.length === 1) {
    const locations = await publicLocations();
    return (
      <BuyerPage
        narrow
        title="Pickup locations"
        description="Each lot identifies its pickup warehouse. Confirm the location before you bid."
      >
        <BuyerStack>
          {locations.items.length ? (
            locations.items.map((location) => (
              <BuyerPanel key={location.id}>
                <h2>{location.name}</h2>
                <p>
                  Use your paid invoice and private pickup pass when collecting.
                  Confirm opening hours with the warehouse before travelling.
                </p>
              </BuyerPanel>
            ))
          ) : (
            <EmptyState title="Pickup locations are being prepared">
              Location details will be published alongside auctions.
            </EmptyState>
          )}
        </BuyerStack>
      </BuyerPage>
    );
  }
  if (section === 'help' && path.length === 1)
    return (
      <BuyerPage narrow title="How bidding works">
        <BuyerStack>
          <BuyerPanel>
            <h2>Fund your wallet</h2>
            <p>
              Pay by card or bank transfer. The Paystack processing fee and the
              net wallet credit are shown before payment. A funded wallet and
              verified phone are required to bid.
            </p>
          </BuyerPanel>
          <BuyerPanel>
            <h2>Choose how to bid</h2>
            <p>
              Direct bidding is the default: the full amount becomes the price
              if you lead. Choose an automatic spending limit only if you want
              us to bid up to your private maximum. Both reserve enough wallet
              funds for the bid and auction fees.
            </p>
          </BuyerPanel>
          <BuyerPanel>
            <h2>Review the total and collect your win</h2>
            <p>
              Review the hammer price, buyer premium, lot fee and VAT before
              confirming. Being outbid releases your reservation. A late bid
              extends the closing time. A confirmed paid win gives you an
              invoice and private QR pickup pass.
            </p>
          </BuyerPanel>
        </BuyerStack>
      </BuyerPage>
    );
  notFound();
}
