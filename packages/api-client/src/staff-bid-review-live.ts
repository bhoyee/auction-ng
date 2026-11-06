import { createRealtimeClient } from './realtime';

/** Public lot events invalidate staff records; counts/identities still come from the protected API. */
export function watchBidReviewUpdates(
  baseUrl: string,
  lotIds: readonly string[],
  onChange: () => void,
) {
  const ids = [...new Set(lotIds)];
  if (!ids.length) return () => {};
  const client = createRealtimeClient(baseUrl, {});
  const streams = new Map<string, string>();
  let closed = false;
  let lastRefresh = 0;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let persisted: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    if (closed || pending !== undefined) return;
    pending = setTimeout(
      () => {
        pending = undefined;
        if (closed) return;
        lastRefresh = Date.now();
        onChange();
      },
      Math.max(0, lastRefresh + 1000 - Date.now()),
    );
  };
  const unsubscribe = client.subscribe(() => {
    let changed = false;
    for (const id of ids) {
      const state = client.getSnapshot(id);
      if (state.status !== 'live' || !state.lot) {
        streams.delete(id);
        continue;
      }
      if (streams.get(id) === state.lot.streamId) continue;
      streams.set(id, state.lot.streamId);
      changed = true;
    }
    if (!changed) return;
    refresh();
    // The price event can precede the worker's database commit. Reconcile again after persistence.
    if (persisted === undefined)
      persisted = setTimeout(() => {
        persisted = undefined;
        refresh();
      }, 1500);
  });
  const unwatch = ids.map((id) => client.watchLot(id));
  return () => {
    closed = true;
    clearTimeout(pending);
    clearTimeout(persisted);
    unsubscribe();
    unwatch.forEach((release) => release());
    client.close();
  };
}
