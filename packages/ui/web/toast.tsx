'use client';
import { type ReactNode } from 'react';
import { CircleAlert, CheckCircle2, Clock3, X } from 'lucide-react';
import { Button } from './button';

export function Toast({
  children,
  tone = 'success',
  onClose,
  floating = false,
  emphasis = false,
}: {
  children: ReactNode;
  tone?: 'success' | 'error' | 'info';
  onClose: () => void;
  floating?: boolean;
  emphasis?: boolean;
}) {
  const Icon =
    tone === 'success' ? CheckCircle2 : tone === 'info' ? Clock3 : CircleAlert;
  return (
    <div
      className={`agn-toast agn-toast--${tone}${floating ? ' agn-toast--floating' : ''}${emphasis || floating ? ' agn-toast--emphasis' : ''}`}
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
