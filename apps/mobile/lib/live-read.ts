import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@auction-ng/api-client/auth';
import { AppState } from 'react-native';
import { useSession } from './session';
export function useLiveRead<T>(
  load: () => Promise<T>,
  dependencies: readonly unknown[] = [],
  interval = 15000,
) {
  const { session, online } = useSession();
  const owner = session?.user.id ?? 'public';
  const [snapshot, setSnapshot] = useState<{ owner: string; value: T }>(),
    [error, setError] = useState(''),
    [version, setVersion] = useState(0);
  const latest = useRef(load);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  latest.current = load;
  useEffect(() => {
    let active = true,
      busy = false;
    const read = async () => {
      if (busy || !online || AppState.currentState === 'background') return;
      busy = true;
      try {
        const value = await latest.current();
        if (active) {
          setSnapshot({ owner, value });
          setError('');
        }
      } catch (error) {
        if (active) {
          if (
            error instanceof ApiError &&
            [401, 403, 404].includes(error.status)
          )
            setSnapshot(undefined);
          setError('Could not refresh. Check your connection and try again.');
        }
      } finally {
        busy = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), interval);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void read();
    });
    return () => {
      active = false;
      clearInterval(timer);
      sub.remove();
    };
    // Callers pass primitive query keys; loaders are held in a ref to avoid render loops.
  }, [owner, online, version, ...dependencies]);
  return {
    data: snapshot?.owner === owner ? snapshot.value : undefined,
    error,
    refresh,
  };
}
