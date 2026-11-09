'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@auction-ng/api-client/auth';
import {
  createLotSetupClient,
  type LotSetupClient,
} from '@auction-ng/api-client/lot-setup';

export type SetupContext = {
  apiUrl: string;
  accessToken: string;
  deviceId: string;
  online: boolean;
  canManage: boolean;
  onUnauthorized: (token: string) => void;
  // Lets one tab refresh the tab-bar counts after a change.
  onChanged: () => void;
};

export function useSetupClient(ctx: SetupContext): LotSetupClient {
  return useMemo(
    () =>
      createLotSetupClient(ctx.apiUrl, {
        accessToken: ctx.accessToken,
        deviceId: ctx.deviceId,
      }),
    [ctx.apiUrl, ctx.accessToken, ctx.deviceId],
  );
}

export type Loaded<T> = {
  data?: T;
  error: string;
  loading: boolean;
  forbidden: boolean;
  refresh: () => void;
};

// Loads one resource; keeps the last good data while refreshing so the
// screen never flashes empty, and reports sign-in expiry to the shell.
export function useLoad<T>(
  ctx: SetupContext,
  load: () => Promise<T>,
  deps: readonly unknown[],
): Loaded<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [version, setVersion] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    let active = true;
    setLoading(true);
    loader
      .current()
      .then((value) => {
        if (!active) return;
        setData(value);
        setError('');
        setForbidden(false);
      })
      .catch((failure: unknown) => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401)
          ctx.onUnauthorized(ctx.accessToken);
        else if (failure instanceof ApiError && failure.status === 403)
          setForbidden(true);
        else if (failure instanceof ApiError && failure.status === 404)
          setError('This record no longer exists. Pick another one.');
        else
          setError(
            ctx.online
              ? 'This could not be loaded. Check your connection and retry.'
              : 'You are offline. Reconnect to load Lot setup.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [...deps, version, ctx.accessToken]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, forbidden, refresh };
}

export type FieldErrors = Record<string, string>;

// Turns a failed change into messages for the form: a field message when the
// server named one, otherwise a message for the whole form.
export function describeFailure(
  failure: unknown,
  ctx: SetupContext,
): FieldErrors {
  if (failure instanceof ApiError) {
    if (failure.status === 401) {
      ctx.onUnauthorized(ctx.accessToken);
      return { form: 'Your session expired. Sign in again to save.' };
    }
    if (failure.code === 'FIELD_ERROR' && failure.field && failure.detail)
      return { [failure.field]: failure.detail };
    if (failure.status === 403)
      return {
        form: 'Your role can view Lot setup but not change it. Ask an admin or ops manager.',
      };
    if (failure.status === 429)
      return { form: 'Too many changes at once. Wait a moment, then retry.' };
  }
  return {
    form: ctx.online
      ? 'This change could not be saved. Check your connection and retry.'
      : 'You are offline. Reconnect, then save again.',
  };
}

// Field names coming back from the server use dotted paths (fields.0.name).
export const errorFor = (errors: FieldErrors, field: string) =>
  errors[field] ??
  Object.entries(errors).find(([key]) => key.startsWith(field + '.'))?.[1];

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const text = String(value);
    // Neutralise spreadsheet formulas in exported text.
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const blob = new Blob([rows.map((r) => r.map(escape).join(',')).join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
