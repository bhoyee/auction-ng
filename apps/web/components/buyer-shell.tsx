'use client';
import { useEffect, useState, type ReactNode } from 'react';
import {
  CategoryStrip,
  MarketplaceHeader,
  type MarketplaceCategory,
} from '@auction-ng/ui/web/marketplace';
import { OfflineBanner } from '@auction-ng/ui/web/offline-banner';
import { Toast } from '@auction-ng/ui/web/toast';
import { apiUrl, useBuyer } from '../lib/session';
import { formatNaira } from '@auction-ng/shared/money';
import { NairaText } from '@auction-ng/ui/web/auction';
import { usePathname, useRouter } from 'next/navigation';
import {
  Heart,
  Plus,
  UserRound,
  ChevronDown,
  LogOut,
  ArrowUpRight,
} from '@auction-ng/ui/web/icons';
import { MarketplaceSearch } from './marketplace-search';
import { BuyerNotifications } from './buyer-notifications';

export function BuyerShell({
  children,
  categories,
  demo = false,
  whatsappHref,
  footer,
}: {
  children: ReactNode;
  categories: MarketplaceCategory[];
  demo?: boolean;
  whatsappHref?: string;
  footer: ReactNode;
}) {
  const { tokens, ready, deviceId, auth, setTokens } = useBuyer();
  const [balance, setBalance] = useState<{
    userId: string;
    availableKobo: number;
  }>();
  const displayedBalance =
    tokens && balance?.userId === tokens.user.id
      ? balance.availableKobo
      : undefined;
  const router = useRouter();
  const pathname = usePathname();
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
    if (!tokens) return;
    const credentials = { accessToken: tokens.accessToken, deviceId };
    const refresh = () => {
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
    window.addEventListener('auction-ng-wallet-change', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('auction-ng-wallet-change', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [tokens, deviceId]);
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
  const authenticationPage = pathname === '/sign-in' || pathname === '/sign-up';
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
              Auction<span>NG</span>
            </a>
            <a href="/">Back to auctions</a>
          </div>
        </header>
      ) : (
        <>
          <MarketplaceHeader
            signedIn={Boolean(tokens)}
            whatsappHref={whatsappHref}
            search={<MarketplaceSearch categories={categories} />}
            actions={
              tokens ? (
                <>
                  <a
                    className="agn-icon-link"
                    href="/watchlist"
                    aria-label="Watchlist"
                  >
                    <Heart size={20} />
                  </a>
                  <a
                    className="agn-wallet-chip"
                    href="/wallet"
                    aria-label="Wallet and top up"
                  >
                    {displayedBalance === undefined ? (
                      'Wallet'
                    ) : (
                      <NairaText value={formatNaira(displayedBalance)} />
                    )}
                    <Plus size={17} />
                  </a>
                  <BuyerNotifications />
                  <details className="agn-menu">
                    <summary aria-label="Account menu">
                      <UserRound size={20} />
                      <ChevronDown size={15} />
                    </summary>
                    <div className="agn-account-menu">
                      <a href="/my-bids">My bids</a>
                      <a href="/invoices">Invoices</a>
                      <a href="/pickup-passes">Pickup passes</a>
                      <a href="/account">Account settings</a>
                      <button
                        type="button"
                        disabled={signingOut}
                        onClick={() => {
                          if (auth && !signingOut) {
                            setSigningOut(true);
                            void auth
                              .logout()
                              .then(() => {
                                setTokens(null);
                                router.replace('/');
                              })
                              .catch(() => {
                                setAccountError(
                                  'Sign out could not be completed. Check your connection and try again.',
                                );
                              })
                              .finally(() => setSigningOut(false));
                          }
                        }}
                      >
                        <LogOut size={17} />
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
          {demo && (
            <div className="agn-demo-notice">
              Demo marketplace · Sample lots, licensed representative photos and
              test funds only.
            </div>
          )}
        </>
      )}
      {offline && (
        <OfflineBanner>
          You’re offline. Reconnect to see prices and place a bid.
        </OfflineBanner>
      )}
      {children}
      {!authenticationPage && footer}
      {buyerNotice && (
        <Toast onClose={() => setBuyerNotice('')}>{buyerNotice}</Toast>
      )}
      {accountError && (
        <Toast onClose={() => setAccountError('')}>{accountError}</Toast>
      )}
    </div>
  );
}
