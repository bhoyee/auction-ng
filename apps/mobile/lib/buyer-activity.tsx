import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { useSession } from './session';
import { apiUrl } from './config';
import { createActivityReader } from './activity-reader';

type Counts = { watching: number; unread: number; awaitingPickup: number };
const Context = createContext<{
  counts: Counts | null;
  refresh: () => void;
} | null>(null);
export function BuyerActivityProvider({ children }: { children: ReactNode }) {
  const { session, manager, online } = useSession();
  const owner = session?.user.id;
  const [snapshot, setSnapshot] = useState<{ owner: string; counts: Counts }>();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (!owner || !online) return;
    const reader = createActivityReader(
      async () => {
        const [watch, summary] = await manager.run((c) => {
          const client = createBuyerClient(apiUrl, c);
          return Promise.all([
            client.watchCount(),
            client.notificationSummary(),
          ]);
        });
        return {
          watching: watch.count,
          unread: summary.unread,
          awaitingPickup: summary.awaitingPickup,
        };
      },
      (counts) =>
        setSnapshot((previous) =>
          previous?.owner === owner &&
          previous.counts.watching === counts.watching &&
          previous.counts.unread === counts.unread &&
          previous.counts.awaitingPickup === counts.awaitingPickup
            ? previous
            : { owner, counts },
        ),
    );
    const read = async () => {
      if (AppState.currentState === 'background') return;
      await reader.refresh();
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void read();
    });
    return () => {
      reader.dispose();
      clearInterval(timer);
      listener.remove();
    };
  }, [owner, manager, online, revision]);
  return (
    <Context.Provider
      value={{
        counts: owner && snapshot?.owner === owner ? snapshot.counts : null,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useBuyerActivity() {
  const context = useContext(Context);
  if (!context) throw Error('Buyer activity provider missing.');
  return context;
}
