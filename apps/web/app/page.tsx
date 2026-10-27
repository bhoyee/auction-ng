import { getImageProps } from 'next/image';
import { formatNaira } from '@auction-ng/shared/money';
import { Gavel, Wallet } from '@auction-ng/ui/web/icons';
import {
  AppBanner,
  ClosingBand,
  PromoCard,
  SectionHeading,
} from '@auction-ng/ui/web/marketplace-sections';
import { ProductRail } from '@auction-ng/ui/web/product-rail';
import { CategoryTile } from '@auction-ng/ui/web/buyer';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { PromoCarousel } from '@auction-ng/ui/web/promo-carousel';
import { publicMarketplace } from '../lib/catalogue';
import { homeCollections } from '../lib/home-collections';
import { CatalogueGrid } from '../components/catalogue-grid';
import { FirstVisitGuide } from '../components/first-visit-guide';

export default async function Home() {
  const catalogue = await publicMarketplace().catch(() => null);
  const items = catalogue?.items ?? [];
  const categories = catalogue?.categories ?? [];
  const demo = items.some((lot) => lot.lotNumber.startsWith('DEMO-'));
  const { closing, deals, ending, under } = homeCollections(
    items,
    Date.parse(catalogue?.serverTime ?? new Date().toISOString()),
  );
  const heroPhoto = (src: string, alt: string, priority: boolean) => {
    const { props } = getImageProps({
      src,
      alt,
      width: 960,
      height: 720,
      sizes: '(max-width: 767px) 45vw, (max-width: 1100px) 55vw, 510px',
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
        <img {...props} decoding="async" />
      </>
    );
  };
  const promotions = [
    {
      category: /electronic/i,
      title: 'Your next great find.',
      description: 'Headphones, speakers and everyday upgrades.',
      action: 'Explore electronics',
      fallback: 'electronics',
    },
    {
      category: /kitchen/i,
      title: 'More for your kitchen.',
      description: 'Useful finds, from breakfast to dinner.',
      action: 'Shop kitchen lots',
      fallback: 'kitchen',
    },
    {
      category: /phone/i,
      title: 'Time for an upgrade.',
      description: 'Phones and accessories. Bid your way.',
      action: 'Explore phones',
      fallback: 'phones',
    },
  ];
  return (
    <main className="agn-home">
      <div className="agn-container agn-hero-grid">
        <PromoCarousel
          slides={promotions.map((promotion, index) => {
            const category = categories.find((entry) =>
              promotion.category.test(entry.name),
            );
            const lot = items.find(
              (entry) => entry.categoryId === category?.id,
            );
            return {
              title: promotion.title,
              description: promotion.description,
              priceLine: lot
                ? `Starting at ${formatNaira(lot.startPriceKobo)}`
                : undefined,
              action: promotion.action,
              href: category ? `/categories/${category.id}` : '/deals',
              tone: index === 1 ? ('yellow' as const) : ('indigo' as const),
              image: heroPhoto(
                demo
                  ? `/demo/${promotion.fallback}-display.webp`
                  : (lot?.thumbnail?.url ?? '/placeholders/photo-pending.svg'),
                lot?.title ?? 'Product photos are being prepared',
                index === 0,
              ),
            };
          })}
        />
        <div className="agn-hero-side">
          <PromoCard
            title="A little goes a long way."
            description="Starting bids under ₦10,000."
            href="/deals?maxPriceKobo=999999"
            yellow
          >
            <Wallet size={40} strokeWidth={1.4} aria-hidden="true" />
          </PromoCard>
          <PromoCard
            title="Make your first bid."
            description="See the fees. Choose your price."
            href="/help"
          >
            <Gavel size={40} strokeWidth={1.4} aria-hidden="true" />
          </PromoCard>
        </div>
      </div>
      {closing.length > 0 && (
        <ClosingBand>
          <ProductRail label="Closing now lots">
            <CatalogueGrid
              lots={closing}
              rail
              serverTime={catalogue?.serverTime}
            />
          </ProductRail>
        </ClosingBand>
      )}
      {categories.length > 0 && (
        <section className="agn-container agn-section agn-home-categories">
          <SectionHeading title="Shop by category" href="/categories" />
          <div className="agn-category-discovery">
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
          </div>
        </section>
      )}
      {items.length ? (
        <>
          {[
            {
              id: 'top-deals',
              title: 'Top deals',
              description:
                'Starting bids compared with retail estimates. Final prices vary.',
              href: '/deals',
              lots: deals,
            },
            {
              id: 'ending-soon',
              title: 'Next to close',
              description:
                'The earliest closing auctions. Check each countdown before bidding.',
            href: '/deals',
              lots: ending,
            },
            {
              id: 'under-ten-thousand',
              title: 'Starting under ₦10,000',
              description: 'Small starting prices. Plenty to discover.',
              href: '/deals?maxPriceKobo=999999',
              lots: under,
            },
          ]
            .filter((section) => section.lots.length > 0)
            .map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="agn-container agn-section agn-home-collection"
              >
                <SectionHeading
                  title={section.title}
                  description={section.description}
                  href={section.href}
                />
                <ProductRail label={section.title}>
                  <CatalogueGrid
                    lots={section.lots}
                    rail
                    serverTime={catalogue?.serverTime}
                  />
                </ProductRail>
              </section>
            ))}
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
      <FirstVisitGuide demo={demo} />
      <AppBanner />
    </main>
  );
}
