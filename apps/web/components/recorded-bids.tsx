'use client';
import { useEffect, useState } from 'react';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { createCatalogueClient } from '@auction-ng/api-client';
import { Button } from '@auction-ng/ui/web/button';
import { BuyerRow } from '@auction-ng/ui/web/buyer';
import {
  BidHistoryPanel,
  BidHistoryTable,
  type HistoryRow,
} from '@auction-ng/ui/web/bid-history';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { ErrorState } from '@auction-ng/ui/web/error-state';
import { apiUrl, useBuyer } from '../lib/session';
export function RecordedBids({ lotId }: { lotId: string }) {
  const { tokens, deviceId } = useBuyer();
  const [personal, setPersonal] = useState(false);
  const [result, setResult] = useState<{
    scope: string;
    items: HistoryRow[];
    nextCursor: string | null;
  }>();
  const [error, setError] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [version, setVersion] = useState(0);
  const own = personal && Boolean(tokens);
  const scope = `${lotId}:${own ? tokens?.user.id : 'public'}:${cursor ?? ''}`;
  const data = result?.scope === scope ? result : undefined;
  useEffect(() => {
    if (!tokens) {
      setPersonal(false);
      setCursor(undefined);
    }
  }, [tokens]);
  useEffect(() => {
    let active = true;
    let fetching = false;
    setResult(undefined);
    setError(false);
    async function load() {
      if (fetching || document.hidden) return;
      fetching = true;
      try {
        let value: { items: HistoryRow[]; nextCursor: string | null };
        if (own && tokens) {
          const result = await createBuyerClient(apiUrl, {
            accessToken: tokens.accessToken,
            deviceId,
          }).lotBids(lotId, { limit: 20, cursor });
          value = {
            items: result.items.map((row) => ({
              id: row.id,
              bidder: 'You',
              amountKobo: row.amountKobo,
              createdAt: row.createdAt,
              automatic: row.automatic,
            })),
            nextCursor: result.nextCursor,
          };
        } else {
          const result = await createCatalogueClient(apiUrl).lotHistory(lotId, {
            limit: 20,
            cursor,
          });
          value = {
            items: result.items.map((row) => ({
              id: row.id,
              bidder: row.bidderLabel,
              amountKobo: row.currentPriceKobo,
              createdAt: row.createdAt,
            })),
            nextCursor: result.nextCursor,
          };
        }
        if (active) {
          setResult({ ...value, scope });
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        fetching = false;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 15000);
    const resume = () => void load();
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [tokens, deviceId, lotId, cursor, version, own, scope]);
  return (
    <BidHistoryPanel
      personal={own}
      signedIn={Boolean(tokens)}
      loading={!data && !error}
      onView={(value) => {
        setPersonal(value);
        setCursor(undefined);
      }}
      refresh={() => setVersion((value) => value + 1)}
    >
      {error ? (
        <ErrorState
          title="Bid history could not be loaded"
          onRetry={() => setVersion((value) => value + 1)}
        />
      ) : !data ? (
        <p role="status">Loading recorded bids�</p>
      ) : (
        <>
          {!data.items.length ? (
            <EmptyState
              title={
                own
                  ? 'You have not bid on this item yet'
                  : 'No recorded bids yet'
              }
            >
              Accepted bids appear after they are saved.
            </EmptyState>
          ) : (
            <BidHistoryTable
              rows={data.items}
              personal={own}
              newest={!cursor}
            />
          )}
          <BuyerRow>
            {cursor && (
              <Button variant="ghost" onClick={() => setCursor(undefined)}>
                Back to newest
              </Button>
            )}
            {data.nextCursor && (
              <Button
                variant="ghost"
                onClick={() => setCursor(data.nextCursor ?? undefined)}
              >
                Next page
              </Button>
            )}
          </BuyerRow>
        </>
      )}
    </BidHistoryPanel>
  );
}
