'use client';
import { useCallback, useState } from 'react';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { formatNaira } from '@auction-ng/shared/money';
import { Button } from '@auction-ng/ui/web/button';
import {
  BuyerLink,
  BuyerActivityCard,
  BuyerRow,
  BuyerStack,
  BuyerSkeleton,
} from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { ErrorState } from '@auction-ng/ui/web/error-state';
import { apiUrl, useBuyer } from '../lib/session';
import { usePrivateRead } from '../lib/private-read';

export function BuyerHistory({
  kind,
  pickup = false,
}: {
  kind: 'watchlist' | 'my-bids' | 'invoices';
  pickup?: boolean;
}) {
  const session = useBuyer();
  const [cursor, setCursor] = useState<string>();
  const read = useCallback(
    async (credentials: { accessToken: string; deviceId: string }) => {
      const client = createBuyerClient(apiUrl, credentials);
      const page = { limit: 20, cursor };
      if (kind === 'watchlist') {
        const value = await client.watchlist(page);
        return {
          items: value.items.map((row) => ({
            id: row.lot.id,
            title: row.lot.title,
            reference: row.lot.lotNumber,
            image: row.lot.thumbnailUrl,
            href: `/lots/${row.lot.id}`,
            detail: 'Saved to your watchlist',
          })),
          nextCursor: value.nextCursor,
        };
      }
      if (kind === 'my-bids') {
        const value = await client.bids(page);
        return {
          items: value.items.map((row) => ({
            id: row.id,
            title: row.lot.title,
            reference: row.lot.lotNumber,
            href: `/lots/${row.lot.id}`,
            detail: `${row.automatic ? 'Automatic bid' : 'Direct bid'} · ${formatNaira(row.amountKobo)} · ${new Date(row.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} WAT`,
          })),
          nextCursor: value.nextCursor,
        };
      }
      const value = await client.invoices(page);
      return {
        items: value.items
          .filter((row) => !pickup || row.status === 'paid')
          .map((row) => ({
            id: row.id,
            title: row.number,
            reference: row.status,
            image: undefined,
            href: `/invoices/${row.id}${pickup ? '/pickup-pass' : ''}`,
            detail: formatNaira(row.totalKobo),
          })),
        nextCursor: value.nextCursor,
      };
    },
    [kind, cursor, pickup],
  );
  const { data, error, reload } = usePrivateRead(read);
  const [notice, setNotice] = useState('');
  return (
    <BuyerPage
      narrow
      title={
        kind === 'my-bids'
          ? 'My bids'
          : kind === 'watchlist'
            ? 'Watchlist'
            : pickup
              ? 'Pickup passes'
              : 'Invoices'
      }
      description={
        kind === 'my-bids'
          ? 'Your accepted bid history. Open a lot for your current live position; these amounts are historical.'
          : undefined
      }
    >
      {error ? (
        <ErrorState onRetry={reload} />
      ) : !data ? (
        <BuyerSkeleton />
      ) : (
        <BuyerStack>
          {!data.items.length && (
            <EmptyState
              title={
                kind === 'watchlist'
                  ? 'No saved lots yet'
                  : kind === 'my-bids'
                    ? 'No bids yet'
                    : 'No invoices yet'
              }
              action={<BuyerLink href="/">Browse auctions</BuyerLink>}
            >
              Your activity will appear here.
            </EmptyState>
          )}
          {data.items.map((item) => (
            <BuyerActivityCard
              key={item.id}
              image={
                'image' in item && typeof item.image === 'string'
                  ? item.image
                  : undefined
              }
              title={item.title}
              href={item.href}
              reference={item.reference}
            >
              <p>{item.detail}</p>
              {kind === 'watchlist' && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!session.tokens) return;
                    void createBuyerClient(apiUrl, {
                      accessToken: session.tokens.accessToken,
                      deviceId: session.deviceId,
                    })
                      .watch(item.id, false)
                      .then(reload)
                      .catch(() =>
                        setNotice('The lot could not be removed. Try again.'),
                      );
                  }}
                >
                  Remove from watchlist
                </Button>
              )}
            </BuyerActivityCard>
          ))}
          {notice && <p role="status">{notice}</p>}
          <BuyerRow>
            {cursor && (
              <Button variant="secondary" onClick={() => setCursor(undefined)}>
                Back to newest
              </Button>
            )}
            {data.nextCursor && (
              <Button
                variant="secondary"
                onClick={() => setCursor(data.nextCursor ?? undefined)}
              >
                Next page
              </Button>
            )}
          </BuyerRow>
        </BuyerStack>
      )}
    </BuyerPage>
  );
}
