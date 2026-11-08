'use client';
import { useEffect, useState } from 'react';
import type { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';
import { ApiError } from '@auction-ng/api-client/auth';
import type { MonitorLotDetail } from '@auction-ng/shared';
import { LotWorkspaceView } from '@auction-ng/ui/admin/lot-operation-panels';
export function LiveLotWorkspace({
  client,
  id,
  onBack,
  onUnauthorized,
}: {
  client: ReturnType<typeof createStaffAdminClient>;
  id: string;
  onBack: () => void;
  onUnauthorized: () => void;
}) {
  const [data, setData] = useState<MonitorLotDetail | null>(null),
    [cursor, setCursor] = useState<string>(),
    [pages, setPages] = useState<(string | undefined)[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true,
      running = false;
    const read = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const value = await client.liveLotDetails(id, cursor);
        if (active) {
          setData(value);
          setError('');
        }
      } catch (cause) {
        if (active) {
          if (cause instanceof ApiError && cause.status === 401)
            onUnauthorized();
          if (cause instanceof ApiError && [401, 403].includes(cause.status))
            setData(null);
          setError(
            'Item details could not be refreshed. Check your connection and access.',
          );
        }
      } finally {
        running = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, id, cursor, onUnauthorized]);
  return (
    <>
      {error && (
        <p role="alert" className="lv-admin-widget-error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading item…</p>}
      {data && (
        <LotWorkspaceView
          data={data}
          buyerUrl={
            process.env.NEXT_PUBLIC_BUYER_URL || 'http://localhost:3300'
          }
          page={pages.length + 1}
          previous={!!pages.length}
          onPrevious={() => {
            setCursor(pages.at(-1));
            setPages((p) => p.slice(0, -1));
          }}
          onNext={() => {
            setPages((p) => [...p, cursor]);
            setCursor(data.nextCursor ?? undefined);
          }}
          onBack={onBack}
        />
      )}
    </>
  );
}
