'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from '@auction-ng/ui/web/icons';
import { Button } from '@auction-ng/ui/web/button';
import { NotificationCount } from '@auction-ng/ui/web/notification-count';
import { ApiError } from '@auction-ng/api-client/auth';
import type { createBuyerClient } from '@auction-ng/api-client/buyers';
import { apiUrl, useBuyer } from '../lib/session';
type Client = ReturnType<typeof createBuyerClient>;
type Snapshot = {
  owner: string;
  page: Awaited<ReturnType<Client['notifications']>>;
  summary: Awaited<ReturnType<Client['notificationSummary']>>;
};
export function BuyerNotifications() {
  const { tokens, deviceId, renewSession } = useBuyer();
  const router = useRouter();
  const menu = useRef<HTMLDetailsElement>(null);
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [version, setVersion] = useState(0);
  const current = data?.owner === tokens?.user.id ? data : undefined;
  useEffect(() => {
    setCursor(undefined);
    setError(false);
  }, [tokens?.user.id]);
  const reload = () => setVersion((value) => value + 1);
  useEffect(() => {
    if (!tokens) return;
    let active = true,
      running = false,
      queued = false;
    const read = async () => {
      if (document.hidden || !navigator.onLine) return;
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        const { createBuyerClient } =
          await import('@auction-ng/api-client/buyers');
        const fetchPage = async (accessToken: string) => {
          const client = createBuyerClient(apiUrl, { accessToken, deviceId });
          const [page, summary] = await Promise.all([
            client.notifications({ limit: 10, cursor }),
            client.notificationSummary(),
          ]);
          return { owner: tokens.user.id, page, summary };
        };
        let value: Snapshot;
        try {
          value = await fetchPage(tokens.accessToken);
        } catch (cause: unknown) {
          if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
          const renewed = await renewSession(tokens.accessToken);
          if (!renewed || renewed.user.id !== tokens.user.id) throw cause;
          value = await fetchPage(renewed.accessToken);
        }
        if (active) {
          setData(value);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        running = false;
        if (queued && active) {
          queued = false;
          void read();
        }
      }
    };
    void read();
    const listener = () => void read();
    const timer = setInterval(listener, 15000);
    for (const event of [
      'focus',
      'online',
      'auction-ng-wallet-change',
      'auction-ng-notifications-change',
    ])
      window.addEventListener(event, listener);
    document.addEventListener('visibilitychange', listener);
    return () => {
      active = false;
      clearInterval(timer);
      for (const event of [
        'focus',
        'online',
        'auction-ng-wallet-change',
        'auction-ng-notifications-change',
      ])
        window.removeEventListener(event, listener);
      document.removeEventListener('visibilitychange', listener);
    };
  }, [tokens, deviceId, renewSession, cursor, version]);
  async function mark(ids: string[], href?: string) {
    if (!tokens || busy) return;
    setBusy(true);
    try {
      if (ids.length) {
        const { createBuyerClient } =
          await import('@auction-ng/api-client/buyers');
        await createBuyerClient(apiUrl, {
          accessToken: tokens.accessToken,
          deviceId,
        }).readNotifications(ids);
      }
      reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      if (href) {
        if (menu.current) menu.current.open = false;
        router.push(href);
      }
    }
  }
  const unread = error ? undefined : current?.summary.unread;
  return (
    <details
      ref={menu}
      className="agn-menu agn-notification-menu"
      onToggle={(event) => {
        if (event.currentTarget.open) reload();
      }}
    >
      <summary
        aria-label={
          unread === undefined
            ? 'Notifications'
            : `Notifications, ${unread} unread`
        }
      >
        <Bell size={20} />
        <NotificationCount count={unread} />
      </summary>
      <div className="agn-account-menu">
        <strong>Notifications</strong>
        {current && (
          <a href="/awaiting-pickup">
            Awaiting pickup <strong>{current.summary.awaitingPickup}</strong>
          </a>
        )}
        {error ? (
          <>
            <p>Updates could not be loaded. Try again.</p>
            <Button variant="ghost" onClick={reload}>
              Try again
            </Button>
          </>
        ) : !current ? (
          <p role="status">Loading updates...</p>
        ) : (
          <>
            {!current.page.items.length && (
              <p>No purchase or auction-result updates yet.</p>
            )}
            {current.page.items.map((item) => (
              <a
                key={item.id}
                href={item.href}
                data-unread={item.readAt === null}
                onClick={(event) => {
                  event.preventDefault();
                  void mark(item.readAt ? [] : [item.id], item.href);
                }}
              >
                <span>
                  {item.title}
                  <small>
                    {new Date(item.createdAt).toLocaleString('en-NG', {
                      timeZone: 'Africa/Lagos',
                    })}{' '}
                    WAT
                  </small>
                </span>
              </a>
            ))}
            {current.page.items.some((item) => item.readAt === null) && (
              <Button
                variant="ghost"
                busy={busy}
                onClick={() =>
                  void mark(
                    current.page.items
                      .filter((item) => item.readAt === null)
                      .map((item) => item.id),
                  )
                }
              >
                Mark these as read
              </Button>
            )}
            {cursor && (
              <Button variant="ghost" onClick={() => setCursor(undefined)}>
                Newest updates
              </Button>
            )}
            {current.page.nextCursor && (
              <Button
                variant="ghost"
                onClick={() => setCursor(current.page.nextCursor ?? undefined)}
              >
                Older updates
              </Button>
            )}
          </>
        )}
      </div>
    </details>
  );
}
