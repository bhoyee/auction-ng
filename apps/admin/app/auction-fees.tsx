'use client';
import { useEffect, useRef, useState } from 'react';
import { createAuctionFeeClient } from '@auction-ng/api-client/auction-fees';
import { ApiError } from '@auction-ng/api-client/auth';
import type {
  AuctionFeeSettings,
  AuctionFeeUpdate,
} from '@auction-ng/shared/auction-fee-schemas';
import { AuctionFeePanel } from '@auction-ng/ui/web/auction-fee-panel';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export function AuctionFeeSettings({
  accessToken,
  deviceId,
  online,
}: {
  accessToken: string;
  deviceId: string;
  online: boolean;
}) {
  const [snapshot, setSnapshot] = useState<AuctionFeeSettings>();
  const [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const pending = useRef<AuctionFeeUpdate | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void createAuctionFeeClient(apiUrl, { accessToken, deviceId })
      .read()
      .then((value) => {
        if (active) {
          setSnapshot(value);
          setError('');
        }
      })
      .catch(() => {
        if (active)
          setError(
            'Auction fees could not be loaded. Reload settings to try again.',
          );
      });
    return () => {
      active = false;
    };
  }, [accessToken, deviceId, reload]);
  return (
    <AuctionFeePanel
      snapshot={snapshot}
      busy={busy}
      disabled={!online || !!pending.current}
      error={error}
      success={success}
      onDismiss={() => {
        setError('');
        setSuccess('');
      }}
      onReload={() => {
        if (!pending.current) {
          setSnapshot(undefined);
          setReload((v) => v + 1);
        }
      }}
      onSave={async (config) => {
        if (!snapshot || busy || !online) return;
        pending.current ??= {
          ...config,
          expectedRevision: snapshot.revision,
          idempotencyKey: crypto.randomUUID(),
        };
        setBusy(true);
        setError('');
        setSuccess('');
        try {
          const value = await createAuctionFeeClient(apiUrl, {
            accessToken,
            deviceId,
          }).update(pending.current);
          setSnapshot(value);
          pending.current = undefined;
          setSuccess(
            'Auction fees updated. Auctions with accepted bids retain their agreed fees.',
          );
        } catch (err) {
          if (
            err instanceof ApiError &&
            [400, 401, 403, 409].includes(err.status)
          ) {
            pending.current = undefined;
            setError(
              'These settings could not be saved. Reload settings, check your session and try again.',
            );
          } else
            setError(
              'The update could not be confirmed. Retry this same save before editing.',
            );
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
