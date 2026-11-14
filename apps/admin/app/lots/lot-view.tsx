'use client';
import { useEffect, useRef, useState } from 'react';
import { formatNaira, type LotView } from '@auction-ng/shared';
import { ApiError } from '@auction-ng/api-client/auth';
import type { LotsClient } from '@auction-ng/api-client/lots';
import { Button } from '@auction-ng/ui/web/button';
import { productImageSource } from '@auction-ng/ui/web/demo-image';
import {
  Copy,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Package,
  Pencil,
  Printer,
  Radio,
  TriangleAlert,
} from '@auction-ng/ui/web/icons';
import { categoryIconOf } from '../lot-setup/category-icon';
import {
  apiMessage,
  DeleteLotDialog,
  openLiveMonitor,
  type DeleteTarget,
} from './lot-dialogs';
import { ConditionBadge } from '@auction-ng/ui/web/auction';
import { useLotLabels } from './lot-labels';
import { MessageBuyersDialog } from './message-buyers';
import {
  conditionLabel,
  countdown,
  hoursLabel,
  stageLabel,
  StatusBadge,
  useServerNow,
  wat,
} from './lots-ui';

type Tab = 'bids' | 'watchers' | 'activity' | 'invoice';

export function LotViewPage({
  id,
  client,
  go,
  messageBuyers,
}: {
  id: string;
  client: LotsClient;
  go: (path: string) => void;
  /** Sends a message to this live lot's bidders and watchers. */
  messageBuyers: (
    lotId: string,
    message: string,
    reason: string,
    key: string,
  ) => Promise<string>;
}) {
  const [view, setView] = useState<LotView>();
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [photo, setPhoto] = useState(0);
  const [tab, setTab] = useState<Tab>('bids');
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [deleting, setDeleting] = useState<DeleteTarget>();
  const [messaging, setMessaging] = useState(false);
  const labels = useLotLabels(client);
  const now = useServerNow(view?.serverTime);
  useEffect(() => {
    let active = true;
    const read = () => {
      if (document.hidden || !navigator.onLine) return;
      client
        .view(id)
        .then((v) => {
          if (!active) return;
          setView(v);
          setError('');
        })
        .catch((failure: unknown) => {
          if (!active) return;
          setError(
            failure instanceof ApiError && failure.status === 404
              ? 'This lot doesn’t exist or was deleted.'
              : 'This lot couldn’t be loaded.',
          );
        });
    };
    read();
    const timer = setInterval(read, 30_000);
    for (const e of ['focus', 'lotvanta:staff-refresh'])
      window.addEventListener(e, read);
    return () => {
      active = false;
      clearInterval(timer);
      for (const e of ['focus', 'lotvanta:staff-refresh'])
        window.removeEventListener(e, read);
    };
  }, [client, id, version]);
  useEffect(() => {
    if (view && !['live', 'sold', 'unsold'].includes(view.editor.stage))
      setTab('activity');
  }, [view?.editor.stage]);

  if (!view)
    return (
      <div className="lv-lots">
        <p className="lv-lots-crumb">
          <button type="button" onClick={() => go('/lots')}>
            Lots
          </button>
        </p>
        {error ? (
          <div className="lv-lots-card lv-lots-state" role="alert">
            <p>{error}</p>
            <Button
              variant="secondary"
              onClick={() => setVersion((v) => v + 1)}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div
            className="lv-lots-skeleton"
            aria-busy="true"
            aria-label="Loading lot"
          />
        )}
      </div>
    );

  const e = view.editor;
  const lot = e.lot;
  const live = e.stage === 'live';
  const can = (a: string) => view.actions.includes(a as never);
  const photos = e.photos;
  const current = photos[photo] ?? photos[0];
  const Icon = categoryIconOf('tag');
  const start = Date.parse(view.startsAt);
  const end = Date.parse(view.endsAt);
  const share = Math.min(
    100,
    Math.max(0, ((now - start) / Math.max(1, end - start)) * 100),
  );
  const details = view.categoryFields.filter(
    (f) => lot.details[f.key] !== undefined,
  );
  const deleteTarget: DeleteTarget = {
    id: e.id,
    lotNumber: e.lotNumber,
    title: lot.title,
    stageLabel: stageLabel[e.stage],
    bids: view.bids,
    binCode: view.binCode,
    updatedAt: e.updatedAt,
  };

  return (
    <div className="lv-lots">
      <p className="lv-lots-crumb">
        <button type="button" onClick={() => go('/lots')}>
          Lots
        </button>{' '}
        › {e.lotNumber}
      </p>
      <header className="lv-lots-head">
        <div className="lv-lot-titlebar">
          <h1>{lot.title}</h1>
          <StatusBadge
            row={{
              stage: e.stage,
              archived: e.archived,
              deleted: !!view.deletedAt,
            }}
          />
          <p className="lv-lot-meta">
            <b>{e.lotNumber}</b> · {view.categoryPath} ·{' '}
            {conditionLabel(lot.condition)} · {view.locationName}
            {view.binCode ? `, bin ${view.binCode}` : ', no bin'}
            {view.supplierName ? ` · ${view.supplierName}` : ''}
          </p>
        </div>
        <div className="lv-lots-head-actions">
          <Button variant="secondary" onClick={() => void labels.print([e.id])}>
            <Printer size={16} aria-hidden="true" /> Print label
          </Button>
          {can('duplicate') && (
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  const copy = await client.duplicate(
                    e.id,
                    crypto.randomUUID(),
                  );
                  go(`/lots/${copy.id}/edit`);
                } catch (failure) {
                  setToast(
                    apiMessage(failure, 'The lot couldn’t be duplicated.'),
                  );
                }
              }}
            >
              <Copy size={16} aria-hidden="true" /> Duplicate
            </Button>
          )}
          {can('edit') && (
            <Button
              variant="secondary"
              onClick={() => go(`/lots/${e.id}/edit`)}
            >
              <Pencil size={16} aria-hidden="true" /> Edit
            </Button>
          )}
          {can('live-monitor') && (
            <Button onClick={() => openLiveMonitor(e.id)}>
              Open in Live monitor
            </Button>
          )}
          {(can('archive') ||
            can('unarchive') ||
            can('delete') ||
            can('restore')) && (
            <div className="lv-lots-rowacts">
              <Button
                variant="secondary"
                aria-label="More actions"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <MoreHorizontal size={18} aria-hidden="true" />
              </Button>
              {menu && (
                <div className="lv-lots-menu lv-lots-menu--right" role="menu">
                  {(can('archive') || can('unarchive')) && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={async () => {
                        setMenu(false);
                        try {
                          const r = await client.archive(
                            e.id,
                            e.updatedAt,
                            can('archive'),
                          );
                          setToast(r.message);
                          setVersion((v) => v + 1);
                        } catch (failure) {
                          setToast(apiMessage(failure, 'That didn’t work.'));
                        }
                      }}
                    >
                      {can('archive') ? 'Archive' : 'Take out of archive'}
                    </button>
                  )}
                  {can('restore') && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={async () => {
                        setMenu(false);
                        try {
                          const r = await client.restore(e.id, e.updatedAt);
                          setToast(r.message);
                          setVersion((v) => v + 1);
                        } catch (failure) {
                          setToast(
                            apiMessage(
                              failure,
                              'The lot couldn’t be restored.',
                            ),
                          );
                        }
                      }}
                    >
                      Restore
                    </button>
                  )}
                  {can('delete') && (
                    <button
                      type="button"
                      role="menuitem"
                      data-danger
                      onClick={() => {
                        setMenu(false);
                        setDeleting(deleteTarget);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>
      {toast && (
        <p className="lv-lots-toast" role="status">
          {toast}
        </p>
      )}
      {labels.error && <p className="lv-lots-error">{labels.error}</p>}
      {view.deletedAt && (
        <p className="lv-lots-notice">
          <TriangleAlert size={18} aria-hidden="true" />
          Deleted {wat.dateTime(view.deletedAt)}: {view.deleteReason}
        </p>
      )}
      {e.locks.reason && !view.deletedAt && (
        <p className="lv-lots-notice" role="note">
          <TriangleAlert size={18} aria-hidden="true" />
          {e.locks.reason}
        </p>
      )}

      <div className="lv-lot-view">
        <div className="lv-lot-view-main">
          <section
            className="lv-lots-card lv-lot-overview"
            aria-label="Photos and description"
          >
            <div className="lv-lot-gallery">
              <div className="lv-lot-cover">
                {current ? (
                  <img
                    src={productImageSource(current.url)}
                    alt={`${lot.title}, photo ${photo + 1}`}
                  />
                ) : (
                  <Icon size={56} aria-hidden="true" />
                )}
                {photos.length > 0 && (
                  <small>
                    {photo + 1} / {photos.length}
                    {photo === 0 ? ' · cover' : ''}
                  </small>
                )}
              </div>
              {photos.length > 1 && (
                <div className="lv-lot-thumbs">
                  {photos.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={i === photo}
                      aria-label={`Photo ${i + 1}${p.isDefect ? ', shows a defect' : ''}`}
                      onClick={() => setPhoto(i)}
                    >
                      <img
                        src={productImageSource(p.thumbnailUrl ?? p.url)}
                        alt=""
                        loading="lazy"
                      />
                      {p.isDefect && (
                        <span className="lv-lot-defect">Defect</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="lv-lot-facts">
              <div>
                <h3>Description</h3>
                <p>{lot.description}</p>
              </div>
              {lot.included.length > 0 && (
                <div>
                  <h3>Included</h3>
                  <div className="lv-lot-tags">
                    {lot.included.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {lot.defects.length > 0 && (
                <div>
                  <h3>Missing or defects</h3>
                  <div className="lv-lot-tags" data-defects>
                    {lot.defects.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {(details.length > 0 || view.brandName) && (
                <div>
                  <h3>Item details</h3>
                  <dl className="lv-lot-dl">
                    {view.brandName && (
                      <>
                        <dt>Brand</dt>
                        <dd>{view.brandName}</dd>
                      </>
                    )}
                    {details.map((f) => (
                      <div key={f.key} style={{ display: 'contents' }}>
                        <dt>{f.name}</dt>
                        <dd>
                          {typeof lot.details[f.key] === 'boolean'
                            ? lot.details[f.key]
                              ? 'Yes'
                              : 'No'
                            : String(lot.details[f.key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          </section>

          <section className="lv-lots-card">
            <div
              className="lv-lots-tabs"
              role="tablist"
              aria-label="Lot records"
            >
              {(
                [
                  ['bids', 'Bids', view.bids],
                  ['watchers', 'Watchers', view.watching],
                  ['activity', 'Activity', view.activityCount],
                  ['invoice', 'Invoice and pickup', null],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                >
                  {label}
                  {count !== null && (
                    <span className="lv-lots-count">
                      {count.toLocaleString('en-NG')}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <LotTab tab={tab} view={view} client={client} />
          </section>

          <LotDetails
            view={view}
            onEdit={can('edit') ? () => go(`/lots/${e.id}/edit`) : undefined}
          />
        </div>

        <aside className="lv-lot-rail" aria-label="Lot status">
          <section className="lv-lot-bidcard" aria-label="Current bid">
            <header>
              <span>
                {e.stage === 'sold'
                  ? 'Winning bid'
                  : live
                    ? 'Current bid'
                    : 'Start price'}
              </span>
              {live && <strong>Ends in {countdown(end - now)}</strong>}
            </header>
            <b>{formatNaira(view.currentPriceKobo ?? lot.startPriceKobo)}</b>
            {live && (
              <div className="lv-lots-progress" aria-hidden="true">
                <span style={{ width: `${share}%` }} />
              </div>
            )}
            <dl>
              <div>
                <dt>Bids</dt>
                <dd>{view.bids}</dd>
              </div>
              <div>
                <dt>Watching</dt>
                <dd>{view.watching}</dd>
              </div>
              <div>
                <dt>Of retail</dt>
                <dd>
                  {lot.retailPriceKobo
                    ? `${Math.round(((view.currentPriceKobo ?? lot.startPriceKobo) / lot.retailPriceKobo) * 100)}%`
                    : '–'}
                </dd>
              </div>
            </dl>
            {view.leader && (
              <p>
                Leading: <strong>{view.leader.name}</strong> ·{' '}
                {view.leader.pastWins} past{' '}
                {view.leader.pastWins === 1 ? 'win' : 'wins'},{' '}
                {view.leader.strikes
                  ? `${view.leader.strikes} strikes`
                  : 'no strikes'}
              </p>
            )}
          </section>

          <section className="lv-lots-card lv-lots-pad lv-lot-railcard">
            <h2>Lot journey</h2>
            <ol className="lv-lot-journey">
              {view.journey.map((step) => (
                <li key={step.key} data-state={step.state}>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </li>
              ))}
            </ol>
          </section>

          <section className="lv-lots-card lv-lots-pad lv-lot-railcard">
            <h2>Quick actions</h2>
            <div className="lv-lot-quick">
              {live && can('live-monitor') && (
                <>
                  <button type="button" onClick={() => openLiveMonitor(e.id)}>
                    <Radio size={18} aria-hidden="true" /> Extend or pause{' '}
                    <small>Live monitor</small>
                  </button>
                  <button type="button" onClick={() => setMessaging(true)}>
                    <MessageSquare size={18} aria-hidden="true" /> Message
                    bidders and watchers
                  </button>
                </>
              )}
              {can('edit') && (
                <button type="button" onClick={() => go(`/lots/${e.id}/edit`)}>
                  <MapPin size={18} aria-hidden="true" /> Move to another bin
                </button>
              )}
              {live && can('live-monitor') && (
                <button
                  type="button"
                  data-danger
                  onClick={() => openLiveMonitor(e.id)}
                >
                  <Package size={18} aria-hidden="true" /> Cancel lot and refund
                  holds
                </button>
              )}
              {!live && !can('edit') && (
                <span className="lv-lots-sub">
                  No actions for this lot right now.
                </span>
              )}
            </div>
          </section>
        </aside>
      </div>
      {labels.sheet}
      {messaging && (
        <MessageBuyersDialog
          lotNumber={e.lotNumber}
          bidders={view.bids}
          watchers={view.watching}
          onClose={() => setMessaging(false)}
          send={(message, reason, key) =>
            messageBuyers(e.id, message, reason, key)
          }
          onSent={(text) => {
            setMessaging(false);
            setToast(text);
          }}
        />
      )}
      {deleting && (
        <DeleteLotDialog
          target={deleting}
          client={client}
          onClose={() => setDeleting(undefined)}
          onDone={(message) => {
            setDeleting(undefined);
            setToast(message);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

function LotTab({
  tab,
  view,
  client,
}: {
  tab: Tab;
  view: LotView;
  client: LotsClient;
}) {
  const id = view.editor.id;
  const [rows, setRows] = useState<unknown>();
  const [error, setError] = useState('');
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle');
  // Answers from a tab the user has since left are dropped.
  const request = useRef(0);
  const fetchPage = (cursor?: string): Promise<unknown> =>
    tab === 'bids'
      ? client.bids(id, cursor)
      : tab === 'watchers'
        ? client.watchers(id, cursor)
        : tab === 'activity'
          ? client.activity(id, cursor)
          : client.invoice(id);
  useEffect(() => {
    const mine = ++request.current;
    setRows(undefined);
    setError('');
    setMore('idle');
    fetchPage()
      .then((r) => mine === request.current && setRows(r))
      .catch(
        () =>
          mine === request.current &&
          setError('This couldn’t be loaded. Try again.'),
      );
    // fetchPage only changes with these.
  }, [tab, id, client]);
  /** Scrolling near the end adds the next rows below the ones shown. */
  function loadMore() {
    const page = rows as PagedRows | undefined;
    if (!page?.nextCursor || more === 'loading') return;
    const mine = request.current;
    setMore('loading');
    fetchPage(page.nextCursor)
      .then((r) => {
        if (mine !== request.current) return;
        const next = r as PagedRows;
        setRows((current: unknown) => {
          const seen = (current as PagedRows).items;
          return {
            items: [...seen, ...next.items],
            nextCursor: next.nextCursor,
          };
        });
        setMore('idle');
      })
      .catch(() => mine === request.current && setMore('error'));
  }
  const total =
    tab === 'bids'
      ? view.bids
      : tab === 'watchers'
        ? view.watching
        : view.activityCount;
  if (error) return <p className="lv-lots-error lv-lots-pad">{error}</p>;
  if (!rows)
    return (
      <div
        className="lv-lots-skeleton"
        style={{ height: 160, marginTop: 16 }}
        aria-busy="true"
      />
    );
  return (
    <LotTabRows
      tab={tab}
      rows={rows}
      total={total}
      more={more}
      onMore={loadMore}
    />
  );
}

type PagedRows = {
  items: Record<string, unknown>[];
  nextCursor: string | null;
};

/** Category, price, place and run time, always shown under the records. */
function LotDetails({ view, onEdit }: { view: LotView; onEdit?: () => void }) {
  const lot = view.editor.lot;
  return (
    <section className="lv-lots-card" aria-labelledby="lot-details-title">
      <div className="lv-lot-details">
        <header className="lv-lot-details-head">
          <h2 id="lot-details-title">Details</h2>
          {onEdit && (
            <button
              type="button"
              className="lv-lot-details-edit"
              onClick={onEdit}
            >
              Edit details
            </button>
          )}
        </header>
        <dl className="lv-lot-dl">
          <dt>Category</dt>
          <dd>{view.categoryPath}</dd>
          <dt>Condition</dt>
          <dd>
            <ConditionBadge condition={lot.condition} />
          </dd>
          <dt>Pickup location</dt>
          <dd>
            {view.locationName} ·{' '}
            {view.binCode ? `bin ${view.binCode}` : 'no bin'}
          </dd>
          <dt>Supplier</dt>
          <dd>{view.supplierName ?? '—'}</dd>
          <dt>Added by</dt>
          <dd>
            {view.addedBy?.name ?? 'Not recorded'} ·{' '}
            {wat.dateTime(view.createdAt)}
          </dd>
        </dl>
        <dl className="lv-lot-dl">
          <dt>Start price</dt>
          <dd>{formatNaira(lot.startPriceKobo)}</dd>
          <dt>Retail estimate</dt>
          <dd>{formatNaira(lot.retailPriceKobo)}</dd>
          {view.fixedPriceKobo !== null && (
            <>
              <dt>Buy now price</dt>
              <dd>{formatNaira(view.fixedPriceKobo)}</dd>
            </>
          )}
          <dt>Run time</dt>
          <dd>
            {hoursLabel(lot.runTimeMinutes)}
            {view.editor.stage !== 'draft' &&
              ` · ${wat.dayTime(view.startsAt)} → ${wat.dayTime(view.endsAt)}`}
          </dd>
        </dl>
      </div>
    </section>
  );
}

function LotTabRows({
  tab,
  rows,
  total,
  more,
  onMore,
}: {
  tab: Tab;
  rows: unknown;
  total: number;
  more: 'idle' | 'loading' | 'error';
  onMore: () => void;
}) {
  if (tab === 'invoice') {
    const inv = rows as Awaited<ReturnType<LotsClient['invoice']>>;
    return inv.invoiceNumber || inv.hammerKobo ? (
      <div className="lv-lot-details">
        <dl className="lv-lot-dl">
          <dt>Invoice</dt>
          <dd>
            {inv.invoiceNumber ?? 'Not issued yet'}{' '}
            {inv.invoiceStatus ? `· ${inv.invoiceStatus}` : ''}
          </dd>
          <dt>Winner</dt>
          <dd>{inv.winnerName ?? '—'}</dd>
          <dt>Winning bid</dt>
          <dd>{inv.hammerKobo !== null ? formatNaira(inv.hammerKobo) : '—'}</dd>
          <dt>Invoice total</dt>
          <dd>{inv.totalKobo !== null ? formatNaira(inv.totalKobo) : '—'}</dd>
          <dt>Pickup</dt>
          <dd>
            {inv.collectedAt
              ? `Collected ${wat.dateTime(inv.collectedAt)}`
              : (inv.pickupStatus ?? 'Not collected yet')}
          </dd>
        </dl>
      </div>
    ) : (
      <p className="lv-lots-pad lv-lots-sub">
        The invoice and pickup appear here after the lot is sold.
      </p>
    );
  }
  const page = rows as PagedRows;
  if (!page.items.length)
    return (
      <p className="lv-lots-pad lv-lots-sub">
        {tab === 'bids'
          ? 'No bids yet.'
          : tab === 'watchers'
            ? 'Nobody is watching yet.'
            : 'No activity recorded.'}
      </p>
    );
  return (
    <>
      <div
        className="lv-lot-tabscroll"
        role="region"
        tabIndex={0}
        aria-label={`${tab === 'bids' ? 'Bids' : tab === 'watchers' ? 'Watchers' : 'Activity'}, scroll for more`}
        onScroll={(e) => {
          const box = e.currentTarget;
          if (box.scrollTop + box.clientHeight >= box.scrollHeight - 120)
            onMore();
        }}
      >
        <table className="lv-lot-tabtable">
          <thead>
            {tab === 'bids' ? (
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Bidder</th>
                <th scope="col" className="lv-lots-right">
                  Amount
                </th>
                <th scope="col">Type</th>
              </tr>
            ) : tab === 'watchers' ? (
              <tr>
                <th scope="col">Watcher</th>
                <th scope="col">Since</th>
              </tr>
            ) : (
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">What</th>
              </tr>
            )}
          </thead>
          <tbody>
            {tab === 'bids'
              ? (
                  page.items as Awaited<ReturnType<LotsClient['bids']>>['items']
                ).map((b) => (
                  <tr key={b.id}>
                    <td>{wat.dateTime(b.at)}</td>
                    <td>
                      {b.bidderName ? (
                        <>
                          {b.bidderName}{' '}
                          <small>shown to buyers as {b.maskedName}</small>
                        </>
                      ) : (
                        b.maskedName
                      )}
                    </td>
                    <td className="lv-lots-right">
                      <strong>{formatNaira(b.amountKobo)}</strong>
                    </td>
                    <td>
                      <span className="lv-lot-pill">
                        {b.proxy ? 'Proxy' : 'Manual'}
                      </span>
                      {b.leading && (
                        <span className="lv-lot-pill" data-tone="win">
                          Leading
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              : tab === 'watchers'
                ? (
                    page.items as Awaited<
                      ReturnType<LotsClient['watchers']>
                    >['items']
                  ).map((w, i) => (
                    <tr key={i}>
                      <td>
                        {w.name ?? w.maskedName}{' '}
                        {w.name && (
                          <small>shown to buyers as {w.maskedName}</small>
                        )}
                      </td>
                      <td>{wat.dateTime(w.since)}</td>
                    </tr>
                  ))
                : (
                    page.items as Awaited<
                      ReturnType<LotsClient['activity']>
                    >['items']
                  ).map((a) => (
                    <tr key={a.id}>
                      <td>{wat.dateTime(a.at)}</td>
                      <td>{a.actor}</td>
                      <td>{a.label}</td>
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>
      <p className="lv-lots-foot">
        <span>
          {tab === 'bids'
            ? 'Full names are visible to admins and ops managers only.'
            : ''}
        </span>
        <span aria-live="polite">
          {more === 'loading'
            ? 'Loading more…'
            : `Showing ${page.items.length.toLocaleString('en-NG')} of ${Math.max(total, page.items.length).toLocaleString('en-NG')}${page.nextCursor ? ' · scroll for more' : ''}`}
        </span>
        {more === 'error' && (
          <Button variant="secondary" size="small" onClick={onMore}>
            Try again
          </Button>
        )}
      </p>
    </>
  );
}
