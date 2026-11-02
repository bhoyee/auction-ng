'use client';
import type { CatalogueLot } from '@auction-ng/shared/catalogue-schemas';
import { ConditionBadge, Countdown, Price } from './auction';
import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { Button } from './button';
import { productImageSource } from './demo-image';
export function LaunchCountdown({
  startsAt,
  serverNow,
}: {
  startsAt: string;
  serverNow: number;
}) {
  return (
    <div className="agn-upcoming-countdown">
      <span>Goes live in</span>
      {serverNow > 0 && serverNow < Date.parse(startsAt) ? (
        <Countdown
          endsAt={Date.parse(startsAt)}
          serverNow={serverNow}
          live
          showSeconds
          segmented
        />
      ) : (
        <strong>
          {serverNow ? 'Starting soon…' : 'Checking launch time…'}
        </strong>
      )}
    </div>
  );
}
export function LaunchTime({ startsAt }: { startsAt: string }) {
  return (
    <time dateTime={startsAt}>
      {new Intl.DateTimeFormat('en-NG', {
        timeZone: 'Africa/Lagos',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(startsAt))}{' '}
      WAT
    </time>
  );
}
export function UpcomingCard({
  lot,
  serverNow,
}: {
  lot: CatalogueLot;
  serverNow: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = lot.thumbnail?.thumbnailUrl;
  return (
    <article className="agn-upcoming-card">
      <div className="agn-upcoming-card-photo">
        {src && !failed ? (
          <a href={'/lots/' + lot.id}>
            <img
              src={productImageSource(src)}
              alt={lot.title}
              width={320}
              height={320}
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
            />
          </a>
        ) : (
          <div className="agn-upcoming-photo-error">
            <ImageOff size={24} aria-hidden="true" />
            <span>Photo unavailable</span>
            {src && (
              <Button
                variant="secondary"
                size="small"
                onClick={() => setFailed(false)}
              >
                Retry photo
              </Button>
            )}
          </div>
        )}
        <span className="agn-upcoming-condition">
          <ConditionBadge condition={lot.condition} />
        </span>
      </div>
      <div className="agn-upcoming-card-content">
        <h2>
          <a href={'/lots/' + lot.id}>{lot.title}</a>
        </h2>
        <Price kobo={lot.startPriceKobo} label="Starting price" flash={false} />
        <LaunchTime startsAt={lot.startsAt} />
        <LaunchCountdown startsAt={lot.startsAt} serverNow={serverNow} />
        <a href={'/lots/' + lot.id} className="agn-button agn-button--primary">
          View and pre-bid
        </a>
      </div>
    </article>
  );
}
