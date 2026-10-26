'use client';
import { productImageSource } from './demo-image';
import { Button } from './controls';
import { Dialog } from './feedback';
import { NairaText } from './auction';
import { formatNaira } from '@auction-ng/shared/money';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  ShieldCheck,
  Banknote,
  PackageCheck,
  Truck,
  Wallet,
  Gavel,
  MapPin,
  Smartphone,
  Headphones,
  Laptop,
  CookingPot,
  Armchair,
  Shirt,
  Sparkles,
  Drill,
  Blocks,
  Dumbbell,
  BriefcaseBusiness,
  Grid2X2,
} from 'lucide-react';

export const categoryIcons = [
  Headphones,
  Smartphone,
  Laptop,
  CookingPot,
  CookingPot,
  Armchair,
  Shirt,
  Sparkles,
  Drill,
  Blocks,
  Dumbbell,
  BriefcaseBusiness,
];
function categoryIcon(name: string) {
  const lower = name.toLowerCase();
  const index = [
    'electronics',
    'phone',
    'computer',
    'appliance',
    'kitchen',
    'furniture',
    'fashion',
    'beauty',
    'tool',
    'children',
    'sport',
    'office',
  ].findIndex((part) => lower.includes(part));
  return categoryIcons[index] ?? Grid2X2;
}
export type MarketplaceCategory = {
  id: string;
  name: string;
  image?: string;
  count?: number;
};

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav className="agn-breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 && <span aria-hidden="true"> / </span>}
          {item.href ? (
            <a href={item.href}>{item.label}</a>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
export function CatalogueToolbar({ children }: { children: ReactNode }) {
  return <div className="agn-catalogue-toolbar">{children}</div>;
}
export function CatalogueFilters({
  action,
  categories = [],
  locations = [],
  categoryId = '',
  locationId = '',
  maximum = '',
  query,
}: {
  action: string;
  categories?: { id: string; name: string }[];
  locations?: { id: string; name: string }[];
  categoryId?: string;
  locationId?: string;
  maximum?: string;
  query?: string;
}) {
  return (
    <form
      className="agn-catalogue-toolbar"
      action={action}
      method="get"
      aria-label="Filter auctions"
    >
      {query !== undefined && <input type="hidden" name="q" value={query} />}
      {categories.length > 0 && (
        <label>
          Category
          <select name="categoryId" defaultValue={categoryId}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Pickup location
        <select name="locationId" defaultValue={locationId}>
          <option value="">All locations</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Starting bid
        <select name="maxPriceKobo" defaultValue={maximum}>
          <option value="">Any price</option>
          <option value="999999">Under ₦10,000</option>
          <option value="4999999">Under ₦50,000</option>
          <option value="9999999">Under ₦100,000</option>
          <option value="49999999">Under ₦500,000</option>
        </select>
      </label>
      <Button type="submit">Apply filters</Button>
      <a
        className="agn-section-action"
        href={
          query !== undefined
            ? `${action}?${new URLSearchParams({ q: query })}`
            : action
        }
      >
        Clear filters
      </a>
    </form>
  );
}
export function ProductGallery({
  images,
  title,
}: {
  images: { url: string; thumbnailUrl: string }[];
  title: string;
}) {
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const image = images[selected];
  return (
    <div className="agn-product-gallery">
      <button
        type="button"
        className="agn-gallery-main"
        onClick={() => setZoom(true)}
        aria-label={`Enlarge photo of ${title}`}
        disabled={!image || failed}
      >
        {image ? (
          <img
            key={`${selected}-${attempt}`}
            src={productImageSource(image.url)}
            alt={title}
            width={960}
            height={720}
            fetchPriority="high"
            onError={() => setFailed(true)}
          />
        ) : (
          <span>Photo pending</span>
        )}
        <span className="agn-gallery-zoom-label">View larger</span>
      </button>
      {failed && (
        <div role="alert">
          <p>
            This photo could not be loaded. Check your connection and try again.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          >
            Reload photo
          </Button>
        </div>
      )}
      <div className="agn-gallery-thumbnails" aria-label="Product photos">
        {images.map((item, index) => (
          <button
            type="button"
            key={item.url}
            aria-label={`Photo ${index + 1}`}
            aria-pressed={selected === index}
            onClick={() => {
              setSelected(index);
              setFailed(false);
            }}
          >
            <img
              src={productImageSource(item.thumbnailUrl)}
              alt=""
              width={80}
              height={60}
              loading="lazy"
            />
          </button>
        ))}
      </div>
      <Dialog title={title} open={zoom} onClose={() => setZoom(false)}>
        {image && (
          <img
            className="agn-gallery-zoom-image"
            src={productImageSource(image.url)}
            alt={title}
            width={960}
            height={720}
          />
        )}
      </Dialog>
    </div>
  );
}
export function CategoryStrip({
  categories,
}: {
  categories: MarketplaceCategory[];
}) {
  return (
    <nav className="agn-category-strip" aria-label="Shop categories">
      <div className="agn-container">
        <div className="agn-mobile-categories">
          <CategoryMenu categories={categories} />
        </div>
        {categories.map((category) => {
          const Icon = categoryIcon(category.name);
          return (
            <a key={category.id} href={`/categories/${category.id}`}>
              <Icon size={18} aria-hidden="true" />
              {category.name}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
export function CategoryMenu({
  categories,
}: {
  categories: MarketplaceCategory[];
}) {
  return (
    <details
      className="agn-menu agn-category-menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}
    >
      <summary>
        <Grid2X2 size={19} aria-hidden="true" />
        All categories
      </summary>
      <div className="agn-mega-menu">
        {categories.map((category) => {
          const Icon = categoryIcon(category.name);
          return (
            <a
              key={category.id}
              href={`/categories/${category.id}`}
              onClick={(event) => {
                const details = event.currentTarget.closest('details');
                if (details) details.open = false;
              }}
            >
              {category.image && (
                <img
                  src={productImageSource(category.image)}
                  alt=""
                  width={64}
                  height={48}
                  loading="lazy"
                />
              )}
              <Icon size={18} aria-hidden="true" />
              <span>
                {category.name}
                {category.count !== undefined && (
                  <small>{category.count} open lots</small>
                )}
              </span>
            </a>
          );
        })}
      </div>
    </details>
  );
}
export function MarketplaceHeader({
  categories,
  search,
  actions,
}: {
  categories: MarketplaceCategory[];
  search: ReactNode;
  actions: ReactNode;
}) {
  return (
    <header className="agn-market-header">
      <div className="agn-container agn-market-header-inner">
        <a href="/" className="agn-wordmark" aria-label="Auction NG home">
          Auction<span>NG</span>
          <span className="agn-wordmark-dot" aria-hidden="true" />
        </a>
        <CategoryMenu categories={categories} />
        {search}
        <div className="agn-header-actions">{actions}</div>
      </div>
    </header>
  );
}
export function Announcement({ children }: { children: ReactNode }) {
  return (
    <div className="agn-announcement">
      <div className="agn-container">{children}</div>
    </div>
  );
}
export function WalletSummary({
  available,
  held,
  total,
}: {
  available: number;
  held: number;
  total: number;
}) {
  return (
    <section className="agn-wallet-summary">
      <div>
        <span>Available to bid</span>
        <strong>
          <NairaText value={formatNaira(available)} />
        </strong>
        <small>Ready for your next find</small>
      </div>
      <div>
        <span>Reserved for bids</span>
        <strong>
          <NairaText value={formatNaira(held)} />
        </strong>
        <small>Released when you are outbid</small>
      </div>
      <div>
        <span>Total wallet balance</span>
        <strong>
          <NairaText value={formatNaira(total)} />
        </strong>
        <small>Available plus reserved funds</small>
      </div>
    </section>
  );
}
export function SectionHeading({
  title,
  description,
  href,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  children?: ReactNode;
}) {
  return (
    <div className="agn-section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
      {href && (
        <a href={href} className="agn-section-action">
          See all
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
export type PromoSlide = {
  title: string;
  description: string;
  action: string;
  href: string;
  image: ReactNode;
  tone?: 'yellow' | 'indigo';
};
export function PromoCarousel({ slides }: { slides: PromoSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [touch, setTouch] = useState<number>();
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (paused || hover || focus || reduced || slides.length < 2) return;
    const timer = setInterval(
      () => setIndex((value) => (value + 1) % slides.length),
      6000,
    );
    return () => clearInterval(timer);
  }, [paused, hover, focus, reduced, slides.length]);
  const select = (next: number) => {
    setPaused(true);
    setIndex((next + slides.length) % slides.length);
  };
  return (
    <section
      className="agn-promo-carousel"
      aria-label="Featured auctions"
      aria-roledescription="carousel"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false);
      }}
      onTouchStart={(event) => setTouch(event.changedTouches[0]?.clientX)}
      onTouchEnd={(event) => {
        const end = event.changedTouches[0]?.clientX;
        if (
          touch !== undefined &&
          end !== undefined &&
          Math.abs(end - touch) > 40
        )
          select(index + (end < touch ? 1 : -1));
        setTouch(undefined);
      }}
    >
      {slides.map((slide, position) => (
        <div
          key={slide.title}
          className={`agn-promo-slide agn-promo-slide--${slide.tone ?? 'indigo'}`}
          hidden={position !== index}
          role="group"
          aria-roledescription="slide"
          aria-label={`${position + 1} of ${slides.length}`}
        >
          <div className="agn-promo-copy">
            <span className="agn-promo-label">A better find, every day</span>
            <h1>{slide.title}</h1>
            <p>{slide.description}</p>
            <a href={slide.href} className="agn-button agn-promo-button">
              {slide.action}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>
          <div className="agn-promo-image">{slide.image}</div>
        </div>
      ))}
      <div className="agn-carousel-controls">
        <div className="agn-carousel-dots">
          {slides.map((slide, position) => (
            <button
              key={slide.title}
              type="button"
              aria-label={`Show promotion ${position + 1}`}
              aria-pressed={position === index}
              onClick={() => select(position)}
            >
              <span />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          disabled={reduced}
          aria-label={
            reduced
              ? 'Automatic promotions paused for reduced motion'
              : paused
                ? 'Play promotions'
                : 'Pause promotions'
          }
        >
          {paused || reduced ? <Play size={17} /> : <Pause size={17} />}
        </button>
        <button
          type="button"
          aria-label="Previous promotion"
          onClick={() => select(index - 1)}
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          aria-label="Next promotion"
          onClick={() => select(index + 1)}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  );
}
export function PromoCard({
  title,
  description,
  href,
  children,
  yellow = false,
}: {
  title: string;
  description: string;
  href: string;
  children?: ReactNode;
  yellow?: boolean;
}) {
  return (
    <a
      className={`agn-promo-card${yellow ? ' agn-promo-card--yellow' : ''}`}
      href={href}
    >
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        <span className="agn-promo-card-action">
          Explore
          <ArrowRight size={18} aria-hidden="true" />
        </span>
      </div>
      {children}
    </a>
  );
}
export function ClosingBand({ children }: { children: ReactNode }) {
  return (
    <section className="agn-closing-band">
      <div className="agn-container">
        <div className="agn-section-heading">
          <div>
            <h2>
              <span className="agn-live-dot" aria-hidden="true" />
              Closing now
            </h2>
            <p>Good finds. Last few minutes. Make your next bid count.</p>
          </div>
          <a className="agn-section-action" href="/ending-soon">
            See all
            <ArrowRight size={17} aria-hidden="true" />
          </a>
        </div>
        {children}
      </div>
    </section>
  );
}
export function TrustStrip({ demo = false }: { demo?: boolean }) {
  const items = [
    {
      icon: ShieldCheck,
      title: demo ? 'Representative demo photos' : 'See the actual item',
      text: demo ? 'Licensed product imagery' : 'Photos on every sale listing',
    },
    {
      icon: PackageCheck,
      title: 'Know the condition',
      text: demo ? 'Sample condition grades' : 'Read the inspection notes',
    },
    {
      icon: Banknote,
      title: 'Card or bank transfer',
      text: 'See fees before you pay',
    },
    {
      icon: Truck,
      title: 'Collect your win',
      text: 'Partner delivery comes later',
    },
  ];
  return (
    <section
      className="agn-trust-strip agn-container"
      aria-label="Buying with Auction NG"
    >
      {items.map(({ icon: Icon, title, text }) => (
        <div key={title}>
          <Icon size={26} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <strong>{title}</strong>
            <span>{text}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
export function HowItWorks() {
  const items = [
    {
      icon: Wallet,
      title: 'Top up',
      text: 'Choose card or bank transfer. Review the fee and exactly what reaches your wallet.',
    },
    {
      icon: Gavel,
      title: 'Bid your way',
      text: 'Place a direct bid or choose an automatic limit. Review your total before confirming.',
    },
    {
      icon: MapPin,
      title: 'Collect your find',
      text: 'Win, get your private pickup pass and collect from the lot’s warehouse.',
    },
  ];
  return (
    <section className="agn-how-it-works">
      <div className="agn-container">
        <SectionHeading
          title="Your next great find is three steps away"
          href="/help"
        />
        <div className="agn-steps">
          {items.map(({ icon: Icon, title, text }, index) => (
            <div key={title}>
              <span className="agn-step-icon">
                <Icon size={32} strokeWidth={1.5} aria-hidden="true" />
                <small>{index + 1}</small>
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
export function AuthLayout({
  title,
  description,
  children,
  image,
}: {
  title: string;
  description: string;
  children: ReactNode;
  image?: ReactNode;
}) {
  return (
    <div className="agn-auth-layout">
      <section className="agn-auth-form">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
          {children}
        </div>
      </section>
      <aside className="agn-auth-brand">
        <div className="agn-auth-collage">{image}</div>
        <h2>
          Great finds.
          <br />
          Your kind of price.
        </h2>
        <p>A little bidding. A lot of possibility.</p>
        <ul>
          <li>
            <ShieldCheck size={20} />
            Know the condition before bidding
          </li>
          <li>
            <Wallet size={20} />
            See your total before you confirm
          </li>
          <li>
            <PackageCheck size={20} />A private pickup pass for your wins
          </li>
        </ul>
      </aside>
    </div>
  );
}
export function AppBanner({ children }: { children?: ReactNode }) {
  return (
    <section className="agn-app-banner agn-container">
      <div>
        <span className="agn-promo-label">Finds that fit in your pocket</span>
        <h2>The market goes wherever you go.</h2>
        <p>
          Browse and bid from your phone today. Dedicated Android and iPhone
          apps are coming later.
        </p>
        <a href="/ending-soon" className="agn-button agn-promo-button">
          Explore the auctions
          <ArrowRight size={18} />
        </a>
        <p className="agn-app-availability">Android and iOS · Coming later</p>
      </div>
      <div className="agn-phone-preview">
        {children ?? (
          <>
            <div className="agn-phone-camera" />
            <span>Auction NG</span>
            <strong>Your next great find</strong>
            <img
              src="/demo/electronics-thumb.webp"
              alt="Headphones in the demo mobile website preview"
              width={240}
              height={180}
              loading="lazy"
            />
            <small>Mobile website preview</small>
          </>
        )}
      </div>
    </section>
  );
}
export function MarketplaceFooter({ demo = false }: { demo?: boolean }) {
  return (
    <footer className="agn-market-footer">
      <div className="agn-container">
        <div className="agn-footer-columns">
          <div>
            <a href="/" className="agn-wordmark">
              Auction<span>NG</span>
            </a>
            <p>
              Everyday things.
              <br />
              Unexpected prices.
            </p>
            <p>Daily liquidation auctions for Nigerian buyers.</p>
          </div>
          <div>
            <h2>Shop</h2>
            <a href="/categories">All categories</a>
            <a href="/ending-soon">Ending soon</a>
            <a href="/search?q=">Search auctions</a>
            <a href="/watchlist">Your watchlist</a>
          </div>
          <div>
            <h2>Help</h2>
            <a href="/help">How bidding works</a>
            <a href="/wallet">Wallet and payments</a>
            <a href="/invoices">Invoices and pickup</a>
            <a href="/account">Your account</a>
          </div>
          <div>
            <h2>Company and pickup</h2>
            <a href="/locations">Pickup locations</a>
            <p>
              {demo
                ? 'Demo hubs: Ikeja, Lekki and Abuja. Sample hours: Mon–Sat, 9am–5pm.'
                : 'Find the warehouse and opening hours on each lot before you bid.'}
            </p>
            <p>Partner delivery comes later.</p>
          </div>
          <div>
            <h2>Payments and legal</h2>
            <span>Paystack hosted checkout</span>
            <span>Bank transfer · Visa · Mastercard</span>
            <p>Provider fees are shown before funding.</p>
            <p>Launch terms and privacy notices are being prepared.</p>
          </div>
        </div>
        <div className="agn-footer-bottom">
          <small>© {new Date().getFullYear()} Auction NG</small>
          <small>
            {demo
              ? 'Demo only. Sample lots and licensed representative photos; no real goods offered.'
              : 'Check the lot’s condition and total before bidding.'}
          </small>
        </div>
      </div>
    </footer>
  );
}
