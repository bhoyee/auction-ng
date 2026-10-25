'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, ImageOff } from 'lucide-react';
import { formatNaira, type databaseValues } from '@auction-ng/shared';
import { countdown } from '../presentation';
import { tokens } from '../tokens';
import { Button } from './controls';

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'brand' | 'win' | 'outbid';
}) {
  return <span className={`agn-badge agn-badge--${tone}`}>{children}</span>;
}
export function LivePill() {
  return (
    <span className="agn-live">
      <span aria-hidden="true" />
      Live
    </span>
  );
}

export function Price({
  kobo,
  label,
  flash = true,
}: {
  kobo: number;
  label?: string;
  flash?: boolean;
}) {
  const previous = useRef(kobo);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (previous.current === kobo) return;
    previous.current = kobo;
    if (!flash) return;
    setChanged(true);
    const timer = setTimeout(() => setChanged(false), tokens.motion.flash);
    return () => clearTimeout(timer);
  }, [kobo, flash]);
  return (
    <span
      className={`agn-price${changed ? ' agn-price--changed' : ''}`}
      aria-label={label ? `${label} ${formatNaira(kobo)}` : undefined}
    >
      {formatNaira(kobo)}
    </span>
  );
}

/** Pass a server-offset clock; the component never guesses network freshness. */
export function Countdown({
  endsAt,
  serverNow,
  live = true,
}: {
  endsAt: number;
  serverNow: number;
  live?: boolean;
}) {
  if (!live)
    return (
      <span className="agn-countdown" role="status">
        Reconnecting…
      </span>
    );
  const state = countdown(endsAt, serverNow);
  return (
    <span
      className={`agn-countdown${state.urgent ? ' agn-countdown--urgent' : ''}`}
      aria-label={state.label}
    >
      {state.text}
    </span>
  );
}

export type LotCardProps = {
  title: string;
  reference: string;
  condition: (typeof databaseValues.lotConditions)[number];
  priceKobo: number;
  retailKobo?: number;
  endsAt: number;
  serverNow: number;
  live: boolean;
  image?: { src: string; alt: string };
  status?: 'Winning' | 'Outbid' | 'Won';
  watched: boolean;
  onWatch: () => void;
  onOpen: () => void;
};

export function LotCard({
  title,
  reference,
  condition,
  priceKobo,
  retailKobo,
  endsAt,
  serverNow,
  live,
  image,
  status,
  watched,
  onWatch,
  onOpen,
}: LotCardProps) {
  const [failedImage, setFailedImage] = useState<string>();
  const conditionLabel = condition.replaceAll('_', ' ');
  return (
    <article className="agn-lot">
      <div className="agn-lot-photo">
        {image && failedImage !== image.src ? (
          <img
            src={image.src}
            alt={image.alt}
            width={320}
            height={320}
            loading="lazy"
            decoding="async"
            onError={() => setFailedImage(image.src)}
          />
        ) : (
          <div className="agn-photo-pending">
            <ImageOff size={24} strokeWidth={1.75} aria-hidden="true" />
            <span>Photo pending</span>
          </div>
        )}
        {status && (
          <div className="agn-lot-status">
            <Badge tone={status === 'Outbid' ? 'outbid' : 'win'}>
              {status === 'Won' && <Check size={16} aria-hidden="true" />}
              {status}
            </Badge>
          </div>
        )}
        <Button
          variant="secondary"
          className="agn-watch"
          aria-label={`${watched ? 'Unwatch' : 'Watch'} ${title}`}
          aria-pressed={watched}
          onClick={onWatch}
        >
          <Bookmark
            size={20}
            strokeWidth={1.75}
            fill={watched ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
        </Button>
      </div>
      <div className="agn-lot-body">
        <p className="agn-reference">{reference}</p>
        <button type="button" className="agn-lot-title" onClick={onOpen}>
          {title}
        </button>
        <Badge>
          {conditionLabel.charAt(0).toUpperCase() + conditionLabel.slice(1)}
        </Badge>
        <div className="agn-lot-pricing">
          {live ? (
            <Price kobo={priceKobo} />
          ) : (
            <span className="agn-hint">Updating price…</span>
          )}
          {retailKobo !== undefined && (
            <span className="agn-retail">
              Retail <s>{formatNaira(retailKobo)}</s>
            </span>
          )}
        </div>
        <Countdown endsAt={endsAt} serverNow={serverNow} live={live} />
        <Button variant="secondary" onClick={onOpen} disabled={!live}>
          {live ? 'View lot' : 'Reconnecting…'}
        </Button>
      </div>
    </article>
  );
}

export function LotCardSkeleton() {
  return (
    <div
      className="agn-lot agn-lot-skeleton"
      role="status"
      aria-label="Loading lot"
    >
      <div className="agn-skeleton-photo" />
      <div className="agn-lot-body">
        <span className="agn-skeleton-line" />
        <span className="agn-skeleton-line" />
        <span className="agn-skeleton-price" />
      </div>
    </div>
  );
}
