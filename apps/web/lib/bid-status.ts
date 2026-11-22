'use client';
import { useEffect, useState } from 'react';
import type { BidStatusState } from '@auction-ng/shared/bid-status-schemas';
import { apiUrl, useBuyer } from './session';

type States = ReadonlyMap<string, BidStatusState>;
const empty: States = new Map();

/**
 * The signed-in buyer's own position on the displayed lots (owner decision
 * 2026-11-22), read in one request after the page renders so public lists
 * stay cacheable. `ids` is a comma-joined list; signed-out viewers and
 * failed reads get no states, so no pill is shown.
 */
export function useBidStates(
  ids: string,
  revision: string | number = 0,
): States {
  const session = useBuyer();
  const [value, setValue] = useState<{ key: string; states: States }>();
  const user = session.tokens?.user.id;
  const key = `${user ?? ''}:${ids}:${revision}`;
  useEffect(() => {
    const tokens = session.tokens;
    const list = ids ? ids.split(',').slice(0, 50) : [];
    if (!tokens || !list.length) return;
    let active = true;
    void import('@auction-ng/api-client/watch-status')
      .then(({ createWatchStatusClient }) =>
        createWatchStatusClient(apiUrl, {
          accessToken: tokens.accessToken,
          deviceId: session.deviceId,
        }).bidStatus(list),
      )
      .then((result) => {
        if (active)
          setValue({
            key,
            states: new Map(result.items.map((row) => [row.lotId, row.state])),
          });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key, ids, session.tokens, session.deviceId]);
  return value?.key === key ? value.states : empty;
}

/**
 * True once this card has seen the buyer lead, so a just-placed bid that is
 * not persisted yet still turns into "Outbid" when someone takes the lead.
 */
export function useSawLead(leading: boolean): boolean {
  const user = useBuyer().tokens?.user.id;
  const [saw, setSaw] = useState<string>();
  useEffect(() => {
    if (leading && user) setSaw(user);
  }, [leading, user]);
  return leading || (user !== undefined && saw === user);
}
