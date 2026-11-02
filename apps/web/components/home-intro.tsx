'use client';
import type { ReactNode } from 'react';
import { HomeWelcome } from '@auction-ng/ui/web/home-welcome';
import { useBuyer } from '../lib/session';
export function HomeIntro({ children }: { children: ReactNode }) {
  const { ready, tokens } = useBuyer();
  if (!ready)
    return (
      <div className="agn-container agn-home-welcome-loading" role="status">
        Getting your auctions ready...
      </div>
    );
  return tokens ? (
    <HomeWelcome name={tokens.user.name?.trim().split(/\s+/)[0]} />
  ) : (
    <>{children}</>
  );
}
