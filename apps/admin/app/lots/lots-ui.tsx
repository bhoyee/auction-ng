'use client';
import { useEffect, useState } from 'react';
import {
  conditionDefaults,
  formatNaira,
  type LotListRow,
  type LotStage,
} from '@auction-ng/shared';
import { productImageSource } from '@auction-ng/ui/web/demo-image';
import { categoryIconOf } from '../lot-setup/category-icon';

export const stageLabel: Record<LotStage | 'archived' | 'deleted', string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  live: 'Live',
  sold: 'Sold',
  unsold: 'Unsold',
  cancelled: 'Cancelled',
  archived: 'Archived',
  deleted: 'Deleted',
};

export const conditionLabel = (key: string) =>
  conditionDefaults[key as keyof typeof conditionDefaults]?.label ?? key;

const watFormat = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour12: true,
    ...options,
  });
const dayTime = watFormat({
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const shortDate = watFormat({ day: 'numeric', month: 'short' });
const dateTime = watFormat({
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
export const wat = {
  dayTime: (iso: string) =>
    dayTime
      .format(new Date(iso))
      .replace(/ ?([ap]m)$/i, (m) => m.trim().toLowerCase()),
  date: (iso: string) => shortDate.format(new Date(iso)),
  dateTime: (iso: string) => dateTime.format(new Date(iso)),
};

/** Server-aligned clock: one tick a second for live countdowns. */
export function useServerNow(serverTime: string | undefined) {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (serverTime) setOffset(Date.parse(serverTime) - Date.now());
  }, [serverTime]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now + offset;
}

export function hoursLabel(minutes: number) {
  return minutes % 60 === 0
    ? `${minutes / 60} h`
    : `${Math.round(minutes / 6) / 10} h`;
}

export function countdown(ms: number) {
  if (ms <= 0) return 'Ending';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

export function StatusBadge({
  row,
}: {
  row: Pick<LotListRow, 'stage' | 'archived' | 'deleted'> & {
    comingSoon?: boolean;
  };
}) {
  const key = row.deleted ? 'deleted' : row.archived ? 'archived' : row.stage;
  return (
    <>
      <span className="lv-lots-badge" data-stage={key}>
        {stageLabel[key]}
      </span>
      {row.comingSoon && key === 'draft' && (
        <span
          className="lv-lots-badge"
          data-stage="coming-soon"
          title="In Upcoming without a date: buyers can watch it, no pre-bids"
        >
          Coming soon
        </span>
      )}
    </>
  );
}

export function LotThumb({
  url,
  icon,
  large = false,
}: {
  url: string | null;
  icon: string;
  large?: boolean;
}) {
  const Icon = categoryIconOf(icon);
  return (
    <span className="lv-lots-thumb">
      {url ? (
        // Lot photos come from our own image store (thumbnails ≤ 30 KB).
        <img
          src={productImageSource(url)}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Icon size={large ? 40 : 20} aria-hidden="true" />
      )}
    </span>
  );
}

/** Live: countdown + run-time bar (yellow under 1 h); others: plain words. */
export function TimeCell({ row, now }: { row: LotListRow; now: number }) {
  const end = Date.parse(row.endsAt);
  const start = Date.parse(row.startsAt);
  if (row.deleted)
    return (
      <div className="lv-lots-time">
        <strong>Deleted {row.deletedAt ? wat.date(row.deletedAt) : ''}</strong>
        <small>{row.deleteReason}</small>
      </div>
    );
  if (row.stage === 'live') {
    const left = end - now;
    const share = Math.min(
      100,
      Math.max(0, ((now - start) / Math.max(1, end - start)) * 100),
    );
    return (
      <div className="lv-lots-time">
        <div
          className="lv-lots-countdown"
          data-urgent={left < 3_600_000 || undefined}
        >
          <strong>{countdown(left)}</strong>
          <small>{hoursLabel(row.runTimeMinutes)}</small>
        </div>
        <div className="lv-lots-progress" aria-hidden="true">
          <span style={{ width: `${share}%` }} />
        </div>
        <small>ends {wat.dayTime(row.endsAt)}</small>
      </div>
    );
  }
  if (row.stage === 'scheduled')
    return (
      <div className="lv-lots-time">
        <strong className="lv-lots-scheduled">
          Starts {wat.dayTime(row.startsAt)}
        </strong>
        <small>
          {hoursLabel(row.runTimeMinutes)} · ends {wat.dayTime(row.endsAt)}
        </small>
      </div>
    );
  if (row.stage === 'sold' || row.stage === 'unsold')
    return (
      <div className="lv-lots-time">
        <strong>Ended {wat.dayTime(row.endsAt)}</strong>
        <small>
          {hoursLabel(row.runTimeMinutes)} ·{' '}
          {row.stage === 'sold'
            ? row.winnerName
              ? `won by ${row.winnerName}`
              : 'sold'
            : 'no bids · relist?'}
        </small>
      </div>
    );
  return (
    <div className="lv-lots-time">
      <strong>Not started</strong>
      <small>
        {hoursLabel(row.runTimeMinutes)}
        {row.stage === 'draft' && row.photosNeeded > 0
          ? ` · needs ${row.photosNeeded} more ${row.photosNeeded === 1 ? 'photo' : 'photos'}`
          : row.stage === 'cancelled'
            ? ' · cancelled'
            : ''}
      </small>
    </div>
  );
}

export function PriceCell({ row }: { row: LotListRow }) {
  const sold = row.stage === 'sold';
  const bidding = row.currentPriceKobo !== null && row.stage !== 'unsold';
  return (
    <div className="lv-lots-price">
      <b>
        {formatNaira(
          bidding ? (row.currentPriceKobo ?? 0) : row.startPriceKobo,
        )}
      </b>
      <small>
        {sold
          ? 'winning bid'
          : bidding
            ? `start ${formatNaira(row.startPriceKobo)}`
            : 'start price'}
      </small>
      <small>retail {formatNaira(row.retailPriceKobo)}</small>
    </div>
  );
}

const avatarTones = [
  'var(--color-win-600)',
  'var(--color-chart-amber)',
  'var(--color-indigo-700)',
  'var(--color-chart-teal)',
  'var(--color-outbid-600)',
];
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
export function Avatar({ id, name }: { id: string; name: string }) {
  const tone =
    avatarTones[
      [...id].reduce((n, c) => n + c.charCodeAt(0), 0) % avatarTones.length
    ];
  return (
    <span
      className="lv-lots-avatar"
      style={{ '--avatar': tone } as React.CSSProperties}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
