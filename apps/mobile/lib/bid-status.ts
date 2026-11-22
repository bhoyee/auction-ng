import { useEffect, useMemo, useState } from 'react';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import type { BidStatusState } from '@auction-ng/shared/bid-status-schemas';
import { apiUrl } from './config';
import { useLiveRead } from './live-read';
import { useSession } from './session';

type States = ReadonlyMap<string, BidStatusState>;
const empty: States = new Map();

/**
 * The signed-in buyer's own position on the displayed lots (owner decision
 * 2026-11-22), refreshed with the screen's live reads so Won/Lost and new
 * bids appear without a reload. Signed out or failed reads mean no pill.
 */
export function useBidStates(ids: string[]): States {
  const { session, manager } = useSession();
  const list = ids.slice(0, 50);
  const read = useLiveRead(
    () =>
      session && list.length
        ? manager.run((credentials) =>
            createBuyerClient(apiUrl, credentials).bidStatus(list),
          )
        : Promise.resolve({ items: [] }),
    [list.join(',')],
  );
  const items = read.data?.items;
  return useMemo(
    () => (items ? new Map(items.map((row) => [row.lotId, row.state])) : empty),
    [items],
  );
}

/**
 * True once this card has seen the buyer lead, so a just-placed bid that is
 * not saved yet still turns into "Outbid" when someone takes the lead.
 */
export function useSawLead(leading: boolean): boolean {
  const user = useSession().session?.user.id;
  const [saw, setSaw] = useState<string>();
  useEffect(() => {
    if (leading && user) setSaw(user);
  }, [leading, user]);
  return leading || (user !== undefined && saw === user);
}
