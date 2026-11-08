'use client';
import { useEffect, useState } from 'react';
import type { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';
import { ApiError } from '@auction-ng/api-client/auth';
import type { MonitorLotDetail } from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { productImageSource } from '@auction-ng/ui/web';
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
  const at = (value: string) =>
    new Intl.DateTimeFormat('en-NG', {
      timeZone: 'Africa/Lagos',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  return (
    <section className="lv-staff-panel">
      <Button variant="secondary" onClick={onBack}>
        Back to Live monitor
      </Button>
      {error && (
        <p role="alert" className="lv-admin-widget-error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading item…</p>}
      {data && (
        <>
          <h1>{data.title}</h1>
          <p>
            {data.reference} · {data.status}
          </p>
          <div className="lv-monitor-lot-photos">
            {data.images.map((i) => (
              <a
                key={i.id}
                href={
                  new URL(
                    productImageSource(i.url),
                    process.env.NEXT_PUBLIC_BUYER_URL ||
                      'http://localhost:3300',
                  ).href
                }
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={
                    new URL(
                      productImageSource(i.thumbnailUrl ?? i.url),
                      process.env.NEXT_PUBLIC_BUYER_URL ||
                        'http://localhost:3300',
                    ).href
                  }
                  alt={data.title}
                  loading="lazy"
                  width={180}
                  height={180}
                />
              </a>
            ))}
          </div>
          <h2>Item details</h2>
          <p>{data.description}</p>
          <dl className="lv-monitor-lot-facts">
            <dt>Condition</dt>
            <dd>{data.condition}</dd>
            <dt>Category</dt>
            <dd>{data.category}</dd>
            <dt>Pickup centre</dt>
            <dd>{data.location}</dd>
            <dt>Original run time</dt>
            <dd>
              {data.runTimeMs === null
                ? 'Not recorded'
                : data.runTimeMs / 3600000 + ' hours'}
            </dd>
            <dt>Starts</dt>
            <dd>{at(data.startAt)} WAT</dd>
            <dt>Current deadline</dt>
            <dd>{at(data.endAt)} WAT</dd>
            <dt>Batch</dt>
            <dd>Not recorded — batch tracking is not configured yet.</dd>
            <dt>Stock cost</dt>
            <dd>Not recorded — no cost record exists for this item.</dd>
          </dl>
          <h2>Change history</h2>
          <table className="lv-monitor-bid-list">
            <thead>
              <tr>
                <th>Staff / time</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.changes.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.actor}
                    <small>{at(c.at)} WAT</small>
                  </td>
                  <td>{c.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.changes.length && <p>No recorded changes.</p>}
          <div className="lv-monitor-control-options">
            <Button
              variant="secondary"
              disabled={!pages.length}
              onClick={() => {
                setCursor(pages.at(-1));
                setPages((p) => p.slice(0, -1));
              }}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={!data.nextCursor}
              onClick={() => {
                setPages((p) => [...p, cursor]);
                setCursor(data.nextCursor ?? undefined);
              }}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
