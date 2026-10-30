'use client';
import { useEffect, useState } from 'react';
import { createPaymentClient } from '@auction-ng/api-client/payments';
import { ApiError } from '@auction-ng/api-client/auth';
import { SearchSelect } from '@auction-ng/ui/web/search-select';
import { Toast } from '@auction-ng/ui/web/toast';
import { Button } from '@auction-ng/ui/web/button';
import { apiUrl, useBuyer } from '../lib/session';

export function WithdrawalBankPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const { tokens, deviceId, renewSession } = useBuyer();
  const [options, setOptions] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!tokens) return;
    let active = true,
      running = false;
    async function refresh() {
      if (!active || running || document.hidden) return;
      running = true;
      setLoading(true);
      try {
        if (!navigator.onLine) throw Error('Offline');
        let accessToken = tokens?.accessToken ?? '';
        const collected = new Map<string, string>();
        const cursors = new Set<string>();
        let cursor: string | undefined;
        do {
          const read = () =>
            createPaymentClient(apiUrl, { accessToken, deviceId }).getBanks({
              limit: 50,
              cursor,
            });
          const page = await read().catch(async (cause: unknown) => {
            if (!(cause instanceof ApiError) || cause.status !== 401)
              throw cause;
            const renewed = await renewSession(accessToken);
            if (!renewed || renewed.user.id !== tokens?.user.id) throw cause;
            accessToken = renewed.accessToken;
            return read();
          });
          if (!active) return;
          for (const bank of page.items) collected.set(bank.code, bank.name);
          cursor = page.nextCursor ?? undefined;
          if (cursor && cursors.has(cursor)) throw Error('Repeated bank page');
          if (cursor) cursors.add(cursor);
        } while (cursor);
        if (active) {
          setOptions(
            Array.from(collected, ([value, label]) => ({ value, label })).sort(
              (a, b) => a.label.localeCompare(b.label),
            ),
          );
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        running = false;
        if (active) setLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    const resume = () => void refresh();
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [tokens, deviceId, renewSession, version]);
  useEffect(() => {
    if (
      !loading &&
      !error &&
      value &&
      !options.some((bank) => bank.value === value)
    )
      onChange('');
  }, [options, loading, error, value, onChange]);
  return (
    <>
      {error && (
        <Toast tone="error" emphasis onClose={() => setError(false)}>
          Banks could not be refreshed. Check your connection and retry.{' '}
          <Button
            variant="ghost"
            onClick={() => setVersion((current) => current + 1)}
          >
            Retry
          </Button>
        </Toast>
      )}
      <SearchSelect
        label="Bank"
        options={options}
        value={value}
        onChange={onChange}
        loading={loading}
        disabled={disabled}
      />
    </>
  );
}
