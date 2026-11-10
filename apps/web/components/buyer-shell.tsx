'use client';
import dynamic from 'next/dynamic';
import { BrandLogo } from '@auction-ng/ui/web/brand-logo';
import { useEffect, useState, type ReactNode } from 'react';
import {
  CategoryStrip,
  MarketplaceHeader,
  type MarketplaceCategory,
} from '@auction-ng/ui/web/marketplace';
import { OfflineBanner } from '@auction-ng/ui/web/offline-banner';
import { Toast } from '@auction-ng/ui/web/toast';
import { apiUrl, useBuyer } from '../lib/session';
import { usePathname, useRouter } from 'next/navigation';
import {
  Heart,
  UserRound,
  ChevronDown,
  LogOut,
  ArrowUpRight,
  Wallet,
  Gavel,
  ReceiptText,
  QrCode,
  Settings,
} from '@auction-ng/ui/web/icons';
import { MarketplaceSearch } from './marketplace-search';
import { StickyMarketplaceHeader } from '@auction-ng/ui/web/sticky-marketplace-header';
import { BuyerPortal } from '@auction-ng/ui/web/buyer-portal';
import { WatchlistCount } from '@auction-ng/ui/web/watchlist-count';
import { useWatchlistCount } from '../lib/watchlist-count';
import { SupportChat } from './support-chat';

// Rendered only for signed-in buyers, so guests never download it.
const BuyerNotifications = dynamic(
  () => import('./buyer-notifications').then((m) => m.BuyerNotifications),
  { ssr: false },
);

