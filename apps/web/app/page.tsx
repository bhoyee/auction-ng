import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getImageProps } from 'next/image';
import { Gavel, Wallet } from '@auction-ng/ui/web/icons';
import { AppBanner, PromoCard } from '@auction-ng/ui/web/marketplace-sections';
import { PromoCarousel } from '@auction-ng/ui/web/promo-carousel';
import { publicMarketplace } from '../lib/catalogue';
import { catalogueCards } from '../components/catalogue-grid';
import { HomeAuctions } from '../components/home-auctions';
import { FirstVisitGuide } from '../components/first-visit-guide';
import { HomeFaq } from '@auction-ng/ui/web/home-faq';

export default async function Home() {
  const slideArtwork = [1, 2, 3].map((number) => {
    const filename = `slide-${number}.png`;
    return existsSync(join(process.cwd(), 'public', 'banners', filename))
      ? `/banners/${filename}`
      : undefined;
  });
  const catalogue = await publicMarketplace().catch(() => null);
  const items = catalogue?.items ?? [];
  const categories = catalogue?.categories ?? [];
  const demo = items.some((lot) => lot.lotNumber.startsWith('DEMO-'));
  const heroPhoto = (src: string, alt: string, priority: boolean) => {
    const heroMatch = src.match(/^\/demo\/hero-.+-(\d+)\.webp$/);
    const responsiveHero = heroMatch !== null;
    const heroWidths = heroMatch
      ? [...new Set([640, 1280, Number(heroMatch[1])])]
          .filter((width) => width <= Number(heroMatch[1]))
          .sort((a, b) => a - b)
      : [];
    const { props: imageProps } = getImageProps({
      src,
      alt,
      width: 960,
      height: 720,
      sizes: '(max-width: 767px) 45vw, (max-width: 1100px) 55vw, 544px',
      loading: priority ? 'eager' : 'lazy',
      fetchPriority: priority ? 'high' : 'auto',
      unoptimized: responsiveHero || !src.startsWith('/'),
    });
    // Hero derivatives are encoded once from high-resolution sources; avoid
    // recompressing catalogue thumbnails or serving a desktop file to every phone.
    const props = responsiveHero
      ? {
          ...imageProps,
          srcSet: heroWidths
            .map(
              (width) =>
                `${src.replace(/-\d+\.webp$/, `-${width}.webp`)} ${width}w`,
            )
            .join(', '),
        }
      : imageProps;
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
      category: /phone/i,
      eyebrow: 'Phones & accessories',
      title: 'Big upgrade. Smart move.',
      description: 'Find your next phone. Choose your bid. Make it yours.',
      action: 'Explore phones',
      photo: 'hero-phone-hq-1920.webp',
      alt: 'Smartphone standing upright against a blue studio backdrop',
    },
    {
      category: /electronic/i,
      eyebrow: 'Join Auction NG',
      title: 'Bid. Win. Save.',
      description: 'Sign up and get in on the auction.',
      action: 'Join now',
      photo: 'hero-owner-signup-1376.webp',
      alt: 'Laptop, tablets, smartphone and smartwatch arranged together on a desk',
    },
    {
      category: /electronic/i,
      eyebrow: 'Your next find starts here',
      title: 'Bid. Win. Make it yours.',
      description:
        'Get in on the auction. Discover something you love, then bid on your terms.',
      action: 'Explore auctions',
      photo: 'hero-accessories-hq-1920.webp',
      alt: 'Smartphone, smartwatch, wireless earbuds and mouse in a clean studio arrangement',
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
              eyebrow: promotion.eyebrow,
              title: promotion.title,
              description: promotion.description,
              action: promotion.action,
              href:
                index === 1
                  ? '/sign-up'
                  : index === 2
                    ? '/deals'
                    : category
                      ? `/categories/${category.id}`
                      : '/deals',
              tone: 'indigo' as const,
              signup: index === 1,
              cutout: Boolean(slideArtwork[index]),
              image: heroPhoto(
                slideArtwork[index] ??
                  (demo
                    ? `/demo/${promotion.photo}`
                    : (lot?.thumbnail?.url ??
                      '/placeholders/photo-pending.svg')),
                slideArtwork[index]
                  ? 'Featured products for this promotion'
                  : demo
                    ? promotion.alt
                    : (lot?.title ?? 'Product photos are being prepared'),
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
      <FirstVisitGuide />
      <HomeAuctions
        initialLots={catalogueCards(items)}
        serverTime={catalogue?.serverTime ?? new Date().toISOString()}
      />
      <AppBanner />
      <HomeFaq />
    </main>
  );
}
