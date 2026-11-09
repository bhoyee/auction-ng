import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ApiError } from '@auction-ng/api-client/auth';
import { AppState } from 'react-native';
import { useSession } from './session';
import { readErrorMessage } from './read-errors';
import { startReadLoop } from './read-loop';
export function useLiveRead<T>(
  load: () => Promise<T>,
  dependencies: readonly unknown[] = [],
  interval = 15000,
  enabled = true,
) {
  const { session, online } = useSession();
  const owner = session?.user.id ?? 'public';
  const [snapshot, setSnapshot] = useState<{ owner: string; value: T }>(),
    [error, setError] = useState(''),
    [version, setVersion] = useState(0);
  const latest = useRef(load);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  latest.current = load;
  useFocusEffect(
    useCallback(() => {
      const loop = startReadLoop({
        enabled,
        interval,
        load: () => latest.current(),
        canRead: () => online && AppState.currentState !== 'background',
        onValue: (value) => {
          setSnapshot({ owner, value });
          setError('');
        },
        onError: (error) => {
          if (
            error instanceof ApiError &&
            [401, 403, 404].includes(error.status)
          )
            setSnapshot(undefined);
          setError(readErrorMessage(error));
        },
      });
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void loop.refresh();
      });
      return () => {
        loop.dispose();
        sub.remove();
      };
      // Callers pass primitive query keys; loaders are held in a ref to avoid render loops.
    }, [owner, online, version, interval, enabled, ...dependencies]),
  );
  return {
    data: snapshot?.owner === owner ? snapshot.value : undefined,
    error,
    refresh,
  };
}
