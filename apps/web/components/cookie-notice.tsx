'use client';
import { useEffect, useState } from 'react';
import { CookieNotice as Notice } from '@auction-ng/ui/web/cookie-notice';
import {
  cookieNoticeKey,
  hasCookieAcknowledgement,
} from '../lib/cookie-notice';

export function CookieNotice() {
  const [visible, setVisible] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    try {
      setVisible(
        !hasCookieAcknowledgement(
          localStorage.getItem(cookieNoticeKey),
          Date.now(),
        ),
      );
    } catch {
      setVisible(true);
    }
    const open = () => setDetailsOpen(true);
    const sync = (event: StorageEvent) => {
      if (event.key === cookieNoticeKey)
        setVisible(!hasCookieAcknowledgement(event.newValue, Date.now()));
    };
    window.addEventListener('auction-ng-cookie-settings', open);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('auction-ng-cookie-settings', open);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const acknowledge = () => {
    try {
      localStorage.setItem(
        cookieNoticeKey,
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      );
    } catch {
      /* Dismiss for this visit when browser storage is unavailable. */
    }
    setVisible(false);
    setDetailsOpen(false);
  };
  return (
    <Notice
      visible={visible}
      detailsOpen={detailsOpen}
      onAcknowledge={acknowledge}
      onDetails={() => setDetailsOpen(true)}
      onClose={() => setDetailsOpen(false)}
    />
  );
}
