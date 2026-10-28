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
  MessageCircle,
  Landmark,
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
        <a
          href={href}
          className="agn-section-action agn-section-action--outlined"
        >
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
          <a
            className="agn-section-action agn-section-action--outlined"
            href="/ending-soon"
          >
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
export function AppBanner({
  appStoreUrl = 'https://apps.apple.com/ng/',
  googlePlayUrl = 'https://play.google.com/store/apps',
}: {
  appStoreUrl?: string;
  googlePlayUrl?: string;
}) {
  const storeBadge = (
    href: string | undefined,
    src: string,
    label: string,
    width: number,
    height: number,
  ) => {
    const image = (
      <img src={src} alt={label} width={width} height={height} loading="lazy" />
    );
    return href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${label}`}
      >
        {image}
      </a>
    ) : (
      <span>{image}</span>
    );
  };
  return (
    <section
      className="agn-app-banner agn-container"
      aria-labelledby="app-banner-title"
    >
      <div className="agn-app-promo-inner">
        <div className="agn-app-banner-copy">
          <h2 id="app-banner-title">Stay close to your next win.</h2>
          <p>
            Get outbid alerts on your phone and follow your favourite auctions
            wherever you are.
          </p>
        </div>
        <div className="agn-app-stores" aria-label="App stores">
          {storeBadge(
            appStoreUrl,
            '/stores/app-store.svg',
            'App Store',
            150,
            50,
          )}
          {storeBadge(
            googlePlayUrl,
            '/stores/google-play.png',
            'Google Play',
            178,
            69,
          )}
        </div>
      </div>
    </section>
  );
}
export function MarketplaceFooter({
  supportEmail = 'info@auctionng.com',
  whatsappHref,
  socialLinks = {},
}: {
  demo?: boolean;
  supportEmail?: string;
  whatsappHref?: string;
  socialLinks?: Partial<
    Record<'x' | 'facebook' | 'instagram' | 'tiktok', string>
  >;
}) {
  return (
    <footer className="agn-market-footer">
      <div className="agn-container">
        <div className="agn-footer-columns">
          <div className="agn-footer-brand">
            <a href="/" className="agn-wordmark">
              Auction<span>NG</span>
            </a>
            <p className="agn-footer-tagline">
              Everyday things.
              <br />
              Unexpected prices.
            </p>
            <p>Daily liquidation auctions for Nigerian buyers.</p>
            <div className="agn-footer-socials" aria-label="Social media">
              {(
                [
                  [
                    'X',
                    socialLinks.x,
                    <svg
                      key="x"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-7.4L5.5 22H2.3l7.3-8.4L1.8 2h6.5l4.5 6.8L18.9 2Zm-1.1 18h1.7L7.3 3.9H5.5L17.8 20Z" />
                    </svg>,
                  ],
                  [
                    'Facebook',
                    socialLinks.facebook,
                    <svg
                      key="facebook"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M14 22v-9h3l.5-4H14V6.5c0-1.2.4-2 2-2h1.7V1.2A23 23 0 0 0 15.2 1C12.3 1 10 2.8 10 6.2V9H7v4h3v9h4Z" />
                    </svg>,
                  ],
                  [
                    'Instagram',
                    socialLinks.instagram,
                    <svg
                      key="instagram"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle
                        cx="17.5"
                        cy="6.5"
                        r="1"
                        fill="currentColor"
                        stroke="none"
                      />
                    </svg>,
                  ],
                  [
                    'TikTok',
                    socialLinks.tiktok,
                    <svg
                      key="tiktok"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M16.5 2c.4 2.8 2 4.4 4.5 4.6v3.3a9 9 0 0 1-4.5-1.4v7.2a6.3 6.3 0 1 1-5.4-6.2v3.4a3 3 0 1 0 2.1 2.8V2h3.3Z" />
                    </svg>,
                  ],
                ] as const
              ).map(([name, href, icon]) =>
                href ? (
                  <a
                    key={name}
                    href={href}
                    aria-label={`Auction NG on ${name}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {icon}
                  </a>
                ) : (
                  <span
                    key={name}
                    className="agn-social-unconfigured"
                    role="img"
                    aria-label={`${name} profile not configured`}
                    title={`${name} profile link to be added`}
                  >
                    {icon}
                  </span>
                ),
              )}
              {whatsappHref && (
                <a
                  href={whatsappHref}
                  aria-label="Auction NG on WhatsApp"
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={20} aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
          <nav aria-label="Explore Auction NG">
            <h2>Explore</h2>
            <a href="/search">All auctions</a>
            <a href="/categories">Categories</a>
            <a href="/ending-soon">Ending soon</a>
            <a href="/watchlist">Your watchlist</a>
            <a href="/past-auctions">Past Auctions</a>
          </nav>
          <nav aria-label="Buyer help">
            <h2>Help</h2>
            <a href="/help#bidding">How bidding works</a>
            <a href="/help#faqs">FAQs</a>
            <a href="/help#returns">Returns & refunds</a>
            <a href="/help">Help center</a>
            <a href="/help#contact">Contact us</a>
            <a className="agn-footer-email" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
          </nav>
          <nav aria-label="Policies and privacy">
            <h2>Legal</h2>
            <a href="/terms-of-use">Terms of Use</a>
            <a href="/privacy-policy">Privacy Policy</a>
            <a href="/cookie-policy">Cookie Policy</a>
            <a href="/help#condition-grades">Condition grades</a>
            <div
              className="agn-footer-payment-row"
              aria-label="Payment methods"
            >
              <div>
                <span className="agn-payment-mark">
                  <svg viewBox="0 0 64 24" role="img" aria-label="Visa">
                    <text
                      x="3"
                      y="20"
                      fill="#1434CB"
                      fontFamily="Arial, sans-serif"
                      fontStyle="italic"
                      fontWeight="900"
                      fontSize="24"
                    >
                      VISA
                    </text>
                  </svg>
                </span>
                <span className="agn-payment-mark">
                  <svg viewBox="0 0 48 30" role="img" aria-label="Mastercard">
                    <circle cx="18" cy="15" r="13" fill="#EB001B" />
                    <circle cx="30" cy="15" r="13" fill="#F79E1B" />
                    <path
                      d="M24 3.47a13 13 0 0 1 0 23.06 13 13 0 0 1 0-23.06"
                      fill="#FF5F00"
                    />
                  </svg>
                </span>
                <span className="agn-payment-mark agn-payment-transfer">
                  <Landmark size={19} aria-hidden="true" /> Bank transfer
                </span>
              </div>
            </div>
          </nav>
        </div>
        <div className="agn-footer-bottom">
          <small>&copy; {new Date().getFullYear()} Auction NG</small>
          <small>
            Powered by{' '}
            <a
              href="https://giddyhost.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <strong>GiddyHost</strong>
            </a>
          </small>
        </div>
      </div>
    </footer>
  );
}
