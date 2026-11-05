'use client';
import { useState, useEffect, useRef } from 'react';
import { Bell, Mail, Check, ArrowUpRight, RefreshCw } from 'lucide-react';
import type { StaffInboxPage } from '@auction-ng/shared';
import { Dialog } from './dialog';
import { Button } from './button';
export function StaffNotificationBell({
  data,
  error,
  busy,
  connected,
  online = true,
  onRead,
  onOpen,
  onNext,
  onPrevious,
  onRetry,
  hasPrevious,
}: {
  data?: StaffInboxPage;
  error: string;
  busy: boolean;
  connected: boolean;
  online?: boolean;
  onRead: (ids: string[]) => Promise<void>;
  onOpen: (href: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onRetry: () => void;
  hasPrevious: boolean;
}) {
  const [open, setOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error && open) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error, open]);
  return (
    <>
      <button
        type="button"
        className="lv-staff-bell"
        aria-label={
          'Notifications' +
          (data?.unreadCount ? ', ' + data.unreadCount + ' unread' : '')
        }
        onClick={() => setOpen(true)}
      >
        <Bell size={20} />
        {!!data?.unreadCount && (
          <span className="lv-staff-bell-count">
            {data.unreadCount > 99 ? '99+' : data.unreadCount}
          </span>
        )}
      </button>
      <Dialog open={open} title="Notifications" onClose={() => setOpen(false)}>
        <div className="lv-staff-inbox">
          <div className="lv-staff-inbox-toolbar">
            <span
              className={
                'lv-staff-inbox-connection' +
                (connected && online ? ' is-live' : '')
              }
            >
              {!online
                ? 'Offline — showing saved alerts'
                : connected
                  ? 'Live updates'
                  : 'Updating automatically'}
            </span>
            <Button
              size="small"
              disabled={!online || busy || !data?.items.some((r) => !r.readAt)}
              onClick={() =>
                void onRead(
                  data?.items.filter((r) => !r.readAt).map((r) => r.id) ?? [],
                ).catch(() => {})
              }
            >
              <Check size={15} />
              Mark page read
            </Button>
          </div>
          <p className="agn-hint">
            Approval requests, completed sales and support activity for your
            role. Email delivery is shown on each alert.
          </p>
          {data?.emailMode === 'preview' && (
            <p className="agn-hint">
              Email preview mode: alerts are saved locally and are not sent to
              external inboxes.
            </p>
          )}
          {data?.emailMode === 'off' && (
            <p className="agn-hint">
              Email alerts are not configured. Your in-app notifications still
              update here.
            </p>
          )}
          {error && (
            <div
              ref={errorRef}
              role="alert"
              className="lv-staff-message lv-staff-message--error"
            >
              {error}
              <Button size="small" disabled={!online} onClick={onRetry}>
                <RefreshCw size={14} />
                Retry
              </Button>
            </div>
          )}
          {!data && !error ? (
            <p role="status">Loading notifications…</p>
          ) : data?.items.length === 0 ? (
            <div className="lv-staff-empty">
              <Bell size={28} />
              <h3>You’re up to date</h3>
              <p>New activity will appear here automatically.</p>
            </div>
          ) : (
            <ul className="lv-staff-inbox-list">
              {data?.items.map((row) => (
                <li key={row.id} className={!row.readAt ? 'is-unread' : ''}>
                  <div className="lv-staff-inbox-heading">
                    <strong>{row.title}</strong>
                    {!row.readAt && (
                      <span className="lv-staff-inbox-new">New</span>
                    )}
                  </div>
                  <p>{row.description}</p>
                  <div className="lv-staff-inbox-meta">
                    <time dateTime={row.createdAt}>
                      {new Date(row.createdAt).toLocaleString('en-NG', {
                        timeZone: 'Africa/Lagos',
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      WAT
                    </time>
                    <span
                      className={'lv-staff-email-state is-' + row.emailStatus}
                    >
                      <Mail size={13} />
                      {row.emailMode === 'off'
                        ? 'Email not configured'
                        : row.emailMode === 'preview'
                          ? row.emailStatus === 'sent'
                            ? 'Email preview saved'
                            : row.emailStatus === 'failed'
                              ? 'Email preview unavailable'
                              : 'Email preview queued'
                          : row.emailStatus === 'sent'
                            ? 'Email sent'
                            : row.emailStatus === 'failed'
                              ? 'Email not delivered'
                              : 'Email queued'}
                    </span>
                  </div>
                  <Button
                    size="small"
                    disabled={!online || busy}
                    onClick={() => {
                      void onRead([row.id])
                        .then(() => {
                          setOpen(false);
                          onOpen(row.href);
                        })
                        .catch(() => {});
                    }}
                  >
                    Open update
                    <ArrowUpRight size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {(hasPrevious || data?.nextCursor) && (
            <div className="lv-staff-inbox-toolbar">
              <Button
                size="small"
                disabled={!online || !hasPrevious || busy}
                onClick={onPrevious}
              >
                Previous
              </Button>
              <Button
                size="small"
                disabled={!online || !data?.nextCursor || busy}
                onClick={onNext}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
