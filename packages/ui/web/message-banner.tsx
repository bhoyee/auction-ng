'use client';
import { Bell, X } from 'lucide-react';
import { foregroundMessageCopy } from '@auction-ng/shared/buyer-schemas';
export function MessageBanner({
  onRead,
  onClose,
}: {
  onRead: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="agn-message-banner" role="status" aria-live="polite">
      <button
        type="button"
        className="agn-message-banner-main"
        onClick={onRead}
        aria-label="Read new message from LotVanta"
      >
        <Bell size={22} aria-hidden="true" />
        <span>
          <strong>{foregroundMessageCopy.title}</strong>
          <span>{foregroundMessageCopy.summary}</span>
          <b>{foregroundMessageCopy.action}</b>
        </span>
      </button>
      <button
        type="button"
        className="agn-message-banner-close"
        aria-label="Dismiss message notification"
        onClick={onClose}
      >
        <X size={20} aria-hidden="true" />
      </button>
    </aside>
  );
}
