'use client';
import { useEffect, useState } from 'react';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import type { LotBidHistory } from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared/money';
import {
  Button,
  BuyerLink,
  BuyerPanel,
  BuyerRow,
  BuyerStack,
  EmptyState,
  ErrorState,
  MoneyLine,
} from '@auction-ng/ui/web';
import { apiUrl, useBuyer } from '../lib/session';
export function RecordedBids({ lotId }: { lotId: string }) {
  const { tokens, deviceId } = useBuyer();
  const [data, setData] = useState<LotBidHistory>();
  const [error, setError] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError(false);
    if (tokens)
      void createBuyerClient(apiUrl, {
        accessToken: tokens.accessToken,
        deviceId,
      })
        .lotHistory(lotId, { limit: 20, cursor })
        .then((value) => {
          if (active) setData(value);
        })
        .catch(() => {
          if (active) setError(true);
        });
    return () => {
      active = false;
    };
  }, [tokens, deviceId, lotId, cursor, version]);
  return (
    <BuyerPanel>
      <h2>Recorded bids</h2>
      <p>
        Past public prices and anonymous bidder labels. Records may take a
        moment to appear; the live panel shows the current price. Private
        spending limits are never listed.
      </p>
      {!tokens ? (
        <BuyerLink href="/sign-in">Sign in to view bid history</BuyerLink>
      ) : error ? (
        <ErrorState
          title="Bid history could not be loaded"
          onRetry={() => setVersion((value) => value + 1)}
        />
      ) : !data ? (
        <p role="status">Loading recorded bids…</p>
      ) : (
        <BuyerStack>
          {!data.items.length && (
            <EmptyState title="No recorded bids yet">
              Accepted bids appear after they are saved.
            </EmptyState>
          )}
          {data.items.map((item) => (
            <div key={item.id}>
              <MoneyLine
                label={item.bidderLabel}
                value={formatNaira(item.currentPriceKobo)}
              />
              <p>
                {new Date(item.createdAt).toLocaleString('en-NG', {
                  timeZone: 'Africa/Lagos',
                })}{' '}
                WAT
              </p>
            </div>
          ))}
          <BuyerRow>
            <Button
              variant="secondary"
              onClick={() => setVersion((value) => value + 1)}
            >
              Refresh history
            </Button>
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
        </BuyerStack>
      )}
    </BuyerPanel>
  );
}
