import type { RealtimeClient, LiveLotState } from './realtime';
type ReactHooks = {
  useEffect: (
    effect: () => void | (() => void),
    dependencies: readonly unknown[],
  ) => void;
  useSyncExternalStore: <T>(
    subscribe: (listener: () => void) => () => void,
    snapshot: () => T,
    serverSnapshot?: () => T,
  ) => T;
};
// Bind once at the app boundary so Expo and Next always use their own React copy.
export function createUseLiveLot({
  useEffect,
  useSyncExternalStore,
}: ReactHooks) {
  return function useLiveLot(
    client: RealtimeClient,
    lotId: string,
  ): LiveLotState {
    useEffect(() => client.watchLot(lotId), [client, lotId]);
    return useSyncExternalStore(
      client.subscribe,
      () => client.getSnapshot(lotId),
      () => client.getSnapshot(lotId),
    );
  };
}
