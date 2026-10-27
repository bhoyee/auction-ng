import { Button } from './button';
import { NairaText } from './auction';
import { formatNaira } from '@auction-ng/shared/money';
import { type ReactNode } from 'react';
import {
  ArrowRight,
  ShieldCheck,
  Banknote,
  PackageCheck,
  Truck,
  Wallet,
  Gavel,
  MapPin,
} from 'lucide-react';
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
export function AuctionBrowseAction() {
  return (
    <div className="agn-auction-browse-action">
      <a href="/search" className="agn-button agn-button--primary">
        Sell All Auctions
        <ArrowRight size={18} aria-hidden="true" />
      </a>
    </div>
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
    <section
      className="agn-app-banner agn-container"
      aria-labelledby="app-banner-title"
    >
      <div className="agn-app-banner-copy">
        <span className="agn-app-coming">The Auction NG app · Coming soon</span>
        <h2 id="app-banner-title">
          Your next win.
          <br />
          Always within reach.
        </h2>
        <p>Great finds. Live bidding. All in your pocket.</p>
        <div
          className="agn-app-stores"
          aria-label="Coming soon to the App Store and Google Play"
        >
          <img
            src="/stores/app-store.svg"
            alt="App Store — coming soon"
            width={150}
            height={50}
            loading="lazy"
          />
          <img
            src="/stores/google-play.png"
            alt="Google Play — coming soon"
            width={178}
            height={69}
            loading="lazy"
          />
        </div>
        <a href="/search" className="agn-app-web-link">
          Browse on your phone today <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
      <div className="agn-app-device-stage">
        <div className="agn-app-device">
          {children ?? (
            <>
              <img
                src="/demo/mobile-auctions-preview.webp"
                alt="Auction NG mobile website showing auction items, prices and countdowns"
                width={600}
                height={1200}
                loading="lazy"
                decoding="async"
              />
            </>
          )}
        </div>
        <span className="agn-app-screen-caption">Mobile web preview</span>
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
