'use client';
import { type ReactNode } from 'react';
import { Bookmark } from 'lucide-react';

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
