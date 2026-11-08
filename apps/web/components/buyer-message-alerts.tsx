'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createBuyerClient,
  createForegroundMessageTracker,
  FOREGROUND_MESSAGE_DISPLAY_MS,
  FOREGROUND_MESSAGE_POLL_MS,
  type ForegroundMessage,
} from '@auction-ng/api-client/buyers';
import { ApiError } from '@auction-ng/api-client/auth';
import { MessageBanner } from '@auction-ng/ui/web/message-banner';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Button } from '@auction-ng/ui/web/button';
import { apiUrl, useBuyer } from '../lib/session';

export function BuyerMessageAlerts() {
  const session = useBuyer(),
    router = useRouter();
  const owner =
    session.tokens?.user.role === 'buyer' ? session.tokens.user.id : undefined;
  const latest = useRef(session);
  latest.current = session;
  const [notice, setNotice] = useState<{
    owner: string;
    message: ForegroundMessage;
  }>();
  const [selected, setSelected] = useState<{
    owner: string;
    message: ForegroundMessage;
  }>();
  useEffect(() => {
    setNotice(undefined);
    setSelected(undefined);
    if (!owner) return;
    const tracker = createForegroundMessageTracker();
    let active = true,
      running = false;
    const read = async () => {
      if (!active || running || document.hidden || !navigator.onLine) return;
      running = true;
      try {
        const current = latest.current;
        if (current.tokens?.user.id !== owner) return;
        const fetchPage = (accessToken: string) =>
          createBuyerClient(apiUrl, {
            accessToken,
            deviceId: current.deviceId,
          }).bidderMessages({ limit: 1 });
        let page;
        try {
          page = await fetchPage(current.tokens.accessToken);
        } catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
          const renewed = await current.renewSession(
            current.tokens.accessToken,
          );
          if (renewed?.user.id !== owner) return;
          page = await fetchPage(renewed.accessToken);
        }
        if (!active || latest.current.tokens?.user.id !== owner) return;
        const fresh = tracker.observe(page.items),
          message = fresh.at(-1);
        if (message) {
          setNotice({ owner, message });
          window.dispatchEvent(new Event('auction-ng-notifications-change'));
        }
      } catch {
        /* The inbox remains available; a foreground alert must never interrupt a purchase. */
      } finally {
        running = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), FOREGROUND_MESSAGE_POLL_MS);
    const refresh = () => void read();
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [owner]);
  const current = notice?.owner === owner ? notice : undefined;
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(
      () => setNotice(undefined),
      FOREGROUND_MESSAGE_DISPLAY_MS,
    );
    return () => clearTimeout(timer);
  }, [current]);
  const message =
    selected && selected.owner === owner ? selected.message : undefined;
  async function openMessage() {
    const tokens = latest.current.tokens;
    if (!current || !tokens || tokens.user.id !== owner) return;
    setSelected(current);
    setNotice(undefined);
    try {
      await createBuyerClient(apiUrl, {
        accessToken: tokens.accessToken,
        deviceId: latest.current.deviceId,
      }).readNotifications([current.message.id]);
      window.dispatchEvent(new Event('auction-ng-notifications-change'));
    } catch {
      /* Reading remains possible without falsely claiming the server marked it read. */
    }
  }
  return (
    <>
      {current && (
        <MessageBanner
          onRead={() => void openMessage()}
          onClose={() => setNotice(undefined)}
        />
      )}
      <Dialog
        open={!!message}
        title="Message from LotVanta"
        onClose={() => setSelected(undefined)}
      >
        {message && (
          <>
            <p className="agn-bidder-message-body">{message.title}</p>
            <Button
              onClick={() => {
                setSelected(undefined);
                router.push(message.href);
              }}
            >
              View item
            </Button>
          </>
        )}
      </Dialog>
    </>
  );
}
