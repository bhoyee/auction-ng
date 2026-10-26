'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart, Check, ImageOff, Clock3, MapPin } from 'lucide-react';
import { formatNaira } from '@auction-ng/shared/money';
import type { databaseValues } from '@auction-ng/shared';
import { countdown } from '../presentation';
import { tokens } from '../tokens';
import { Button } from './button';
import { productImageSource } from './demo-image';

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
      <NairaText value={formatNaira(kobo)} />
    </span>
  );
}

export function NairaText({ value }: { value: string }) {
  return (
    <span>
      {value.split(/(\d+)/).map((part, index) =>
        /^\d+$/.test(part) ? (
          <span className="agn-numeric-digits" key={index}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
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
      className={`agn-countdown${state.urgent ? ' agn-countdown--urgent' : ''}${endsAt - serverNow > 0 && endsAt - serverNow < 60000 ? ' agn-countdown--final' : ''}`}
      aria-label={state.label}
    >
      <Clock3 size={14} aria-hidden="true" />
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
  startingPrice?: boolean;
  priceNotice?: string;
  allowOpenWhileStale?: boolean;
  image?: { src: string; alt: string };
  status?: 'Winning' | 'Outbid' | 'Won';
  watched: boolean;
  onWatch: () => void;
  onOpen: () => void;
  onBid?: () => void;
  bidCount?: number;
  location?: string;
  secondImage?: string;
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
  startingPrice = false,
  priceNotice = 'Sign in for live prices',
  allowOpenWhileStale = false,
  image,
  status,
  watched,
  onWatch,
  onOpen,
  onBid,
  bidCount,
  location,
  secondImage,
}: LotCardProps) {
  const [failedImage, setFailedImage] = useState<string>();
  const [failedSecondary, setFailedSecondary] = useState<string>();
  const conditionLabel = condition.replaceAll('_', ' ');
  return (
    <article className="agn-lot">
      <div className="agn-lot-photo">
        {image && failedImage !== image.src ? (
          <img
            src={productImageSource(image.src)}
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
        {secondImage && failedSecondary !== secondImage && (
          <img
            className="agn-lot-secondary-photo"
            src={productImageSource(secondImage)}
            onError={() => setFailedSecondary(secondImage)}
            alt={`${title}, another view`}
            width={320}
            height={240}
            loading="lazy"
          />
        )}
        {retailKobo !== undefined &&
          retailKobo > priceKobo &&
          (live || startingPrice) && (
            <span className="agn-discount" aria-label="Below retail estimate">
              −
              {Number(
                ((BigInt(retailKobo) - BigInt(priceKobo)) * 100n) /
                  BigInt(retailKobo),
              )}
              %
            </span>
          )}
        <Badge>
          {conditionLabel.charAt(0).toUpperCase() + conditionLabel.slice(1)}
        </Badge>
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
          <Heart
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
        <div className="agn-lot-pricing">
          {startingPrice && <span className="agn-hint">Starting bid</span>}
          {live || startingPrice ? (
            <Price
              kobo={priceKobo}
              label={startingPrice ? 'Starting bid' : undefined}
            />
          ) : (
            <span className="agn-hint">Updating price…</span>
          )}
          {retailKobo !== undefined && (
            <span className="agn-retail">
              Retail estimate{' '}
              <s>
                <NairaText value={formatNaira(retailKobo)} />
              </s>
            </span>
          )}
        </div>
        <div className="agn-lot-meta">
          {bidCount !== undefined && (
            <span>
              {bidCount} {bidCount === 1 ? 'bid' : 'bids'}
            </span>
          )}
          <Countdown
            endsAt={endsAt}
            serverNow={serverNow}
            live={startingPrice ? serverNow > 0 : live}
          />
        </div>
        {startingPrice && priceNotice && <p className="agn-hint">{priceNotice}</p>}
        {location && (
          <span className="agn-lot-location">
            <MapPin size={14} aria-hidden="true" />
            {location}
          </span>
        )}
        <Button
          variant="primary"
          onClick={onBid ?? onOpen}
          disabled={!live && !startingPrice && !allowOpenWhileStale}
        >
          {live || startingPrice || allowOpenWhileStale
            ? 'Bid now'
            : 'Reconnecting…'}
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
