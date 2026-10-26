'use client';
import { type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button } from './controls';

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
