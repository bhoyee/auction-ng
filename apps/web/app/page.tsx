import { getImageProps } from 'next/image';
import { Gavel, Wallet } from '@auction-ng/ui/web/icons';
import {
  AppBanner,
  ClosingBand,
  HowItWorks,
  PromoCard,
  SectionHeading,
  TrustStrip,
} from '@auction-ng/ui/web/marketplace-sections';
import { BuyerGrid } from '@auction-ng/ui/web/buyer-grids';
import { CategoryTile } from '@auction-ng/ui/web/buyer';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { PromoCarousel } from '@auction-ng/ui/web/promo-carousel';
import { publicMarketplace } from '../lib/catalogue';
import { CatalogueGrid } from '../components/catalogue-grid';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const catalogue = await publicMarketplace().catch(() => null);
  const items = catalogue?.items ?? [];
  const categories = catalogue?.categories ?? [];
  const demo = items.some((lot) => lot.lotNumber.startsWith('DEMO-'));
  const now = Date.parse(catalogue?.serverTime ?? new Date().toISOString());
  const closing = items
    .filter(
      (lot) =>
        lot.status !== 'scheduled' &&
        Date.parse(lot.endsAt) > now &&
        Date.parse(lot.endsAt) - now <= 1200000,
    )
    .slice(0, 6);
  const selectedCategory = categories.find(
    (category) => category.id === params.categoryId,
  )?.id;
  const deals = items
    .filter((lot) => !selectedCategory || lot.categoryId === selectedCategory)
    .sort(
      (a, b) =>
        (b.retailPriceKobo - b.startPriceKobo) /
          Math.max(1, b.retailPriceKobo) -
        (a.retailPriceKobo - a.startPriceKobo) / Math.max(1, a.retailPriceKobo),
    )
    .slice(0, 6);
  const under = items.filter((lot) => lot.startPriceKobo < 1000000).slice(0, 6);
  const phones = categories.find((category) => /phone/i.test(category.name));
  const kitchen = categories.find((category) => /kitchen/i.test(category.name));
  const heroPhoto = (src: string, alt: string, priority = false) => {
    const { props } = getImageProps({
      src,
      alt,
      width: 600,
      height: 450,
      sizes: '(max-width: 767px) 42vw, (max-width: 1100px) 30vw, 380px',
      loading: priority ? 'eager' : 'lazy',
      fetchPriority: priority ? 'high' : 'auto',
      unoptimized: !src.startsWith('/'),
    });
    return (
      <>
        {priority && (
          <link
            rel="preload"
            as="image"
            imageSrcSet={props.srcSet}
            imageSizes={props.sizes}
            fetchPriority="high"
          />
        )}
        <img {...props} decoding={priority ? 'sync' : 'async'} />
      </>
    );
  };
  return (
    <main className="agn-home">
      <div className="agn-container agn-hero-grid">
        <PromoCarousel
          slides={[
            {
              title: 'Great finds. Better prices.',
              description:
                'Discover electronics, home essentials and everyday favourites. Choose your lot. Set your price.',
              action: 'Explore today’s auctions',
              href: '/ending-soon',
              image: heroPhoto(
                demo
                  ? '/demo/electronics-display.webp'
                  : (items[0]?.thumbnail?.url ??
                      '/placeholders/photo-pending.svg'),
                demo
                  ? 'Headphones from the sample electronics collection'
                  : (items[0]?.title ?? 'Product photos are being prepared'),
                true,
              ),
            },
            {
              title: 'A fresh find for your kitchen.',
              description:
                'From morning coffee to dinner prep. Browse the condition, compare the retail estimate and bid your way.',
              action: 'Shop kitchen lots',
              href: kitchen ? `/categories/${kitchen.id}` : '/categories',
              tone: 'yellow',
              image: heroPhoto(
                demo
                  ? '/demo/kitchen-display.webp'
                  : (items[1]?.thumbnail?.url ??
                      '/placeholders/photo-pending.svg'),
                'Kitchen product collection',
              ),
            },
            {
              title: 'Your next upgrade starts here.',
              description:
                'Find phones and accessories with a price you choose. Review every fee before placing your bid.',
              action: 'Find your upgrade',
              href: phones ? `/categories/${phones.id}` : '/categories',
              image: heroPhoto(
                demo
                  ? '/demo/phones-display.webp'
                  : (items[2]?.thumbnail?.url ??
                      '/placeholders/photo-pending.svg'),
                'Phone collection',
              ),
            },
          ]}
        />
        <div className="agn-hero-side">
          <PromoCard
            title="Small price. Big possibilities."
            description="Find starting bids under ₦10,000."
            href="/ending-soon?maxPriceKobo=999999"
            yellow
          >
            <Wallet size={48} strokeWidth={1.2} aria-hidden="true" />
          </PromoCard>
          <PromoCard
            title="First time bidding?"
            description="Get to know the market in three simple steps."
            href="/help"
          >
            <Gavel size={48} strokeWidth={1.2} aria-hidden="true" />
          </PromoCard>
        </div>
      </div>
      {closing.length > 0 && (
        <ClosingBand>
          <CatalogueGrid
            lots={closing}
            rail
            serverTime={catalogue?.serverTime}
          />
        </ClosingBand>
      )}
      <TrustStrip demo={demo} />
      {items.length ? (
        <>
          <section id="top-deals" className="agn-container agn-section">
            <SectionHeading
              title="Top deals"
              description="Compare starting bids with retail estimates. Final auction prices vary."
              href="/categories"
            />
            <nav className="agn-filter-pills" aria-label="Top deals categories">
              <a
                href="/#top-deals"
                aria-current={!selectedCategory ? 'page' : undefined}
              >
                All categories
              </a>
              {categories.map((category) => (
                <a
                  key={category.id}
                  href={`/?${new URLSearchParams({ categoryId: category.id })}#top-deals`}
                  aria-current={
                    selectedCategory === category.id ? 'page' : undefined
                  }
                >
                  {category.name}
                </a>
              ))}
            </nav>
            <CatalogueGrid
              lots={deals}
              columns={3}
              serverTime={catalogue?.serverTime}
            />
          </section>
          <section className="agn-container agn-section">
            <SectionHeading
              title="Ending soon"
              description="See something you like? Keep an eye on the clock."
              href="/ending-soon"
            />
            <nav
              className="agn-filter-pills"
              aria-label="Ending soon categories"
            >
              <a href="/ending-soon">All lots</a>
              {categories.slice(0, 5).map((category) => (
                <a
                  key={category.id}
                  href={`/ending-soon?${new URLSearchParams({ categoryId: category.id })}`}
                >
                  {category.name}
                </a>
              ))}
            </nav>
            <CatalogueGrid
              lots={
                items.slice(6, 12).length
                  ? items.slice(6, 12)
                  : items.slice(0, 6)
              }
              columns={3}
              serverTime={catalogue?.serverTime}
            />
          </section>
          {under.length > 0 && (
            <section className="agn-container agn-section">
              <SectionHeading
                title="Starting under ₦10,000"
                description="Everyday essentials with room for a good find."
                href="/ending-soon?maxPriceKobo=999999"
              />
              <nav
                className="agn-filter-pills"
                aria-label="Starting under ten thousand categories"
              >
                <a href="/ending-soon?maxPriceKobo=999999">
                  All lots under ₦10,000
                </a>
                {categories
                  .filter((category) =>
                    under.some((lot) => lot.categoryId === category.id),
                  )
                  .map((category) => (
                    <a
                      key={category.id}
                      href={`/ending-soon?${new URLSearchParams({ categoryId: category.id, maxPriceKobo: '999999' })}`}
                    >
                      {category.name}
                    </a>
                  ))}
              </nav>
              <CatalogueGrid
                lots={under}
                columns={3}
                serverTime={catalogue?.serverTime}
              />
            </section>
          )}
        </>
      ) : (
        <section className="agn-container agn-section">
          <EmptyState
            title={
              catalogue
                ? 'The next auctions are being prepared'
                : 'Auctions could not be loaded'
            }
            action={
              <a href="/" className="agn-button agn-button--secondary">
                Reload auctions
              </a>
            }
          >
            Published lots appear here with photos, condition notes and pickup
            information.
          </EmptyState>
        </section>
      )}
      <section className="agn-container agn-section">
        <SectionHeading
          title="Shop by category"
          description="Something for your home, your work and your everyday."
          href="/categories"
        />
        <BuyerGrid>
          {categories.map((category) => (
            <CategoryTile
              key={category.id}
              href={`/categories/${category.id}`}
              name={category.name}
              count={category.activeLotCount}
              image={
                items.find((lot) => lot.categoryId === category.id)?.thumbnail
                  ?.thumbnailUrl
              }
            />
          ))}
        </BuyerGrid>
      </section>
      <HowItWorks />
      <AppBanner />
    </main>
  );
}
