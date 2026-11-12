'use client';
import type { ReactNode } from 'react';
import { HomeWelcome } from '@auction-ng/ui/web/home-welcome';
import { useBuyer } from '../lib/session';

// Guests get the hero and guide in the initial HTML (home LCP). Buyers who
// were signed in on this device are marked on <html> before paint (see
// lib/session-hint.ts), so CSS shows them the loading line instead of a
// guest hero that would flash and shift once their welcome block loads.
export function HomeIntro({ children }: { children: ReactNode }) {
  const { ready, tokens } = useBuyer();
  if (ready && tokens)
    return <HomeWelcome name={tokens.user.name?.trim().split(/\s+/)[0]} />;
  return (
    <>
      {!ready && (
        <div
          className="agn-container agn-home-welcome-loading agn-home-returning-only"
          role="status"
        >
          Getting your auctions ready...
        </div>
      )}
      <div className="agn-home-guest-intro">{children}</div>
    </>
  );
}
