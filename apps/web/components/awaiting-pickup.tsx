'use client';
import { useCallback, useState } from 'react';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerLink, BuyerSkeleton } from '@auction-ng/ui/web/buyer';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { PickupOrders } from '@auction-ng/ui/web/pickup-orders';
import {
  WalletNotice,
  WalletPagination,
} from '@auction-ng/ui/web/wallet-workspace';
import { apiUrl, useBuyer } from '../lib/session';
import { useWalletRead } from '../lib/wallet-read';

export function AwaitingPickup() {
  const { tokens } = useBuyer();
  const owner = tokens?.user.id;
  const [navigation, setNavigation] = useState<{
    owner?: string;
    pages: (string | undefined)[];
  }>({ pages: [undefined] });
  const pages = navigation.owner === owner ? navigation.pages : [undefined];
  const cursor = pages.at(-1);
  const read = useCallback(
    (credentials: { accessToken: string; deviceId: string }) =>
      createBuyerClient(apiUrl, credentials).collections({ limit: 10, cursor }),
    [cursor],
  );
  const { data, error, reload } = useWalletRead(read);
  return (
    <BuyerPage
      title="Awaiting pickup"
      description="Your paid orders, ready for collection. Open your pickup pass when you arrive."
    >
      <BuyerLink href="/pickup-storage">
        Collection deadlines & storage payments
      </BuyerLink>
      {error && (
        <WalletNotice onRetry={reload}>
          Pickup orders could not be refreshed. Check your connection and retry.
        </WalletNotice>
      )}
      {!data ? (
        error ? null : (
          <BuyerSkeleton />
        )
      ) : !data.items.length && pages.length === 1 ? (
        <EmptyState
          title="Nothing awaiting pickup"
          action={<BuyerLink href="/">Browse auctions</BuyerLink>}
        >
          Paid orders will appear here until they have been collected.
        </EmptyState>
      ) : (
        <PickupOrders orders={data.items}>
          {!data.items.length && (
            <p>No orders on this page. Go back to the previous page.</p>
          )}
          <WalletPagination
            page={pages.length}
            size={10}
            hasNext={!!data.nextCursor}
            onPrevious={() =>
              setNavigation({
                owner,
                pages: pages.length > 1 ? pages.slice(0, -1) : pages,
              })
            }
            onNext={() => {
              if (data.nextCursor)
                setNavigation({ owner, pages: [...pages, data.nextCursor] });
            }}
          />
        </PickupOrders>
      )}
    </BuyerPage>
  );
}
