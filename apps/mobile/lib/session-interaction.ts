const listeners = new Set<() => void>();
/** App touches/input changes only; background reads never call this. */
export function recordBuyerInteraction() {
  for (const listener of listeners) listener();
}
export function observeBuyerInteraction(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
