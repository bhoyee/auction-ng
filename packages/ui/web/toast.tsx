'use client';
import { type ReactNode } from 'react';
import { CircleAlert, CheckCircle2, X } from 'lucide-react';
import { Button } from './controls';

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
