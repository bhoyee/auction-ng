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
import { demoBidHistory } from '@auction-ng/ui/demo-bid-history';
const pageSize = 10;
export function RecordedBids({
  lotId,
  demo = false,
}: {
  lotId: string;
  demo?: boolean;
}) {
  const { tokens, deviceId } = useBuyer();
  const [personal, setPersonal] = useState(false);
  const [result, setResult] = useState<{
    scope: string;
    items: HistoryRow[];
    nextCursor: string | null;
  }>();
  const [error, setError] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [previous, setPrevious] = useState<(string | undefined)[]>([]);
  const [demoPage, setDemoPage] = useState(0);
  const [version, setVersion] = useState(0);
  const own = personal && Boolean(tokens);
  const scope = `${lotId}:${own ? tokens?.user.id : 'public'}:${cursor ?? ''}`;
  const data = result?.scope === scope ? result : undefined;
  const preview = Boolean(
    demo && !own && data && !data.items.length && !cursor,
  );
  const rows = preview
    ? demoBidHistory.slice(demoPage * pageSize, (demoPage + 1) * pageSize)
    : (data?.items ?? []);
  useEffect(() => {
    if (!tokens) {
      setPersonal(false);
      setCursor(undefined);
      setPrevious([]);
      setDemoPage(0);
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
          }).lotBids(lotId, { limit: pageSize, cursor });
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
            limit: pageSize,
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
        setPrevious([]);
        setDemoPage(0);
      }}
      refresh={() => setVersion((value) => value + 1)}
    >
      {error ? (
        <ErrorState
          title="Bid history could not be loaded"
          onRetry={() => setVersion((value) => value + 1)}
        />
      ) : !data ? (
        <p role="status">Loading recorded bids...</p>
      ) : (
        <>
          {preview && (
            <p className="agn-bid-history-note">
              <strong>Demo history preview</strong> · Sample rows for layout and
              pagination only. These are not accepted bids.
            </p>
          )}
          {!rows.length ? (
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
              rows={rows}
              personal={own}
              newest={!cursor && !preview}
            />
          )}
          <BuyerRow>
            {(preview ? demoPage > 0 : previous.length > 0) && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (preview) setDemoPage((value) => value - 1);
                  else {
                    setCursor(previous.at(-1));
                    setPrevious((value) => value.slice(0, -1));
                  }
                }}
              >
                Previous page
              </Button>
            )}
            <span className="agn-hint" aria-live="polite">
              Page {preview ? demoPage + 1 : previous.length + 1} · 10 rows per
              page
            </span>
            {(preview
              ? (demoPage + 1) * pageSize < demoBidHistory.length
              : data.nextCursor) && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (preview) setDemoPage((value) => value + 1);
                  else {
                    setPrevious((value) => [...value, cursor]);
                    setCursor(data.nextCursor ?? undefined);
                  }
                }}
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
