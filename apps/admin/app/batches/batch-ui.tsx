'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  batchStatusLabels,
  formatNaira,
  type BatchStatus,
} from '@auction-ng/shared';
import { ApiError } from '@auction-ng/api-client/auth';
import { Button } from '@auction-ng/ui/web/button';

/** ₦4.6M from ₦100,000 up; exact below that. Negative uses a real minus. */
export function shortNaira(kobo: number, sign = false) {
  const size = Math.abs(kobo);
  const text =
    size >= 10_000_000
      ? '₦' +
        new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(
          size / 100_000_000,
        ) +
        'M'
      : // Whole naira: kobo only add noise in a summary.
        formatNaira(Math.round(size / 100) * 100);
  return (kobo < 0 ? '−' : sign && kobo > 0 ? '+' : '') + text;
}
const dayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});
const fullDay = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
export const shortDay = (day: string) =>
  dayFormat.format(new Date(day + 'T00:00:00Z'));
export const longDay = (day: string) =>
  fullDay.format(new Date(day + 'T00:00:00Z'));
export const items = (count: number) =>
  `${count.toLocaleString('en-NG')} ${count === 1 ? 'item' : 'items'}`;
export const todayWat = () =>
  new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

const tones: Record<BatchStatus, string> = {
  arriving: 'amber',
  received: 'grey',
  selling: 'indigo',
  closed: 'green',
};
export function BatchStatusPill({
  status,
  deletedAt,
}: {
  status: BatchStatus;
  deletedAt?: string | null;
}) {
  return (
    <span
      className="lv-setup-pill"
      data-tone={deletedAt ? 'red' : tones[status]}
    >
      {deletedAt ? 'Deleted' : batchStatusLabels[status]}
    </span>
  );
}

export function PercentBar({
  value,
  tone,
  label,
}: {
  value: number;
  tone: 'indigo' | 'teal';
  label: string;
}) {
  return (
    <span className="lv-batch-percent">
      <meter
        min={0}
        max={100}
        value={value}
        aria-label={label}
        className={`lv-batch-meter is-${tone}`}
      />
      {value}%
    </span>
  );
}

export function Margin({ kobo }: { kobo: number | null }) {
  return kobo === null ? (
    <>—</>
  ) : (
    <b className="lv-batch-signed" data-sign={kobo < 0 ? 'minus' : 'plus'}>
      {shortNaira(kobo, true)}
    </b>
  );
}
export function GotBack({ percent }: { percent: number | null }) {
  return percent === null ? (
    <>—</>
  ) : (
    <b
      className="lv-batch-signed"
      data-sign={percent >= 100 ? 'plus' : 'minus'}
    >
      {percent}%
    </b>
  );
}

const REFRESH = ['giddydeal:staff-refresh', 'focus', 'online'] as const;
export type Loaded<T> = {
  data?: T;
  error: string;
  loading: boolean;
  reload: () => void;
};
/** Loads, keeps the last answer while refreshing, and refreshes on focus. */
export function useBatchLoad<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
): Loaded<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    let active = true;
    let latest = 0;
    const run = () => {
      // A slow earlier answer never replaces a newer one.
      const request = ++latest;
      setLoading(true);
      loader
        .current()
        .then((value) => {
          if (!active || request !== latest) return;
          setData(value);
          setError('');
        })
        .catch((failure: unknown) => {
          reportExpiry(failure);
          if (active && request === latest)
            setError(
              failure instanceof ApiError && failure.status === 403
                ? 'Your role doesn’t include this. Ask an admin.'
                : failure instanceof ApiError && failure.status === 404
                  ? 'This doesn’t exist, or the link is wrong.'
                  : 'This couldn’t be loaded. Check your connection.',
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    const quiet = () => {
      if (!document.hidden && navigator.onLine) run();
    };
    run();
    // Live updates arrive by socket; this catches a missed one.
    const timer = setInterval(quiet, 60_000);
    for (const event of REFRESH) window.addEventListener(event, quiet);
    return () => {
      active = false;
      clearInterval(timer);
      for (const event of REFRESH) window.removeEventListener(event, quiet);
    };
  }, [...deps, version]);
  return {
    data,
    error,
    loading,
    reload: useCallback(() => setVersion((v) => v + 1), []),
  };
}

export function reportExpiry(failure: unknown) {
  if (failure instanceof ApiError && failure.status === 401)
    window.dispatchEvent(new Event('giddydeal:staff-unauthorized'));
}
/** Messages for a form: next to a field when the server named one. */
export function fieldErrors(failure: unknown): Record<string, string> {
  reportExpiry(failure);
  if (failure instanceof ApiError) {
    if (failure.code === 'FIELD_ERROR' && failure.field && failure.detail)
      return { [failure.field]: failure.detail };
    if (failure.status === 403)
      return { form: 'Your role can’t do this. Ask an admin.' };
    if (failure.status === 429)
      return { form: 'Too many changes at once. Wait a moment and try again.' };
  }
  return {
    form: 'This couldn’t be confirmed. Check your connection and try again; nothing is saved twice.',
  };
}

export function LoadState({
  error,
  onRetry,
  rows = false,
}: {
  error: string;
  onRetry: () => void;
  rows?: boolean;
}) {
  return error ? (
    <div className="lv-setup-state" role="alert">
      <p>{error}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  ) : (
    <div
      className={`lv-setup-skeleton ${rows ? 'lv-setup-skeleton--rows' : 'lv-setup-skeleton--tall'}`}
      aria-busy="true"
      aria-label="Loading"
    />
  );
}

export function Pager({
  page,
  next,
  onPrevious,
  onNext,
  label,
}: {
  page: number;
  next: boolean;
  onPrevious: () => void;
  onNext: () => void;
  label: string;
}) {
  if (page === 1 && !next) return null;
  return (
    <nav className="lv-staff-pagination" aria-label={label}>
      <Button
        variant="secondary"
        size="small"
        disabled={page === 1}
        onClick={onPrevious}
      >
        Previous
      </Button>
      <span>Page {page}</span>
      <Button
        variant="secondary"
        size="small"
        disabled={!next}
        onClick={onNext}
      >
        Next
      </Button>
    </nav>
  );
}
/** Cursor pages with a way back. */
export function useCursor() {
  const [stack, setStack] = useState<(string | undefined)[]>([undefined]);
  return {
    cursor: stack.at(-1),
    page: stack.length,
    reset: useCallback(() => setStack([undefined]), []),
    previous: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    next: (cursor: string | null | undefined) =>
      cursor && setStack((s) => [...s, cursor]),
  };
}
