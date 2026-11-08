'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createStaffAdminClient,
  watchBidReviewUpdates,
} from '@auction-ng/api-client/staff-admin';
import { ApiError } from '@auction-ng/api-client/auth';
import {
  formatNaira,
  type StaffBidReviewPage,
  type StaffBidReviewDetail,
  type StaffBidReviewQuery,
} from '@auction-ng/shared';
import {
  StaffBadge,
  StaffMessage,
  StaffSearch,
} from '@auction-ng/ui/web/staff-dashboard-view';
import { Button } from '@auction-ng/ui/web/button';
import { Select } from '@auction-ng/ui/web/select';
import { WalletPagination } from '@auction-ng/ui/web/wallet-workspace';
function useReviewRead<T>(read: () => Promise<T>, scope: string) {
  const latest = useRef(read);
  const invalidate = useRef<() => void>(() => {});
  latest.current = read;
  const [value, setValue] = useState<{ scope: string; data: T }>(),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true,
      running = false,
      queued = false;
    setError('');
    async function refresh() {
      if (!active || running || document.hidden) return;
      running = true;
      try {
        const data = await latest.current();
        if (active) {
          setValue({ scope, data });
          setError('');
        }
      } catch (cause) {
        if (active) {
          if (
            cause instanceof ApiError &&
            [401, 403, 404].includes(cause.status)
          )
            setValue(undefined);
          setError(
            'Bid records could not be refreshed. Check your connection and staff access, then retry.',
          );
        }
      } finally {
        running = false;
        if (active && queued) {
          queued = false;
          void refresh();
        }
      }
    }
    invalidate.current = () => {
      if (running) queued = true;
      else void refresh();
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    for (const event of ['focus', 'online', 'lotvanta:staff-refresh'])
      window.addEventListener(event, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      invalidate.current = () => {};
      clearInterval(timer);
      for (const event of ['focus', 'online', 'lotvanta:staff-refresh'])
        window.removeEventListener(event, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [scope, retry]);
  return {
    data: value?.scope === scope ? value.data : undefined,
    error,
    retry: () => setRetry((n) => n + 1),
    refresh: () => invalidate.current(),
  };
}
function useBidReviewSignals(ids: string[], refresh: () => void) {
  const latest = useRef(refresh);
  latest.current = refresh;
  const key = ids.slice().sort().join(',');
  useEffect(() => {
    if (!key) return;
    let close: (() => void) | undefined;
    const watch = () => {
      close?.();
      close = undefined;
      if (!document.hidden)
        close = watchBidReviewUpdates(
          process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4001',
          key.split(','),
          () => latest.current(),
        );
    };
    watch();
    document.addEventListener('visibilitychange', watch);
    return () => {
      document.removeEventListener('visibilitychange', watch);
      close?.();
    };
  }, [key]);
}
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-NG', {
        timeZone: 'Africa/Lagos',
        dateStyle: 'medium',
        timeStyle: 'medium',
      }) + ' WAT'
    : 'Not recorded';
