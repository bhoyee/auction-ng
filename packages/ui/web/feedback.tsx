'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Bookmark, CircleAlert, CheckCircle2, WifiOff, X } from 'lucide-react';
import { Button } from './controls';

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="agn-state">
      <Bookmark size={24} strokeWidth={1.75} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function ErrorState({
  title = 'We could not load these lots',
  children = 'Check your connection and try again.',
  onRetry,
}: {
  title?: string;
  children?: ReactNode;
  onRetry: () => void;
}) {
  return (
    <div className="agn-state agn-state--error" role="alert">
      <CircleAlert size={24} strokeWidth={1.75} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
export function OfflineBanner({
  children = 'Reconnecting… Prices will refresh before you can bid.',
}: {
  children?: ReactNode;
}) {
  return (
    <div className="agn-offline" role="status">
      <WifiOff size={20} strokeWidth={1.75} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
export function Toast({
  children,
  tone = 'success',
  onClose,
}: {
  children: ReactNode;
  tone?: 'success' | 'error';
  onClose: () => void;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : CircleAlert;
  return (
    <div
      className={`agn-toast agn-toast--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      <p>{children}</p>
      <Button variant="ghost" aria-label="Dismiss message" onClick={onClose}>
        <X size={20} strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  presentation = 'dialog',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  presentation?: 'dialog' | 'sheet';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
    return () => {
      if (element.open) element.close();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const targets = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = targets[0];
        const last = targets.at(-1);
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && event.target === first) {
          event.preventDefault();
          last.focus();
        }
        if (!event.shiftKey && event.target === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      aria-labelledby={id}
      className={`agn-dialog agn-dialog--${presentation}`}
      onCancel={onClose}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      <div className="agn-dialog-heading">
        <h2 id={id}>{title}</h2>
        <Button variant="ghost" aria-label="Close dialog" onClick={onClose}>
          <X size={24} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
