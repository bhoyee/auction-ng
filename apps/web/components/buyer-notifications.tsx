'use client';
import { useState } from 'react';
import { Bell } from '@auction-ng/ui/web/icons';
import { Button } from '@auction-ng/ui/web/button';
import type { createBuyerClient } from '@auction-ng/api-client/buyers';
import { apiUrl, useBuyer } from '../lib/session';
type Page = Awaited<
  ReturnType<ReturnType<typeof createBuyerClient>['notifications']>
>;
export function BuyerNotifications() {
  const { tokens, deviceId } = useBuyer();
  const [data, setData] = useState<{ userId: string; page: Page }>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = data?.userId === tokens?.user.id ? data?.page : undefined;
  async function load(cursor?: string) {
    if (!tokens || busy) return;
    setBusy(true);
    setError(false);
    const userId = tokens.user.id;
    try {
      const { createBuyerClient } =
        await import('@auction-ng/api-client/buyers');
      const page = await createBuyerClient(apiUrl, {
        accessToken: tokens.accessToken,
        deviceId,
      }).notifications({ limit: 10, cursor });
      setData({ userId, page });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="agn-menu agn-desktop-link"
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary aria-label="Notifications">
        <Bell size={20} />
      </summary>
      <div className="agn-account-menu">
        <strong>Notifications</strong>
        {error ? (
          <>
            <p>Updates could not be loaded.</p>
            <Button variant="ghost" onClick={() => void load()}>
              Try again
            </Button>
          </>
        ) : busy ? (
          <p role="status">Loading updates…</p>
        ) : !current?.items.length ? (
          <p>
            No auction-result notifications yet. Your wins will appear here.
          </p>
        ) : (
          <>
            {current.items.map((item) => (
              <a key={item.id} href={item.href}>
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
            {current.nextCursor && (
              <Button
                variant="ghost"
                onClick={() => void load(current.nextCursor ?? undefined)}
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
