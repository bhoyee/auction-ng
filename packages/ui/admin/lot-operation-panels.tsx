'use client';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Gavel,
  History,
  ImageOff,
  MapPin,
  MousePointer2,
  Package,
  RefreshCw,
  UserRound,
  ZoomIn,
  Zap,
} from 'lucide-react';
import {
  databaseValues,
  formatNaira,
  type MonitorHistory,
  type MonitorLot,
  type MonitorLotDetail,
} from '@auction-ng/shared';
import { ConditionBadge } from '../web/auction';
import { Button } from '../web/button';
import { Dialog } from '../web/dialog';
import { productImageSource } from '../web/demo-image';

const date = (at: string) =>
  new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(at));
const time = (at: string) =>
  new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(at));
const photo = (url: string, buyerUrl: string) =>
  new URL(productImageSource(url), buyerUrl).href;
export function LotPanelPagination({
  page,
  count,
  previous,
  next,
  busy,
  onPrevious,
  onNext,
}: {
  page: number;
  count: number;
  previous: boolean;
  next: boolean;
  busy?: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <footer className="lv-lot-pagination">
      <span>
        Page <strong>{page}</strong>
        <i aria-hidden="true">·</i>
        {count} {count === 1 ? 'entry' : 'entries'}
      </span>
      <div>
        <Button
          variant="secondary"
          disabled={!previous || busy}
          onClick={onPrevious}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Previous
        </Button>
        <Button variant="secondary" disabled={!next || busy} onClick={onNext}>
          Next
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </footer>
  );
}
export function MonitorHistoryPanel({
  row,
  history,
  buyerUrl,
  page,
  busy,
  previous,
  onPrevious,
  onNext,
}: {
  row: MonitorLot;
  history: MonitorHistory;
  buyerUrl: string;
  page: number;
  busy: boolean;
  previous: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <section className="lv-lot-history" aria-label="Lot bid history">
      <div className="lv-lot-history-item">
        <div className="lv-lot-history-photo">
          {row.thumbnail ? (
            <img
              src={photo(row.thumbnail, buyerUrl)}
              alt=""
              width={72}
              height={72}
            />
          ) : (
            <Package size={28} aria-hidden="true" />
          )}
        </div>
        <div>
          <span className="lv-lot-reference">{history.reference}</span>
          <h3>{history.title}</h3>
          <p>
            {row.category}
            <span aria-hidden="true"> · </span>
            {row.location}
          </p>
        </div>
      </div>
      <div className="lv-lot-history-toolbar">
        <h3>
          <History size={18} aria-hidden="true" />
          Bids
        </h3>
        <span>
          <RefreshCw size={13} aria-hidden="true" />
          Updated {time(history.serverTime)}
        </span>
      </div>
      <div className="lv-lot-history-scroll">
        <table className="lv-lot-history-table">
          <caption className="sr-only">
            Accepted bid history for {history.reference}
          </caption>
          <thead>
            <tr>
              <th>Bidder</th>
              <th>Bid type</th>
              <th className="is-amount">Amount</th>
              <th className="is-time">Time (WAT)</th>
            </tr>
          </thead>
          <tbody>
            {history.items.map((bid, index) => {
              const Icon =
                bid.kind === 'manual'
                  ? MousePointer2
                  : bid.kind === 'counterbid'
                    ? RefreshCw
                    : Zap;
              return (
                <tr
                  key={bid.id}
                  className={page === 1 && index === 0 ? 'is-latest' : ''}
                >
                  <td>
                    <div className="lv-lot-bidder">
                      <span className="lv-lot-bidder-icon">
                        <UserRound size={16} aria-hidden="true" />
                      </span>
                      <div>
                        <strong>{bid.bidder}</strong>
                        <small className="lv-lot-mobile-time">
                          {date(bid.at)} · {time(bid.at)}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={'lv-lot-method is-' + bid.kind}>
                      <Icon size={13} aria-hidden="true" />
                      {bid.kind === 'manual'
                        ? 'Manual bid'
                        : bid.kind === 'counterbid'
                          ? 'System counterbid'
                          : 'Automatic limit'}
                    </span>
                  </td>
                  <td className="is-amount">
                    {bid.amountKobo === null ? (
                      <span className="lv-lot-private">Private limit</span>
                    ) : (
                      <strong>{formatNaira(bid.amountKobo)}</strong>
                    )}
                  </td>
                  <td className="is-time">
                    <strong>{time(bid.at)}</strong>
                    <small>{date(bid.at)}</small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!history.items.length && (
          <div className="lv-lot-empty">
            <History size={28} aria-hidden="true" />
            <h3>No bids yet</h3>
            <p>Accepted bids will appear here.</p>
          </div>
        )}
      </div>
      <LotPanelPagination
        page={page}
        count={history.items.length}
        previous={previous}
        next={!!history.nextCursor}
        busy={busy}
        onPrevious={onPrevious}
        onNext={onNext}
      />
    </section>
  );
}
const statusLabel = (value: string) =>
  ({
    open: 'Live auction',
    closing: 'Closing',
    scheduled: 'Upcoming',
    closed: 'Closed',
    cancelled: 'Cancelled',
    draft: 'Draft',
  })[value] ?? value;
const actionLabel = (value: string) =>
  ({
    'lot.extend': 'Auction time extended',
    'lot.pause': 'Auction paused',
    'lot.resume': 'Auction resumed',
    'lot.resume_clock_restored': 'Countdown restored',
    'lot.cancel': 'Auction cancelled',
    'lots.image_added': 'Photo added',
    'lots.created': 'Item created',
    'lots.updated': 'Item details updated',
    'lots.published': 'Auction published',
  })[value] ??
  value
    .replace(/^(staff\.|lots?\.)/, '')
    .replaceAll('_', ' ')
    .replaceAll('.', ' ');
export function LotWorkspaceView({
  data,
  buyerUrl,
  page,
  previous,
  onPrevious,
  onNext,
  onBack,
}: {
  data: MonitorLotDetail;
  buyerUrl: string;
  page: number;
  previous: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string>(),
    [zoom, setZoom] = useState(false);
  const current = data.images.find((i) => i.id === selected) ?? data.images[0],
    index = data.images.findIndex((i) => i.id === current?.id);
  const condition = databaseValues.lotConditions.find(
    (value) => value === data.condition,
  );
  return (
    <section className="lv-lot-workspace" aria-label="Staff lot workspace">
      <div className="lv-lot-workspace-top">
        <button type="button" className="lv-lot-back" onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          Back to Live monitor
        </button>
        <a
          href={new URL('/lots/' + data.id, buyerUrl).href}
          target="_blank"
          rel="noreferrer"
        >
          View buyer page
          <ExternalLink size={15} aria-hidden="true" />
        </a>
      </div>
      <header className="lv-lot-workspace-heading">
        <div>
          <span className="lv-lot-reference">{data.reference}</span>
          <h1>{data.title}</h1>
        </div>
        <span className="lv-lot-status" data-state={data.status}>
          <i aria-hidden="true" />
          {statusLabel(data.status)}
        </span>
      </header>
      <div className="lv-lot-workspace-grid">
        <section className="lv-lot-gallery" aria-label="Item photos">
          <div className="lv-lot-main-photo">
            {current ? (
              <button
                type="button"
                onClick={() => setZoom(true)}
                aria-label="Enlarge item photo"
              >
                <img
                  src={photo(current.url, buyerUrl)}
                  alt={data.title}
                  width={640}
                  height={480}
                />
                <span className="lv-lot-zoom">
                  <ZoomIn size={16} aria-hidden="true" />
                  View photo
                </span>
              </button>
            ) : (
              <div className="lv-lot-empty">
                <ImageOff size={32} aria-hidden="true" />
                <p>No photos added</p>
              </div>
            )}
            {current && (
              <span className="lv-lot-photo-count">
                {index + 1} / {data.images.length}
              </span>
            )}
          </div>
          {data.images.length > 1 && (
            <div
              className="lv-lot-thumbnails"
              aria-label="Choose an item photo"
            >
              {data.images.map((image, i) => (
                <button
                  type="button"
                  key={image.id}
                  aria-label={'View photo ' + (i + 1)}
                  aria-pressed={image.id === current?.id}
                  onClick={() => setSelected(image.id)}
                >
                  <img
                    src={photo(image.thumbnailUrl ?? image.url, buyerUrl)}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="lv-lot-overview lv-lot-surface">
          <header>
            <Gavel size={20} aria-hidden="true" />
            <h2>Auction overview</h2>
            {condition && <ConditionBadge condition={condition} />}
          </header>
          <div className="lv-lot-schedule">
            <div>
              <span>Starts</span>
              <strong>{date(data.startAt)}</strong>
              <small>{time(data.startAt)} WAT</small>
            </div>
            <ArrowRight size={18} aria-hidden="true" />
            <div>
              <span>Current deadline</span>
              <strong>{date(data.endAt)}</strong>
              <small>{time(data.endAt)} WAT</small>
            </div>
          </div>
          <dl className="lv-lot-overview-facts">
            <div>
              <dt>
                <Clock3 size={16} aria-hidden="true" />
                Original run time
              </dt>
              <dd>
                {data.runTimeMs === null
                  ? 'Not recorded'
                  : new Intl.NumberFormat('en-NG').format(
                      data.runTimeMs / 3600000,
                    ) + ' hours'}
              </dd>
            </div>
            <div>
              <dt>
                <Package size={16} aria-hidden="true" />
                Category
              </dt>
              <dd>{data.category}</dd>
            </div>
            <div>
              <dt>
                <MapPin size={16} aria-hidden="true" />
                Pickup centre
              </dt>
              <dd>{data.location}</dd>
            </div>
          </dl>
          <div className="lv-lot-stock-facts">
            <div>
              <span>Batch</span>
              <strong>Not recorded</strong>
            </div>
            <div>
              <span>Stock cost</span>
              <strong>Not recorded</strong>
            </div>
          </div>
        </section>
        <section className="lv-lot-description lv-lot-surface">
          <header>
            <Package size={19} aria-hidden="true" />
            <h2>Item details</h2>
          </header>
          <p>{data.description || 'No description recorded.'}</p>
        </section>
        <section className="lv-lot-activity lv-lot-surface">
          <header>
            <History size={19} aria-hidden="true" />
            <h2>Change history</h2>
            <span className="lv-lot-entries">
              {data.changes.length}{' '}
              {data.changes.length === 1 ? 'entry' : 'entries'}
            </span>
          </header>
          <ol>
            {data.changes.map((change) => (
              <li key={change.id}>
                <span className="lv-lot-activity-dot">
                  <History size={14} aria-hidden="true" />
                </span>
                <div>
                  <strong>{actionLabel(change.action)}</strong>
                  <span>{change.actor}</span>
                </div>
                <time dateTime={change.at}>
                  {date(change.at)}
                  <small>{time(change.at)} WAT</small>
                </time>
              </li>
            ))}
          </ol>
          {!data.changes.length && (
            <div className="lv-lot-empty">
              <History size={26} aria-hidden="true" />
              <p>No recorded changes</p>
            </div>
          )}
          <LotPanelPagination
            page={page}
            count={data.changes.length}
            previous={previous}
            next={!!data.nextCursor}
            onPrevious={onPrevious}
            onNext={onNext}
          />
        </section>
      </div>
      <Dialog
        open={zoom && !!current}
        onClose={() => setZoom(false)}
        title="Item photo"
        presentation="photo"
      >
        {current && (
          <img
            src={photo(current.url, buyerUrl)}
            alt={data.title}
            width={960}
            height={720}
          />
        )}
      </Dialog>
    </section>
  );
}
