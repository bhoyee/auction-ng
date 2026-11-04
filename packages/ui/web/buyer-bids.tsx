import type { ReactNode } from 'react';
import { ArrowUpRight, Check, Trophy } from 'lucide-react';
import type {
  BuyerBidPage,
  BuyerPreBidPage,
} from '@auction-ng/shared/buyer-schemas';
import { formatNaira } from '@auction-ng/shared/money';
import { ProductPhoto } from './product-photo';
import { LaunchCountdown, LaunchTime } from './upcoming';

export function IncomingBidItem({
  entry,
  serverNow,
  cancelled = false,
}: {
  entry: BuyerPreBidPage['items'][number];
  serverNow: number;
  cancelled?: boolean;
}) {
  const href = `/lots/${entry.lotId}`;
  return (
    <article className="agn-buyer-bid-item">
      <a
        className="agn-buyer-bid-photo"
        href={href}
        aria-label={`View ${entry.lot.title}`}
      >
        <ProductPhoto
          src={entry.lot.thumbnailUrl ?? undefined}
          alt={entry.lot.title}
        />
      </a>
      <div className="agn-buyer-bid-detail">
        <a href={href}>{entry.lot.title}</a>
        <span>Item {entry.lot.lotNumber}</span>
        <LaunchTime startsAt={entry.startsAt} />
      </div>
      <div className="agn-buyer-bid-amount">
        <span>Your private limit</span>
        <strong>{formatNaira(entry.maxKobo)}</strong>
        <span>Reserved: {formatNaira(entry.reservedKobo)}</span>
      </div>
      <div className="agn-buyer-bid-status-group">
        <span
          className={`agn-buyer-bid-status${cancelled ? ' agn-buyer-bid-status--danger' : ''}`}
        >
          {cancelled ? 'Cancelled' : 'Incoming'}
        </span>
      </div>
      <a className="agn-buyer-bid-action" href={href}>
        {cancelled ? 'View item' : 'Manage pre-bid'}
        <ArrowUpRight size={16} aria-hidden="true" />
      </a>
      {!cancelled && (
        <div className="agn-buyer-bid-note">
          <LaunchCountdown startsAt={entry.startsAt} serverNow={serverNow} />
          <p>
            Change your limit or cancel free on the item page before launch.
          </p>
        </div>
      )}
    </article>
  );
}

export function LiveBidTabLabel({ label }: { label: string }) {
  return (
    <span className="agn-buyer-bid-tab-label">
      {label}
      <span
        className="agn-buyer-bid-live"
        aria-hidden="true"
        title="Auctions still running"
      >
        <i />
        Live
      </span>
    </span>
  );
}

export function BuyerBidsLayout({ children }: { children: ReactNode }) {
  return (
    <section className="agn-buyer-bids" aria-label="Your bid history">
      {children}
    </section>
  );
}
export function BuyerBidsList({ children }: { children: ReactNode }) {
  return (
    <div className="agn-buyer-bids-list">
      {children}
      <p className="agn-buyer-bids-empty" role="status">
        No matching bids on this page. Choose another tab or use the page
        controls below.
      </p>
    </div>
  );
}
export function BuyerBidItem({
  entry,
  position,
  isLive = false,
  reviewAction,
}: {
  entry: BuyerBidPage['items'][number];
  position: string;
  isLive?: boolean;
  reviewAction?: ReactNode;
}) {
  const tone =
    position === 'Won' || position === 'Winning'
      ? 'win'
      : position === 'Outbid' || position === 'Lost' || position === 'Cancelled'
        ? 'danger'
        : 'neutral';
  return (
    <article className="agn-buyer-bid-item">
      <a
        className="agn-buyer-bid-photo"
        href={`/lots/${entry.lot.id}`}
        aria-label={`View ${entry.lot.title}`}
      >
        <ProductPhoto
          src={entry.lot.thumbnailUrl ?? undefined}
          alt={entry.lot.title}
        />
      </a>
      <div className="agn-buyer-bid-detail">
        <a href={`/lots/${entry.lot.id}`}>{entry.lot.title}</a>
        <span>Item {entry.lot.lotNumber}</span>
        <time dateTime={entry.createdAt}>
          {new Date(entry.createdAt).toLocaleString('en-NG', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Africa/Lagos',
          })}{' '}
          WAT
        </time>
      </div>
      <div className="agn-buyer-bid-amount">
        <span>
          {entry.automatic ? 'Your private limit' : 'Your direct bid'}
        </span>
        <strong>{formatNaira(entry.amountKobo)}</strong>
      </div>
      <div className="agn-buyer-bid-status-group">
        <span className={`agn-buyer-bid-status agn-buyer-bid-status--${tone}`}>
          {position === 'Won' ? (
            <Trophy size={14} aria-hidden="true" />
          ) : position === 'Winning' ? (
            <Check size={14} aria-hidden="true" />
          ) : null}
          {position}
        </span>
        {isLive && (
          <span className="agn-buyer-bid-live" aria-label="Auction is live">
            <i aria-hidden="true" />
            Live
          </span>
        )}
      </div>
      <a className="agn-buyer-bid-action" href={`/lots/${entry.lot.id}`}>
        View item
        <ArrowUpRight size={16} aria-hidden="true" />
      </a>
      {entry.outcome === 'cancelled' && (
        <p className="agn-buyer-bid-note">
          {entry.cancellationReason === 'staff_cancelled'
            ? 'Staff cancelled your bid. Open your support request for the fee and release details.'
            : entry.cancellationReason === 'reopened'
              ? 'The auction reopened. This bid is history; place a fresh bid to participate again.'
              : 'Purchased at a fixed price. Bid holds are released automatically.'}
        </p>
      )}
      {reviewAction && <div className="agn-buyer-bid-note">{reviewAction}</div>}
    </article>
  );
}
