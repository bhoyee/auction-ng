'use client';
import { useCallback, useState } from 'react';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerLink, BuyerSkeleton } from '@auction-ng/ui/web/buyer';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { PurchaseOrders } from '@auction-ng/ui/web/purchase-orders';
import {
  WalletNotice,
  WalletPagination,
} from '@auction-ng/ui/web/wallet-workspace';
import { apiUrl, useBuyer } from '../lib/session';
import { useWalletRead } from '../lib/wallet-read';

export function PurchaseHistory() {
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
      createBuyerClient(apiUrl, credentials).purchases({ limit: 10, cursor }),
    [cursor],
  );
  const { data, error, reload } = useWalletRead(read);
  return (
    <BuyerPage
      title="Purchase history"
      description="Your Buy Now orders and receipts, all in one place."
    >
      {error && (
        <WalletNotice onRetry={reload}>
          Purchase history could not be refreshed. Check your connection and
          retry.
        </WalletNotice>
      )}
      {!data ? (
        error ? null : (
          <BuyerSkeleton />
        )
      ) : !data.items.length && pages.length === 1 ? (
        <EmptyState
          title="No purchases yet"
          action={<BuyerLink href="/">Explore auctions</BuyerLink>}
        >
          Items you purchase with Buy Now will appear here. Open an order to
          view its invoice and collection details.
        </EmptyState>
      ) : (
        <PurchaseOrders orders={data.items}>
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
        </PurchaseOrders>
      )}
    </BuyerPage>
  );
}
