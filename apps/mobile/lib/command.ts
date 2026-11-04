import { useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
type Schema<T> = {
  parse: (input: unknown) => T;
  safeParse: (
    input: unknown,
  ) => { success: true; data: T } | { success: false };
};
import { useSession } from './session';
// Only reviewed money inputs go here. Never store passwords, OTPs or bank identity data.
export function useCommand<T extends { idempotencyKey: string }>(
  scope: string,
  schema: Schema<T>,
) {
  const { session } = useSession();
  const owner = session?.user.id;
  const key = 'auction-ng.command.' + (owner ?? 'public') + '.' + scope;
  const [pending, setPending] = useState<T>(),
    [ready, setReady] = useState(false);
  const current = useRef<T | undefined>(undefined);
  const activeKey = useRef(key);
  activeKey.current = key;
  const writing = useRef<Promise<T> | undefined>(undefined);
  useEffect(() => {
    let active = true;
    current.current = undefined;
    writing.current = undefined;
    setPending(undefined);
    setReady(false);
    if (!owner) return;
    void SecureStore.getItemAsync(key)
      .then((raw) => {
        if (!active) return;
        if (raw) {
          const parsed = schema.safeParse(JSON.parse(raw));
          if (!parsed.success) throw Error('Saved request could not be read.');
          current.current = parsed.data;
          setPending(parsed.data);
        }
        setReady(true);
      })
      .catch(() => {
        if (active) setReady(false);
      });
    return () => {
      active = false;
    };
  }, [key, owner, schema]);
  return {
    pending,
    ready,
    async begin(input: T) {
      if (!ready || !owner)
        throw Error('Secure request storage is not ready. Retry.');
      if (current.current) return current.current;
      if (writing.current) return writing.current;
      const value = schema.parse(input);
      const operation = (async () => {
        await SecureStore.setItemAsync(key, JSON.stringify(value), {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        if (activeKey.current !== key)
          throw Error(
            'Account changed. Return to your account before retrying.',
          );
        current.current = value;
        setPending(value);
        return value;
      })();
      writing.current = operation;
      try {
        return await operation;
      } finally {
        if (writing.current === operation) writing.current = undefined;
      }
    },
    async complete() {
      await SecureStore.deleteItemAsync(key);
      if (activeKey.current !== key) return;
      current.current = undefined;
      setPending(undefined);
    },
  };
}
