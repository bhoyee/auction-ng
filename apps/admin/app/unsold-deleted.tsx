'use client';
import { useEffect, useState } from 'react';
import {
  formatNaira,
  UNSOLD_RESTORE_DAYS,
  type UnsoldDismissedPage,
} from '@auction-ng/shared';
import type { createRelistClient } from '@auction-ng/api-client/relist';
import { ApiError } from '@auction-ng/api-client/auth';
import { Button } from '@auction-ng/ui/web/button';
import { ImageOff, RotateCcw } from '@auction-ng/ui/web/icons';
import { productImageSource } from '@auction-ng/ui/web/demo-image';
import { wat } from './unsold-schedule';

const REFRESH_EVENTS = ['giddydeal:staff-refresh', 'focus', 'online'] as const;

const daysLeft = (until: string) => {
  const days = Math.ceil((Date.parse(until) - Date.now()) / 86_400_000);
  return days <= 1 ? 'Last day to restore' : `${days} days left to restore`;
};

/** Items deleted from Unsold review that can still be restored. */
export function UnsoldDeleted({
  client,
  online,
}: {
  client: ReturnType<typeof createRelistClient>;
  online: boolean;
}) {
  const [cursor, setCursor] = useState<string>();
  const [pages, setPages] = useState<(string | undefined)[]>([]);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<UnsoldDismissedPage>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [restoring, setRestoring] = useState<string>();
  useEffect(() => {
    let active = true;
    const read = () => {
      if (document.hidden || !navigator.onLine) return;
      client
        .dismissed({ cursor, limit: 20 })
        .then((value) => {
          if (!active) return;
          setData(value);
          setError('');
        })
        .catch((cause: unknown) => {
          if (cause instanceof ApiError && cause.status === 401)
            window.dispatchEvent(new Event('giddydeal:staff-unauthorized'));
          if (active) setError('Deleted items could not be loaded.');
        });
    };
    read();
    for (const event of REFRESH_EVENTS) window.addEventListener(event, read);
    return () => {
      active = false;
      for (const event of REFRESH_EVENTS)
        window.removeEventListener(event, read);
    };
  }, [client, cursor, version]);

  async function restore(id: string) {
    setRestoring(id);
    setMessage('');
    setFailure('');
    try {
      setMessage((await client.restore(id)).message);
      window.dispatchEvent(new Event('giddydeal:staff-refresh'));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401)
        window.dispatchEvent(new Event('giddydeal:staff-unauthorized'));
      setFailure(
        cause instanceof ApiError && cause.status === 409
          ? 'This item can’t be restored. Its 30 days have passed or it is archived.'
          : 'The item couldn’t be restored. Check your connection and try again.',
      );
      setVersion((v) => v + 1);
    } finally {
      setRestoring(undefined);
    }
  }

  return (
    <>
      <p className="lv-unsold-note">
        Deleted items can be restored for {UNSOLD_RESTORE_DAYS} days. After that
        they can’t come back to Unsold review, but stay in Lots.
      </p>
      {message && (
        <p className="lv-unsold-toast" role="status">
          {message}
        </p>
      )}
      {failure && (
        <p className="lv-relist-error" role="alert">
          {failure}
        </p>
      )}
      {error && data && (
        <p className="lv-unsold-note" role="status">
          Couldn’t refresh. Showing the last list.
        </p>
      )}
      {!data && !error ? (
        <div
          className="lv-unsold-skeleton"
          aria-busy="true"
          aria-label="Loading deleted items"
        />
      ) : !data ? (
        <div className="lv-unsold-state" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => setVersion((v) => v + 1)}>
            Try again
          </Button>
        </div>
      ) : !data.items.length ? (
        <div className="lv-unsold-state">
          <h3>No deleted items.</h3>
          <p>Items you delete from Unsold review appear here.</p>
        </div>
      ) : (
        <ul className="lv-unsold-list">
          {data.items.map((item) => (
            <li key={item.id} className="lv-unsold-row" data-deleted="">
              <span className="lv-unsold-photo">
                {item.imageUrl ? (
                  // Staff thumbnails come from our own image store.
                  <img
                    src={productImageSource(item.imageUrl)}
                    alt=""
                    loading="lazy"
                    width={64}
                    height={64}
                  />
                ) : (
                  <ImageOff size={20} aria-hidden="true" />
                )}
              </span>
              <span className="lv-unsold-main">
                <strong>{item.title}</strong>
                <small>
                  {item.lotNumber} · Deleted by {item.deletedBy},{' '}
                  {wat(item.deletedAt)}
                </small>
                <small>{daysLeft(item.restoreUntil)}</small>
              </span>
              <span className="lv-unsold-price">
                <b>{formatNaira(item.startPriceKobo)}</b>
                <small>starting price</small>
              </span>
              <Button
                variant="secondary"
                size="small"
                busy={restoring === item.id}
                disabled={!online || restoring !== undefined}
                aria-label={`Restore ${item.title}`}
                onClick={() => void restore(item.id)}
              >
                <RotateCcw size={16} aria-hidden="true" /> Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
      {(pages.length > 0 || data?.nextCursor) && (
        <nav className="lv-staff-pagination" aria-label="Deleted item pages">
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
          <span>Page {pages.length + 1}</span>
          <Button
            variant="secondary"
            disabled={!data?.nextCursor}
            onClick={() => {
              setPages((p) => [...p, cursor]);
              setCursor(data?.nextCursor ?? undefined);
            }}
          >
            Next
          </Button>
        </nav>
      )}
    </>
  );
}
