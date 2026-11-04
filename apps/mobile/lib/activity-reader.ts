// Coalesce summary requests, but never lose a refresh requested during a read.
export function createActivityReader<T>(
  load: () => Promise<T>,
  publish: (value: T) => void,
) {
  let active = true,
    running = false,
    queued = false;
  return {
    async refresh() {
      if (!active) return;
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        do {
          queued = false;
          try {
            const value = await load();
            if (active) publish(value);
          } catch {
            /* Preserve the last confirmed value while offline. */
          }
        } while (active && queued);
      } finally {
        running = false;
      }
    },
    dispose() {
      active = false;
      queued = false;
    },
  };
}
