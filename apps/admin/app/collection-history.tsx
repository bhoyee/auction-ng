'use client';
import { useEffect, useState } from 'react';
import { createPickupVisitClient } from '@auction-ng/api-client/pickup-visits';
import { ApiError } from '@auction-ng/api-client/auth';
import type { CollectionHistoryPage } from '@auction-ng/shared/pickup-visit-schemas';
import {
  StaffBadge,
  StaffSearch,
} from '@auction-ng/ui/web/staff-dashboard-view';
import { PickupDeskPanel } from '@auction-ng/ui/web/pickup-visit';
import {
  WalletNotice,
  WalletPagination,
} from '@auction-ng/ui/web/wallet-workspace';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export function CollectionHistory({
  accessToken,
  deviceId,
}: {
  accessToken: string;
  deviceId: string;
}) {
  const [query, setQuery] = useState(''),
    [applied, setApplied] = useState('');
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const [data, setData] = useState<CollectionHistoryPage>(),
    [error, setError] = useState(''),
    [version, setVersion] = useState(0);
  const cursor = pages.at(-1);
  useEffect(() => {
    let alive = true,
      running = false;
    setData(undefined);
    setError('');
    async function read() {
      if (running || document.hidden) return;
      running = true;
      try {
        const page = await createPickupVisitClient(apiUrl, {
          accessToken,
          deviceId,
        }).history({ limit: 10, cursor, q: applied });
        if (alive) {
          setData(page);
          setError('');
        }
      } catch (cause) {
        if (alive) {
          if (cause instanceof ApiError && [401, 403].includes(cause.status))
            setData(undefined);
          setError(
            'Collected items could not be refreshed. Check your connection or staff access and retry.',
          );
        }
      } finally {
        running = false;
      }
    }
    void read();
    const timer = setInterval(() => void read(), 5000);
    window.addEventListener('lotvanta:staff-refresh', read);
    window.addEventListener('focus', read);
    window.addEventListener('online', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('lotvanta:staff-refresh', read);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, [accessToken, deviceId, cursor, applied, version]);
  return (
    <PickupDeskPanel title="Collected items">
      <p>
        Completed item handovers, newest first. Partial collections appear here
        as soon as they are confirmed.
      </p>
      <StaffSearch
        value={query}
        onChange={setQuery}
        onSearch={(value) => {
          setApplied(value);
          setPages([undefined]);
        }}
        placeholder="Search item, invoice, buyer, centre or staff"
      />
      {error && (
        <WalletNotice onRetry={() => setVersion((v) => v + 1)}>
          {error}
        </WalletNotice>
      )}
      {!data && !error && <p role="status">Loading collected items…</p>}
      {data &&
        (data.items.length ? (
          <div className="lv-staff-collection-history">
            <table>
              <caption className="sr-only">Confirmed collected items</caption>
              <thead>
                <tr>
                  <th scope="col">Item / invoice</th>
                  <th scope="col">Buyer / centre</th>
                  <th scope="col">Collected / handed over by</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                      <small>
                        {item.itemNumber} · {item.invoiceNumber}
                      </small>
                    </td>
                    <td>
                      <strong>{item.buyerName}</strong>
                      <small>{item.location}</small>
                    </td>
                    <td>
                      <strong>
                        {item.collectedAt
                          ? new Date(item.collectedAt).toLocaleString('en-NG', {
                              timeZone: 'Africa/Lagos',
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }) + ' WAT'
                          : 'Time not recorded'}
                      </strong>
                      <small>
                        {item.staffName ?? 'Staff not recorded (legacy pickup)'}
                      </small>
                    </td>
                    <td>
                      <StaffBadge status="collected" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No collected items match this view.</p>
        ))}
      <WalletPagination
        page={pages.length}
        size={10}
        hasNext={!!data?.nextCursor}
        onPrevious={() => setPages((p) => (p.length > 1 ? p.slice(0, -1) : p))}
        onNext={() => {
          if (data?.nextCursor)
            setPages((p) => [...p, data.nextCursor ?? undefined]);
        }}
      />
    </PickupDeskPanel>
  );
}
