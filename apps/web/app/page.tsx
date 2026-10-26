import {
  BuyerPage,
  BuyerGrid,
  CategoryTile,
  BuyerStack,
  BuyerLink,
  EmptyState,
} from '@auction-ng/ui/web';
import { publicCategories, publicLots } from '../lib/catalogue';
import { CatalogueGrid } from '../components/catalogue-grid';
import { BuyerGuide } from '../components/buyer-guide';

export default async function Home() {
  const [lots, categories] = await Promise.allSettled([
    publicLots({ limit: 24 }),
    publicCategories(),
  ]);
  const closing =
    lots.status === 'fulfilled'
      ? lots.value.items.filter(
          (lot) =>
            lot.status !== 'scheduled' &&
            Date.parse(lot.endsAt) > Date.parse(lots.value.serverTime) &&
            Date.parse(lot.endsAt) - Date.parse(lots.value.serverTime) <=
              900000,
        )
      : [];
  const items = lots.status === 'fulfilled' ? lots.value.items : [];
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' });
  const today =
    lots.status === 'fulfilled'
      ? day.format(new Date(lots.value.serverTime))
      : '';
  const endingToday = items.filter(
    (lot) => day.format(new Date(lot.endsAt)) === today,
  );
  const newToday = items.filter(
    (lot) => day.format(new Date(lot.createdAt)) === today,
  );
  return (
    <BuyerPage
      title="Today’s auctions"
      description="Returns, overstock and shelf pulls. Check the condition, place your bid and collect your win."
    >
      <BuyerStack>
        <section>
          <h2>Closing now</h2>
          <p>
            Lots in their final minutes appear here. A late bid gives everyone
            more time.
          </p>
          {closing.length ? (
            <CatalogueGrid lots={closing} rail />
          ) : (
            <EmptyState title="No lots closing right now">
              Check the scheduled auctions below.
            </EmptyState>
          )}
        </section>
        <section>
          <h2>Browse by category</h2>
          <BuyerGrid>
            {categories.status === 'fulfilled' ? (
              categories.value.items.map((category) => (
                <CategoryTile
                  key={category.id}
                  href={`/categories/${category.id}`}
                  name={category.name}
                  image={
                    items.find((lot) => lot.categoryId === category.id)
                      ?.thumbnail?.thumbnailUrl
                  }
                />
              ))
            ) : (
              <BuyerLink href="/categories">Load categories</BuyerLink>
            )}
          </BuyerGrid>
        </section>
        <section>
          <h2>Ending today</h2>
          {endingToday.length ? (
            <CatalogueGrid lots={endingToday.slice(0, 8)} />
          ) : (
            <p>
              No published lots ending today. Check the next auctions below.
            </p>
          )}
        </section>
        <section>
          <h2>New today</h2>
          {newToday.length ? (
            <CatalogueGrid lots={newToday.slice(0, 8)} />
          ) : (
            <p>New lots will appear here after staff publish them.</p>
          )}
        </section>
        <section>
          <h2>Browse auctions</h2>
          {lots.status === 'fulfilled' ? (
            lots.value.items.length ? (
              <CatalogueGrid lots={lots.value.items} />
            ) : (
              <EmptyState title="The next auctions are being prepared">
                Published lots will appear here with their condition and pickup
                location.
              </EmptyState>
            )
          ) : (
            <EmptyState
              title="Auctions could not be loaded"
              action={<BuyerLink href="/">Reload auctions</BuyerLink>}
            >
              Check your connection and try again.
            </EmptyState>
          )}
        </section>
        <BuyerGuide />
      </BuyerStack>
    </BuyerPage>
  );
}
