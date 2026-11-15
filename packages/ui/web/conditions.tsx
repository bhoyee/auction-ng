'use client';
import { createContext, useContext, type ReactNode } from 'react';
import {
  conditionDefaults,
  type ConditionColour,
  type ConditionKey,
  type PublicCondition,
} from '@auction-ng/shared/conditions';
import { tokens } from '../tokens';

type Display = { label: string; colour: ConditionColour };
type Live = {
  map: Partial<Record<ConditionKey, Display>>;
  list: PublicCondition[];
};
const Conditions = createContext<Live>({ map: {}, list: [] });

// Live condition labels and colours from Lot setup; badges fall back to the
// defaults if they could not be loaded.
export function ConditionsProvider({
  conditions,
  children,
}: {
  conditions: PublicCondition[];
  children: ReactNode;
}) {
  const map: Partial<Record<ConditionKey, Display>> = {};
  for (const c of conditions) map[c.key] = { label: c.label, colour: c.colour };
  return (
    <Conditions.Provider value={{ map, list: conditions }}>
      {children}
    </Conditions.Provider>
  );
}

export function useConditionDisplay(key: ConditionKey) {
  const display = useContext(Conditions).map[key] ?? conditionDefaults[key];
  return {
    label: display.label,
    style: tokens.conditionPalette[display.colour],
  };
}

// Conditions buyers can filter by, in staff order (switched-off ones hidden).
export function useConditionOptions() {
  const { list } = useContext(Conditions);
  const source = list.length
    ? list.filter((c) => c.active)
    : (Object.keys(conditionDefaults) as ConditionKey[]).map((key) => ({
        key,
        ...conditionDefaults[key],
      }));
  return source.map((c) => ({ value: c.key, label: c.label }));
}
