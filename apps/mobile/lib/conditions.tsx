import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  conditionDefaults,
  publicConditionListSchema,
  type ConditionKey,
  type PublicCondition,
} from '@auction-ng/shared';
import { mobileTheme as t } from '@auction-ng/ui';
import { apiUrl } from './config';

const CACHE_KEY = 'lotvanta.conditions.v1';
const Conditions = createContext<PublicCondition[]>([]);

// Condition labels and badge colours set in Lot setup. Cached on the phone so
// badges are right on weak networks; refreshed on launch and on foreground.
export function ConditionsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PublicCondition[]>([]);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (!raw || !active) return;
        const cached = publicConditionListSchema.safeParse(JSON.parse(raw));
        if (cached.success)
          setItems((current) => (current.length ? current : cached.data.items));
      })
      .catch(() => {});
    const refresh = async () => {
      try {
        const response = await fetch(new URL('/conditions', apiUrl), {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return;
        const parsed = publicConditionListSchema.parse(await response.json());
        if (!active) return;
        setItems(parsed.items);
        void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(parsed)).catch(
          () => {},
        );
      } catch {
        // Keep the cached or default badges.
      }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return <Conditions.Provider value={items}>{children}</Conditions.Provider>;
}

export function useConditionDisplay(key: ConditionKey) {
  const live = useContext(Conditions).find((c) => c.key === key);
  const display = live ?? conditionDefaults[key];
  return { label: display.label, palette: t.conditionPalette[display.colour] };
}