export function BuyerShell({
  children,
  categories,
  whatsappHref,
  footer,
}: {
  children: ReactNode;
  categories: MarketplaceCategory[];
  whatsappHref?: string;
  footer: ReactNode;
}) {
  const { tokens, ready, deviceId, auth } = useBuyer();
  const [balance, setBalance] = useState<{
    userId: string;
    availableKobo: number;
  }>();
  const displayedBalance =
    tokens && balance?.userId === tokens.user.id
      ? balance.availableKobo
      : undefined;
  const watchlistCount = useWatchlistCount();
  const watchlistLabel =
    watchlistCount === undefined
      ? 'Watchlist'
      : `Watchlist, ${watchlistCount} saved items`;
  const router = useRouter();
  const pathname = usePathname();
  const portalPage = [
    '/account',
    '/wallet',
    '/awaiting-pickup',
    '/check-in',
    '/shipments',
    '/watchlist',
    '/purchase-history',
    '/my-bids',
    '/invoices',
    '/pickup-passes',
    '/customer-service',
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));

  const [offline, setOffline] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [buyerNotice, setBuyerNotice] = useState('');
  useEffect(() => {
    setBuyerNotice('');
    const notice = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (
        tokens &&
        detail &&
        typeof detail === 'object' &&
        'userId' in detail &&
        detail.userId === tokens.user.id &&
        'message' in detail &&
        typeof detail.message === 'string'
      )
        setBuyerNotice(detail.message);
    };
    window.addEventListener('auction-ng-buyer-notice', notice);
    return () => window.removeEventListener('auction-ng-buyer-notice', notice);
  }, [tokens?.user.id]);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    document
      .querySelectorAll<HTMLDetailsElement>('.agn-menu[open]')
      .forEach((menu) => {
        menu.open = false;
      });
  }, [pathname]);
  useEffect(() => {
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      document
        .querySelectorAll<HTMLDetailsElement>('.agn-menu[open]')
        .forEach((menu) => {
          if (
            event instanceof KeyboardEvent ||
            !(event.target instanceof Node) ||
            !menu.contains(event.target)
          ) {
            menu.open = false;
            if (event instanceof KeyboardEvent)
              menu.querySelector('summary')?.focus();
          }
        });
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setBalance(undefined);
    if (!tokens || !portalPage) return;
    const credentials = { accessToken: tokens.accessToken, deviceId };
    const refresh = () => {
      if (document.hidden || !navigator.onLine) return;
      void import('@auction-ng/api-client/wallet-balance')
        .then(({ readWalletBalance }) => readWalletBalance(apiUrl, credentials))
        .then((value) => {
          if (active)
            setBalance({
              userId: tokens.user.id,
              availableKobo: value.availableKobo,
            });
        })
        .catch(() => {
          if (active) setBalance(undefined);
        });
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('auction-ng-wallet-change', refresh);
    window.addEventListener('auction-ng-wallet-balance-refresh', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('auction-ng-wallet-change', refresh);
      window.removeEventListener('auction-ng-wallet-balance-refresh', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [tokens, deviceId, portalPage]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (pathname === '/design') return <>{children}</>;
  const authenticationPage =
    pathname === '/sign-in' ||
    pathname === '/sign-up' ||
    pathname === '/forgot-password';
  const logout = () => {
    if (!auth || signingOut) return;
    setSigningOut(true);
    void auth
      .logout()
      .then(() => {
        // A fresh document clears private state and avoids the account gate
        // racing the sign-out redirect back to the public marketplace.
        window.location.replace('/');
      })
      .catch(() =>
        setAccountError(
          'Sign out could not be completed. Check your connection and try again.',
        ),
      )
      .finally(() => setSigningOut(false));
  };
  return (
    <div
      data-buyer-ready={ready}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          !(event.target instanceof Element)
        )
          return;
        const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
        anchor?.closest('details')?.removeAttribute('open');
        if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
        const url = new URL(anchor.href);
        if (url.origin !== window.location.origin) return;
        event.preventDefault();
        router.push(url.pathname + url.search + url.hash);
      }}
    >
      {authenticationPage ? (
        <header className="agn-auth-header">
          <div className="agn-container">
            <a href="/" className="agn-wordmark">
              <BrandLogo />
            </a>
            <a href="/">Back to auctions</a>
          </div>
        </header>
      ) : (
        <StickyMarketplaceHeader>
          <MarketplaceHeader
            signedIn={Boolean(tokens)}
            whatsappHref={whatsappHref}
            search={<MarketplaceSearch categories={categories} />}
            actions={
              tokens ? (
                <>
                  <a
                    className="agn-icon-link agn-watch-link"
                    href="/watchlist"
                    aria-label={watchlistLabel}
                  >
                    <Heart size={20} />
                    <WatchlistCount count={watchlistCount} />
                  </a>
                  <BuyerNotifications />
                  <details className="agn-menu">
                    <summary aria-label="Account menu">
                      <UserRound size={20} />
                      <ChevronDown size={15} />
                    </summary>
                    <div className="agn-account-menu">
                      <a href="/watchlist" aria-label={watchlistLabel}>
                        <Heart size={18} aria-hidden="true" />
                        Watchlist <WatchlistCount count={watchlistCount} />
                      </a>
                      <a href="/wallet">
                        <Wallet size={18} aria-hidden="true" />
                        Wallet
                      </a>
                      <a href="/my-bids">
                        <Gavel size={18} aria-hidden="true" />
                        My bids
                      </a>
                      <a href="/invoices">
                        <ReceiptText size={18} aria-hidden="true" />
                        Invoices
                      </a>
                      <a href="/pickup-passes">
                        <QrCode size={18} aria-hidden="true" />
                        Pickup passes
                      </a>
                      <a href="/account">
                        <Settings size={18} aria-hidden="true" />
                        Account settings
                      </a>
                      <button
                        type="button"
                        disabled={signingOut}
                        onClick={logout}
                      >
                        <LogOut size={18} aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  </details>
                </>
              ) : ready ? (
                <>
                  <a
                    href="/sign-in"
                    className="agn-button agn-button--secondary agn-header-signin"
                  >
                    <UserRound size={18} aria-hidden="true" />
                    Sign in
                  </a>
                  <a
                    href="/sign-up"
                    className="agn-button agn-button--primary agn-header-signup"
                  >
                    Create account
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </a>
                </>
              ) : (
                <span role="status">Loading account…</span>
              )
            }
          />
          <CategoryStrip categories={categories} />
        </StickyMarketplaceHeader>
      )}
      {offline && (
        <OfflineBanner>
          You’re offline. Reconnect to see prices and place a bid.
        </OfflineBanner>
      )}
      {portalPage && tokens ? (
        <BuyerPortal
          key={tokens.user.id}
          pathname={pathname}
          name={tokens.user.name}
          available={displayedBalance}
          watchlistCount={watchlistCount}
          onLogout={logout}
          loggingOut={signingOut}
        >
          {children}
        </BuyerPortal>
      ) : (
        children
      )}
      {!authenticationPage && footer}
      {!authenticationPage && <SupportChat />}
      {buyerNotice && (
        <Toast onClose={() => setBuyerNotice('')}>{buyerNotice}</Toast>
      )}
      {accountError && (
        <Toast tone="error" floating onClose={() => setAccountError('')}>
          {accountError}
        </Toast>
      )}
    </div>
  );
}
