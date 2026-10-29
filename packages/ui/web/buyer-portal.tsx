'use client';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Gavel,
  Heart,
  LogOut,
  Menu,
  MessageCircle,
  PackageCheck,
  QrCode,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react';
import { formatNaira } from '@auction-ng/shared/money';
import { NairaText } from './auction';
import { WatchlistCount } from './watchlist-count';
const links = [
  { href: '/wallet', label: 'Balance', icon: Wallet },
  { href: '/awaiting-pickup', label: 'Awaiting pickup', icon: PackageCheck },
  { href: '/shipments', label: 'Shipments', icon: Truck },
  { href: '/watchlist', label: 'Watchlist', icon: Heart },
  { href: '/purchase-history', label: 'Purchase history', icon: Clock3 },
  { href: '/my-bids', label: 'Bid history', icon: Gavel },
  { href: '/account', label: 'Profile', icon: UserRound },
  { href: '/customer-service', label: 'Customer service', icon: MessageCircle },
];
export function BuyerPortal({
  children,
  pathname,
  name,
  available,
  watchlistCount,
  onLogout,
  loggingOut,
}: {
  children: ReactNode;
  pathname: string;
  name: string;
  available?: number;
  watchlistCount?: number;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false);
  const matches = (href: string) =>
    pathname === href ||
    (href === '/awaiting-pickup' &&
      (pathname === '/pickup-passes' || pathname.startsWith('/invoices/')));
  return (
    <div
      className={`agn-container agn-buyer-portal${collapsed ? ' agn-buyer-portal--collapsed' : ''}`}
    >
      <button
        className="agn-portal-mobile-toggle"
        aria-expanded={mobileOpen}
        aria-controls="buyer-portal-navigation"
        onClick={() => setMobileOpen((value) => !value)}
      >
        <Menu size={20} aria-hidden="true" />
        My account
      </button>
      <aside
        id="buyer-portal-navigation"
        className={`agn-portal-sidebar${mobileOpen ? ' agn-portal-sidebar--open' : ''}`}
      >
        <button
          className="agn-portal-collapse"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={
            collapsed ? 'Expand account sidebar' : 'Collapse account sidebar'
          }
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
        <a
          href="/check-in"
          className="agn-portal-check-in"
          aria-current={pathname === '/check-in' ? 'page' : undefined}
          onClick={() => setMobileOpen(false)}
          title="Check-in"
        >
          <QrCode size={22} aria-hidden="true" />
          <span>Check-in</span>
        </a>
        <a
          href="/wallet"
          className="agn-portal-balance"
          title="Wallet balance"
          onClick={() => setMobileOpen(false)}
        >
          <Wallet size={22} aria-hidden="true" />
          <span>
            Balance
            <strong>
              {available === undefined ? (
                'View balance'
              ) : (
                <NairaText value={formatNaira(available)} />
              )}
            </strong>
            <small>Available to spend</small>
          </span>
        </a>
        <div className="agn-portal-identity">
          <strong>{name || 'Your buyer account'}</strong>
          <span>My Auction NG</span>
        </div>
        <nav aria-label="Buyer account">
          <ul>
            {links.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  title={label}
                  aria-label={
                    href === '/watchlist' && watchlistCount !== undefined
                      ? `Watchlist, ${watchlistCount} saved items`
                      : undefined
                  }
                  aria-current={matches(href) ? 'page' : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon size={20} aria-hidden="true" />
                  <span>{label}</span>
                  {href === '/watchlist' && (
                    <WatchlistCount count={watchlistCount} />
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <button
          className="agn-portal-logout"
          disabled={loggingOut}
          onClick={onLogout}
          title="Logout"
        >
          <LogOut size={20} aria-hidden="true" />
          <span>{loggingOut ? 'Signing out...' : 'Logout'}</span>
        </button>
      </aside>
      <div className="agn-portal-content">{children}</div>
    </div>
  );
}
export function PortalWalletSummary({
  available,
  held,
  total,
}: {
  available: number;
  held: number;
  total: number;
}) {
  return (
    <section className="agn-portal-wallet-summary" aria-label="Wallet balance">
      <div>
        <span>Wallet balance</span>
        <strong>
          <NairaText value={formatNaira(available)} />
        </strong>
        <p>Available to spend</p>
      </div>
      <div className="agn-portal-hold-note">
        <Wallet size={22} aria-hidden="true" />
        <p>
          <strong>{formatNaira(held)} reserved for active bids</strong>
          <span>
            Reserved funds stay in this wallet. They become available when you
            are outbid, or pay for your item when you win.
          </span>
        </p>
      </div>
      <details>
        <summary>Balance details</summary>
        <dl>
          <div>
            <dt>Available</dt>
            <dd>{formatNaira(available)}</dd>
          </div>
          <div>
            <dt>Reserved</dt>
            <dd>{formatNaira(held)}</dd>
          </div>
          <div>
            <dt>Total in wallet</dt>
            <dd>{formatNaira(total)}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
