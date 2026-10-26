'use client';
import { useEffect, useState, type ReactNode } from 'react';
import {
  BuyerLink,
  BuyerRow,
  Footer,
  Header,
  OfflineBanner,
} from '@auction-ng/ui/web';
import { apiUrl, useBuyer } from '../lib/session';
import { formatNaira } from '@auction-ng/shared/money';
import { usePathname, useRouter } from 'next/navigation';

export function BuyerShell({ children }: { children: ReactNode }) {
  const { tokens, ready, deviceId } = useBuyer();
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
  useEffect(() => {
    let active = true;
    setBalance(undefined);
    if (!tokens) return;
    const credentials = { accessToken: tokens.accessToken, deviceId };
    const refresh = () => {
      void import('@auction-ng/api-client/wallet')
        .then(({ createWalletClient }) =>
          createWalletClient(apiUrl, credentials).getBalance(),
        )
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
        if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
        const url = new URL(anchor.href);
        if (url.origin !== window.location.origin) return;
        event.preventDefault();
        router.push(url.pathname + url.search + url.hash);
      }}
    >
      <Header
        search={
          <form
            className="agn-buyer-search"
            action="/search"
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get('q');
              if (typeof value === 'string')
                router.push(`/search?${new URLSearchParams({ q: value })}`);
            }}
          >
            <input
              name="q"
              type="search"
              maxLength={120}
              placeholder="Search auctions"
              aria-label="Search auctions"
              required
            />
            <button className="agn-button agn-button--ghost" type="submit">
              Search
            </button>
          </form>
        }
        account={
          <BuyerLink href={tokens ? '/account' : '/sign-in'}>
            {tokens ? 'My account' : ready ? 'Sign in' : 'Account'}
          </BuyerLink>
        }
      />
      <nav className="agn-buyer-nav" aria-label="Buyer navigation">
        <div className="agn-container">
          <BuyerRow>
            <BuyerLink href="/categories">Categories</BuyerLink>
            <BuyerLink href="/ending-soon">Ending soon</BuyerLink>
            <BuyerLink href="/watchlist">Watchlist</BuyerLink>
            <BuyerLink href="/my-bids">My bids</BuyerLink>
            <BuyerLink href="/wallet">
              Wallet
              {displayedBalance === undefined
                ? ''
                : ` ${formatNaira(displayedBalance)}`}
            </BuyerLink>
            <BuyerLink href="/invoices">Invoices</BuyerLink>
          </BuyerRow>
        </div>
      </nav>
      {offline && (
        <OfflineBanner>
          You’re offline. Reconnect to see prices and place a bid.
        </OfflineBanner>
      )}
      {children}
      <Footer>
        <p>
          Daily liquidation auctions. Collect your wins from the lot’s pickup
          warehouse.
        </p>
        <BuyerRow>
          <BuyerLink href="/locations">Pickup locations</BuyerLink>
          <BuyerLink href="/help">How bidding works</BuyerLink>
        </BuyerRow>
      </Footer>
    </div>
  );
}
