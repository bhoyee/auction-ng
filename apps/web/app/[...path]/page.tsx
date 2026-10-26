import { notFound } from 'next/navigation';
import { buyerResourceIdSchema } from '@auction-ng/shared';
import { catalogueListQuerySchema } from '@auction-ng/shared/catalogue-schemas';
import {
  BuyerLink,
  BuyerPanel,
  BuyerStack,
  CategoryTile,
} from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerGrid } from '@auction-ng/ui/web/buyer-grids';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import {
  CatalogueFilters,
  Breadcrumbs,
} from '@auction-ng/ui/web/marketplace-sections';
import {
  publicCategories,
  publicLocations,
  publicLots,
  publicMarketplace,
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
    const catalogue = await publicMarketplace();
    return (
      <BuyerPage title="Browse categories">
        <BuyerGrid>
          {catalogue.categories.length ? (
            catalogue.categories.map((category) => (
              <CategoryTile
                key={category.id}
                href={`/categories/${category.id}`}
                name={category.name}
                count={category.activeLotCount}
                image={
                  catalogue.items.find((lot) => lot.categoryId === category.id)
                    ?.thumbnail?.thumbnailUrl
                }
              />
            ))
          ) : (
            <EmptyState title="Categories are being prepared">
              Check back when the first auctions are published.
            </EmptyState>
          )}
        </BuyerGrid>
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
    const filters = catalogueListQuerySchema.safeParse({
      limit: '24',
      cursor,
      ...(section === 'categories'
        ? { categoryId: id }
        : { endingSoon: 'true' }),
      ...(typeof query.locationId === 'string' && query.locationId
        ? { locationId: query.locationId }
        : {}),
      ...(typeof query.maxPriceKobo === 'string' && query.maxPriceKobo
        ? { maxPriceKobo: query.maxPriceKobo }
        : {}),
    });
    if (!filters.success)
      return (
        <BuyerPage title="Check your filters">
          <EmptyState
            title="These filters could not be applied"
            action={
              <BuyerLink
                href={
                  section === 'categories'
                    ? `/categories/${id}`
                    : '/ending-soon'
                }
              >
                Clear filters
              </BuyerLink>
            }
          >
            Choose a pickup location and price from the filter controls.
          </EmptyState>
        </BuyerPage>
      );
    const [lots, categories, locations] = await Promise.all([
      publicLots(filters.data),
      publicCategories(),
      publicLocations(),
    ]);
    const category = categories.items.find((value) => value.id === id);
    if (section === 'categories' && !category) notFound();
    const nextQuery = new URLSearchParams();
    if (filters.data.locationId)
      nextQuery.set('locationId', filters.data.locationId);
    if (filters.data.maxPriceKobo !== undefined)
      nextQuery.set('maxPriceKobo', String(filters.data.maxPriceKobo));
    if (lots.nextCursor) nextQuery.set('cursor', lots.nextCursor);
    return (
      <BuyerPage
        title={category?.name ?? 'Ending soon'}
        description={
          category?.activeLotCount !== undefined
            ? `${category.activeLotCount} open lots. Find something worth bidding for.`
            : 'Auctions closing within the next hour. Check the clock and find your next bid.'
        }
      >
        <BuyerStack>
          <Breadcrumbs
            items={[
              { label: 'Auctions', href: '/' },
              { label: 'Categories', href: '/categories' },
              { label: category?.name ?? 'Ending soon' },
            ]}
          />
          <CatalogueFilters
            action={
              section === 'categories' ? `/categories/${id}` : '/ending-soon'
            }
            locations={locations.items}
            locationId={filters.data.locationId}
            maximum={
              filters.data.maxPriceKobo === undefined
                ? ''
                : String(filters.data.maxPriceKobo)
            }
          />
          {lots.items.length ? (
            <CatalogueGrid lots={lots.items} serverTime={lots.serverTime} />
          ) : (
            <EmptyState
              title="No auctions here yet"
              action={<BuyerLink href="/">Browse all auctions</BuyerLink>}
            >
              Try another category or check again later.
            </EmptyState>
          )}
          {lots.nextCursor && (
            <BuyerLink href={`?${nextQuery}`}>Next page</BuyerLink>
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
              verified email are required to bid.
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
