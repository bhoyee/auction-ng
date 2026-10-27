'use client';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { RealtimeClient } from '@auction-ng/api-client/realtime';
import { realtimeUrl, useBuyer } from './session';
function useOwnedRealtime(enabled: boolean) {
  const { tokens, deviceId, ready } = useBuyer();
  const userId = tokens?.user.id ?? (ready ? 'public' : undefined);
  const credential = useRef(tokens);
  const authenticatedToken = useRef(tokens?.accessToken);
  credential.current = tokens;
  const [owned, setOwned] = useState<{
    userId: string;
    deviceId: string;
    client: RealtimeClient;
  } | null>(null);
  useEffect(() => {
    if (!userId || !enabled) {
      setOwned(null);
      return;
    }
    let active = true;
    let next: RealtimeClient | undefined;
    void import('@auction-ng/api-client/realtime').then(
      ({ createRealtimeClient }) => {
        if (!active) return;
        next = createRealtimeClient(realtimeUrl, {
          onOutbid: () => {
            window.dispatchEvent(new Event('auction-ng-wallet-change'));
            window.dispatchEvent(
              new CustomEvent('auction-ng-buyer-notice', {
                detail: {
                  userId,
                  message:
                    'You have been outbid. Open My bids to check your live position.',
                },
              }),
            );
          },
          credentials:
            userId === 'public'
              ? undefined
              : () => {
                  const current = credential.current;
                  if (!current || current.user.id !== userId)
                    throw new Error('Sign in again.');
                  return { accessToken: current.accessToken, deviceId };
                },
        });
        setOwned({ userId, deviceId, client: next });
      },
    );
    return () => {
      active = false;
      next?.close();
    };
  }, [userId, deviceId, enabled]);
  useEffect(() => {
    const changed = authenticatedToken.current !== tokens?.accessToken;
    authenticatedToken.current = tokens?.accessToken;
    if (changed && owned && owned.userId === userId)
      owned.client.reauthenticate();
  }, [owned, userId, tokens?.accessToken]);
  return owned && owned.userId === userId && owned.deviceId === deviceId
    ? owned.client
    : null;
}
const Context = createContext<{
  client: RealtimeClient | null;
  activate: () => void;
} | null>(null);
export function BuyerRealtimeProvider({ children }: { children: ReactNode }) {
  const [activated, setActivated] = useState(false);
  const client = useOwnedRealtime(activated);
  // Route transitions can briefly remove every consumer. Keep the owner alive:
  // watchLot releases subscriptions and disconnects the idle socket itself.
  const activate = useCallback(() => {
    setActivated(true);
  }, []);
  return (
    <Context.Provider value={{ client, activate }}>{children}</Context.Provider>
  );
}
export function useBuyerRealtime() {
  const context = useContext(Context);
  if (!context) throw new Error('Buyer realtime provider is missing.');
  const { client, activate } = context;
  useEffect(() => activate(), [activate]);
  return client;
}
