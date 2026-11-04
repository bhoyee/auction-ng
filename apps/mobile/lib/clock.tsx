import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { readServerTime } from '@auction-ng/api-client/clock';
import { apiUrl } from './config';
const Context = createContext(0);
export function NativeClockProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    let active = true,
      offset = 0,
      synced = false;
    const sync = async () => {
      if (AppState.currentState === 'background') return;
      const sent = Date.now();
      try {
        const result = await readServerTime(apiUrl);
        if (active) {
          offset = Date.parse(result.serverTime) - (sent + Date.now()) / 2;
          synced = true;
          setNow(Date.now() + offset);
        }
      } catch {
        /* Keep the last server-aligned clock; financial actions also require live state. */
      }
    };
    void sync();
    const tick = setInterval(() => {
      if (active && synced) setNow(Date.now() + offset);
    }, 1000);
    const timer = setInterval(() => void sync(), 30000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => {
      active = false;
      clearInterval(tick);
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return <Context.Provider value={now}>{children}</Context.Provider>;
}
export function useTick() {
  return useContext(Context);
}
