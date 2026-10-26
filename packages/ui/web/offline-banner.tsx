'use client';
import { type ReactNode } from 'react';
import { WifiOff } from 'lucide-react';

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
