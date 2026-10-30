import type { TokenResponse } from '@auction-ng/shared';

// One renewal serves concurrent readers. Version fencing prevents a late response
// from restoring a signed-out account or replacing a newer same-origin tab update.
export function createSessionRenewal(options: {
  current: () => TokenResponse | null;
  version: () => number;
  apply: (value: TokenResponse | null) => void;
  refresh: () => Promise<TokenResponse>;
  announce: (value: TokenResponse) => void;
  lock: <T>(run: () => Promise<T>) => Promise<T>;
}) {
  let pending: Promise<TokenResponse | null> | undefined;
  return (failedToken?: string): Promise<TokenResponse | null> => {
    const current = options.current();
    if (failedToken && current?.accessToken !== failedToken)
      return Promise.resolve(current);
    if (pending) return pending;
    const version = options.version();
    pending = options.lock(async () => {
      if (version !== options.version()) return options.current();
      let value: TokenResponse;
      try {
        value = await options.refresh();
      } catch (cause: unknown) {
        if (version !== options.version()) return options.current();
        throw cause;
      }
      if (version !== options.version()) return options.current();
      if (current && current.user.id !== value.user.id) {
        options.apply(null);
        return null;
      }
      options.apply(value);
      options.announce(value);
      return value;
    });
    const result = pending;
    void result.then(
      () => {
        pending = undefined;
      },
      () => {
        pending = undefined;
      },
    );
    return result;
  };
}