type Credentials = { apiUrl: string; accessToken: string; deviceId: string };
export function BidReview(props: Credentials) {
  const client = useMemo(
    () => createStaffAdminClient(props.apiUrl, props),
    [props.apiUrl, props.accessToken, props.deviceId],
  );
  const [selected, setSelected] = useState<string>(),
    [opening, setOpening] = useState(false),
    [openError, setOpenError] = useState('');
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState<StaffBidReviewQuery['status']>('all'),
    [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages.at(-1);
  const list = useReviewRead<StaffBidReviewPage>(
    () => client.bidReview({ search: query, status, cursor, limit: 10 }),
    JSON.stringify([props.accessToken, query, status, cursor]),
  );
  useBidReviewSignals(
    selected
      ? []
      : (list.data?.items ?? [])
          .filter((lot) => ['open', 'closing'].includes(lot.status))
          .map((lot) => lot.id),
    list.refresh,
  );
  async function open(id: string) {
    if (opening) return;
    setOpening(true);
    setOpenError('');
    try {
      await client.recordBidReview(id, crypto.randomUUID());
      setSelected(id);
    } catch {
      setOpenError(
        'The inspection could not be recorded. Check your connection and retry.',
      );
    } finally {
      setOpening(false);
    }
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('lot');
    if (id && /^[0-9a-f-]{36}$/i.test(id)) void open(id);
  }, []);
  if (selected)
    return (
      <BidReviewItem
        {...props}
        id={selected}
        onBack={() => setSelected(undefined)}
      />
    );
  return (
    <section className="lv-staff-panel">
      <div className="lv-staff-review-filters">
        <StaffSearch
          value={search}
          onChange={setSearch}
          onSearch={(value) => {
            setQuery(value);
            setPages([undefined]);
          }}
          placeholder="Search item, item ID or bidder name / buyer ID"
        />
        <Select
          label="Auction status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as StaffBidReviewQuery['status']);
            setPages([undefined]);
          }}
        >
          <option value="all">All statuses</option>
          <option value="open">Live / closing</option>
          <option value="scheduled">Upcoming</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>
      {(openError || list.error) && (
        <StaffMessage>
          {openError || list.error} <Button onClick={list.retry}>Retry</Button>
        </StaffMessage>
      )}
      {!list.data && !list.error && (
        <p role="status">Loading auction records…</p>
      )}
      {list.data &&
        (list.data.items.length ? (
          <div className="lv-staff-collection-history">
            <table>
              <caption className="sr-only">
                Auction items and bid participation
              </caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Status / schedule</th>
                  <th scope="col">Participation</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((lot) => (
                  <tr key={lot.id}>
                    <td>
                      <strong>{lot.title}</strong>
                      <small>
                        {lot.reference} · {lot.condition.replaceAll('_', ' ')}
                      </small>
                      <small>
                        {lot.category} · {lot.location}
                      </small>
                    </td>
                    <td>
                      <StaffBadge status={lot.status} />
                      <small>Ends {date(lot.endAt)}</small>
                      {lot.archived && <small>Archived record</small>}
                    </td>
                    <td>
                      <strong>{lot.bidCount} accepted bids</strong>
                      <small>{lot.preBidCount} pre-bid records</small>
                      <small>Start {formatNaira(lot.startingPriceKobo)}</small>
                    </td>
                    <td>
                      <Button
                        disabled={opening}
                        onClick={() => void open(lot.id)}
                      >
                        View bids
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No auction items match this search.</p>
        ))}
      <WalletPagination
        page={pages.length}
        size={10}
        hasNext={!!list.data?.nextCursor}
        onPrevious={() => setPages((p) => (p.length > 1 ? p.slice(0, -1) : p))}
        onNext={() => {
          if (list.data?.nextCursor)
            setPages((p) => [...p, list.data?.nextCursor ?? undefined]);
        }}
      />
    </section>
  );
}
function BidReviewItem(
  props: Credentials & { id: string; onBack: () => void },
) {
  const client = useMemo(
    () => createStaffAdminClient(props.apiUrl, props),
    [props.apiUrl, props.accessToken, props.deviceId],
  );
  const [view, setView] = useState<'bids' | 'prebids'>('bids'),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages.at(-1);
  const state = useReviewRead<StaffBidReviewDetail>(
    () =>
      client.bidReviewDetail(props.id, {
        view,
        search: query,
        cursor,
        limit: 10,
      }),
    JSON.stringify([props.accessToken, props.id, view, query, cursor]),
  );
  const lastDetail = useRef<StaffBidReviewDetail>(undefined);
  if (state.data) lastDetail.current = state.data;
  if (state.error && !state.data) lastDetail.current = undefined;
  const detail = state.data ?? lastDetail.current;
  useBidReviewSignals(
    detail && ['open', 'closing'].includes(detail.lot.status)
      ? [detail.lot.id]
      : [],
    state.refresh,
  );
  const entries = state.data?.entries ?? [];
  const displayPrice =
    detail?.result.type === 'pending'
      ? detail.lastRecordedPriceKobo
      : detail?.result.priceKobo;
  return (
    <>
      <div className="lv-staff-review-back">
        <Button onClick={props.onBack}>Back to auction records</Button>
      </div>
      {state.error && (
        <StaffMessage>
          {state.error} <Button onClick={state.retry}>Retry</Button>
        </StaffMessage>
      )}
      {!detail && !state.error && (
        <p role="status">Loading item bid history…</p>
      )}
      {detail && (
        <>
          <section className="lv-staff-panel">
            <div className="lv-staff-panel-title">
              <div>
                <h2>{detail.lot.title}</h2>
                <p>
                  {detail.lot.reference} · {detail.lot.category}
                </p>
              </div>
              <StaffBadge status={detail.lot.status} />
            </div>
            <div className="lv-staff-review-summary">
              <div>
                <h3>Item and schedule</h3>
                <dl>
                  <dt>Item ID</dt>
                  <dd>{detail.lot.id}</dd>
                  <dt>Condition</dt>
                  <dd>{detail.lot.condition.replaceAll('_', ' ')}</dd>
                  <dt>Pickup centre</dt>
                  <dd>{detail.lot.location}</dd>
                  <dt>Starts</dt>
                  <dd>{date(detail.lot.startAt)}</dd>
                  <dt>Ends</dt>
                  <dd>{date(detail.lot.endAt)}</dd>
                  <dt>Starting price</dt>
                  <dd>{formatNaira(detail.lot.startingPriceKobo)}</dd>
                  <dt>Retail estimate</dt>
                  <dd>{formatNaira(detail.retailPriceKobo)}</dd>
                  <dt>Buy Now price</dt>
                  <dd>
                    {detail.fixedPriceKobo === null
                      ? 'Not offered'
                      : formatNaira(detail.fixedPriceKobo)}
                  </dd>
                  <dt>Bidding round</dt>
                  <dd>{detail.round + 1}</dd>
                </dl>
              </div>
              <div>
                <h3>
                  {detail.result.type === 'buy_now'
                    ? 'Buy Now purchase'
                    : detail.result.type === 'auction'
                      ? 'Auction result'
                      : detail.result.type === 'unsold'
                        ? 'Ended unsold'
                        : 'Recorded bidding'}
                </h3>
                <dl>
                  <dt>
                    {detail.result.buyer
                      ? detail.result.type === 'buy_now'
                        ? 'Purchaser'
                        : detail.result.status === 'paid'
                          ? 'Winner'
                          : 'Frozen result buyer'
                      : 'Recorded leader'}
                  </dt>
                  <dd>
                    {(detail.result.buyer ?? detail.recordedLeader)?.name ??
                      'No buyer recorded'}
                  </dd>
                  <dt>Buyer ID</dt>
                  <dd>
                    {(detail.result.buyer ?? detail.recordedLeader)?.id ?? '—'}
                  </dd>
                  <dt>
                    {detail.result.type === 'pending'
                      ? 'Latest recorded price'
                      : 'Final item price'}
                  </dt>
                  <dd>
                    {displayPrice === null || displayPrice === undefined
                      ? 'No recorded price'
                      : formatNaira(displayPrice)}
                  </dd>
                  <dt>Result status</dt>
                  <dd>{detail.result.status.replaceAll('_', ' ')}</dd>
                  <dt>Closed at</dt>
                  <dd>{date(detail.result.closedAt)}</dd>
                  <dt>Invoice</dt>
                  <dd>{detail.result.invoiceNumber ?? 'Not issued'}</dd>
                  <dt>Payment status</dt>
                  <dd>{detail.result.invoiceStatus ?? 'Not confirmed'}</dd>
                  <dt>Latest bid saved</dt>
                  <dd>{date(detail.lastRecordedAt)}</dd>
                </dl>
                <p>
                  Accepted bid records update silently as they are saved. A
                  recorded leader is not a confirmed winner. Private spending
                  limits are hidden.
                </p>
              </div>
            </div>
            <details>
              <summary>Item description</summary>
              <p>{detail.description}</p>
            </details>
          </section>
          <section className="lv-staff-panel">
            <div className="lv-staff-tabs" aria-label="Bid record views">
              {(['bids', 'prebids'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => {
                    setView(value);
                    setPages([undefined]);
                  }}
                >
                  {value === 'bids' ? 'Accepted bids' : 'Pre-bids'}
                </button>
              ))}
            </div>
            <StaffSearch
              value={search}
              onChange={setSearch}
              onSearch={(value) => {
                setQuery(value);
                setPages([undefined]);
              }}
              placeholder="Find bidder by name or buyer ID"
            />
            <p>
              {view === 'bids'
                ? 'Each accepted request and automatic counterbid is recorded separately. Earlier rounds remain history and do not become active again.'
                : 'Pre-bid records show their saved status and update time. A pre-bid is not a completed live bid until it launches.'}
            </p>
            {!state.data && !state.error && (
              <p role="status">Loading bid records…</p>
            )}
            {entries.length ? (
              <div className="lv-staff-collection-history">
                <table>
                  <caption className="sr-only">Item bid history</caption>
                  <thead>
                    <tr>
                      <th scope="col">Buyer</th>
                      <th scope="col">Bid information</th>
                      <th scope="col">Date / reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <strong>{entry.buyer.name}</strong>
                          <small>Buyer ID: {entry.buyer.id}</small>
                          {detail.result.buyer?.id === entry.buyer.id && (
                            <StaffBadge
                              status={
                                detail.result.invoiceStatus === 'paid'
                                  ? 'paid'
                                  : 'pending'
                              }
                            />
                          )}
                        </td>
                        <td>
                          <strong>{entry.kind}</strong>
                          <small>
                            {entry.directAmountKobo !== null
                              ? 'Submitted: ' +
                                formatNaira(entry.directAmountKobo)
                              : 'Private limit hidden'}
                          </small>
                          {entry.publicPriceKobo !== null && (
                            <small>
                              Price after bid:{' '}
                              {formatNaira(entry.publicPriceKobo)}
                            </small>
                          )}
                          <small>
                            {entry.round === null
                              ? 'Pre-bid / legacy'
                              : 'Round ' + (entry.round + 1)}
                          </small>
                          <StaffBadge status={entry.status} />
                        </td>
                        <td>
                          <strong>{date(entry.createdAt)}</strong>
                          {entry.updatedAt && (
                            <small>Updated: {date(entry.updatedAt)}</small>
                          )}
                          <small>Reference: {entry.reference}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : state.data ? (
              <p>
                No {view === 'bids' ? 'accepted bids' : 'pre-bids'} match this
                view.
              </p>
            ) : null}
            <WalletPagination
              page={pages.length}
              size={10}
              hasNext={!!state.data?.nextCursor}
              onPrevious={() =>
                setPages((p) => (p.length > 1 ? p.slice(0, -1) : p))
              }
              onNext={() => {
                if (state.data?.nextCursor)
                  setPages((p) => [...p, state.data?.nextCursor ?? undefined]);
              }}
            />
          </section>
        </>
      )}
    </>
  );
}
