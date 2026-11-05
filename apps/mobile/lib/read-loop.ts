/** One focused reader; disposal fences late responses as well as future polls. */
export function startReadLoop<T>({
  load,
  onValue,
  onError,
  canRead,
  interval,
  enabled = true,
}: {
  load: () => Promise<T>;
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  canRead: () => boolean;
  interval: number;
  enabled?: boolean;
}) {
  let active = true,
    running = false;
  const refresh = async () => {
    if (!enabled || !active || running || !canRead()) return;
    running = true;
    try {
      const value = await load();
      if (active) onValue(value);
    } catch (error: unknown) {
      if (active) onError(error);
    } finally {
      running = false;
    }
  };
  void refresh();
  const timer = enabled
    ? setInterval(() => void refresh(), interval)
    : undefined;
  return {
    refresh,
    dispose() {
      active = false;
      if (timer !== undefined) clearInterval(timer);
    },
  };
}
