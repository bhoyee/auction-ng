'use client';
import { FirstVisitGuide as Guide } from '@auction-ng/ui/web/first-visit-guide';
import { useBuyer } from '../lib/session';

export function FirstVisitGuide({ demo }: { demo: boolean }) {
  const session = useBuyer();
  return session.ready && !session.tokens ? <Guide demo={demo} /> : null;
}
