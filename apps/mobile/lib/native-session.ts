import { ApiError, createAuthClient } from '@auction-ng/api-client/auth';
import type { TokenResponse } from '@auction-ng/shared/auth-session-schemas';
type Store = {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
  clear: () => Promise<void>;
};
type Auth = ReturnType<typeof createAuthClient>;
export type MobileIdentity = { deviceId: string; refreshToken: string };
export function createNativeSession(options: {
  store: Store;
  deviceId: () => string;
  auth: (device: string) => Auth;
  changed: (session: TokenResponse | null) => void;
}) {
  let identity: MobileIdentity | undefined,
    session: TokenResponse | null = null,
    generation = 0;
  let renewal: Promise<TokenResponse | null> | undefined;
  let writes = Promise.resolve();
  const persist = (work: () => Promise<void>) => {
    writes = writes.catch(() => {}).then(work);
    return writes;
  };
  async function apply(value: TokenResponse, version: number) {
    if (version !== generation) return null;
    if (!identity || !value.refreshToken)
      throw Error('Secure mobile session is incomplete.');
    const next = {
      deviceId: identity.deviceId,
      refreshToken: value.refreshToken,
    };
    await persist(() => options.store.write(JSON.stringify(next)));
    if (version !== generation) return null;
    identity = next;
    session = value;
    options.changed(value);
    return value;
  }
  const api = () => {
    if (!identity) throw Error('Session is not ready.');
    return options.auth(identity.deviceId);
  };
  const renew = () => {
    if (renewal) return renewal;
    if (!identity) return Promise.resolve(null);
    const version = generation,
      refresh = identity.refreshToken;
    renewal = (async () => {
      try {
        return await apply(await api().refresh(refresh), version);
      } catch (error) {
        if (
          version === generation &&
          error instanceof ApiError &&
          [401, 403].includes(error.status)
        ) {
          generation++;
          session = null;
          identity = {
            deviceId: identity?.deviceId ?? options.deviceId(),
            refreshToken: '',
          };
          await persist(() => options.store.clear());
          options.changed(null);
        }
        throw error;
      }
    })();
    void renewal
      .finally(() => {
        renewal = undefined;
      })
      .catch(() => {});
    return renewal;
  };
  return {
    async restore() {
      const stored = await options.store.read();
      if (stored) {
        try {
          const value: unknown = JSON.parse(stored);
          if (
            value &&
            typeof value === 'object' &&
            'deviceId' in value &&
            'refreshToken' in value &&
            typeof value.deviceId === 'string' &&
            /^[0-9a-f-]{36}$/.test(value.deviceId) &&
            typeof value.refreshToken === 'string' &&
            (value.refreshToken === '' ||
              /^[A-Za-z0-9_-]{43}$/.test(value.refreshToken))
          )
            identity = {
              deviceId: value.deviceId,
              refreshToken: value.refreshToken,
            };
        } catch {
          /* Invalid secure storage is discarded. */
        }
      }
      identity ??= { deviceId: options.deviceId(), refreshToken: '' };
      if (identity.refreshToken) return renew();
      await persist(() => options.store.write(JSON.stringify(identity)));
      return null;
    },
    get identity() {
      return identity;
    },
    get session() {
      return session;
    },
    get auth() {
      return api();
    },
    async signIn(value: TokenResponse) {
      const version = ++generation;
      return apply(value, version);
    },
    async logout() {
      if (identity?.refreshToken) await api().logout(identity.refreshToken);
      generation++;
      session = null;
      await persist(() => options.store.clear());
      identity = {
        deviceId: identity?.deviceId ?? options.deviceId(),
        refreshToken: '',
      };
      options.changed(null);
    },
    async invalidate() {
      generation++;
      session = null;
      await persist(() => options.store.clear());
      identity = {
        deviceId: identity?.deviceId ?? options.deviceId(),
        refreshToken: '',
      };
      options.changed(null);
    },
    renew,
    async run<T>(
      work: (credentials: {
        accessToken: string;
        deviceId: string;
      }) => Promise<T>,
      expectedOwner?: string,
    ): Promise<T> {
      const current = session,
        version = generation;
      if (
        !current ||
        !identity ||
        (expectedOwner && current.user.id !== expectedOwner)
      )
        throw new ApiError(401);
      const call = (token: TokenResponse) =>
        work({
          accessToken: token.accessToken,
          deviceId: identity?.deviceId ?? '',
        });
      try {
        const result = await call(current);
        if (version !== generation) throw new ApiError(401);
        return result;
      } catch (error) {
        if (
          !(error instanceof ApiError) ||
          error.status !== 401 ||
          version !== generation
        )
          throw error;
        const fresh =
          session?.accessToken !== current.accessToken
            ? session
            : await renew();
        if (
          !fresh ||
          fresh.user.id !== current.user.id ||
          version !== generation
        )
          throw new ApiError(401);
        const result = await call(fresh);
        if (version !== generation) throw new ApiError(401);
        return result;
      }
    },
  };
}
