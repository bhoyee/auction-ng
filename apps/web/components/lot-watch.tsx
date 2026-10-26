'use client';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createWatchStatusClient } from '@auction-ng/api-client/watch-status';
import { Button } from '@auction-ng/ui/web/button';
import { Heart } from '@auction-ng/ui/web/icons';
import { Toast } from '@auction-ng/ui/web/toast';
import { apiUrl, useBuyer } from '../lib/session';
import { usePrivateRead } from '../lib/private-read';

export function LotWatch({ lotId }: { lotId: string }) {
  const session = useBuyer();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const read = useCallback(
    async (credentials: { accessToken: string; deviceId: string }) =>
      createWatchStatusClient(apiUrl, credentials).watched([lotId]),
    [lotId],
  );
  const { data, error, reload } = usePrivateRead(read);
  const saved = data?.lotIds.includes(lotId) ?? false;
  const toggle = async () => {
    if (!session.tokens) {
      router.push(
        `/sign-in?${new URLSearchParams({ next: `/lots/${lotId}` })}`,
      );
      return;
    }
    if (busy || !data) return;
    setBusy(true);
    try {
      await createWatchStatusClient(apiUrl, {
        accessToken: session.tokens.accessToken,
        deviceId: session.deviceId,
      }).watch(lotId, !saved);
      window.dispatchEvent(
        new CustomEvent('auction-ng-watchlist-change', {
          detail: { userId: session.tokens.user.id, lotId, watching: !saved },
        }),
      );
      reload();
      setNotice(
        saved
          ? 'Lot removed from your watchlist.'
          : 'Lot saved to your watchlist.',
      );
    } catch {
      setNotice('Your watchlist could not be updated. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        variant="secondary"
        busy={busy}
        aria-pressed={saved}
        onClick={() => (error ? reload() : void toggle())}
        disabled={Boolean(session.tokens && !data && !error)}
      >
        <Heart
          size={18}
          aria-hidden="true"
          fill={saved ? 'currentColor' : 'none'}
        />
        {error
          ? 'Retry watchlist'
          : saved
            ? 'Saved to watchlist'
            : 'Save to watchlist'}
      </Button>
      {notice && <Toast onClose={() => setNotice('')}>{notice}</Toast>}
    </>
  );
}
