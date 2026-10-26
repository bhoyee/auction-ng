'use client';
import { useEffect, useState } from 'react';
import { useBuyer } from './session';

export function usePrivateRead<T>(
  read: (credentials: { accessToken: string; deviceId: string }) => Promise<T>,
) {
  const { tokens, deviceId } = useBuyer();
  const [data, setData] = useState<T>();
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError(false);
    if (tokens)
      void read({ accessToken: tokens.accessToken, deviceId })
        .then((value) => {
          if (active) setData(value);
        })
        .catch(() => {
          if (active) setError(true);
        });
    return () => {
      active = false;
    };
  }, [tokens, deviceId, read, version]);
  return { data, error, reload: () => setVersion((value) => value + 1) };
}
