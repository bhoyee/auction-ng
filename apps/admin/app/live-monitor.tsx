'use client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type SetStateAction,
  type Dispatch,
} from 'react';
import { createPortal } from 'react-dom';
import {
  createStaffAdminClient,
  connectStaffLive,
} from '@auction-ng/api-client/staff-admin';
import { ApiError } from '@auction-ng/api-client/auth';
import {
  compareStreamIds,
  formatNaira,
  LIVE_MONITOR_STALE_MS,
  type MonitorLot,
  type MonitorClosed,
} from '@auction-ng/shared';
import {
  LiveMonitorHeader,
  MonitorKpis,
  MonitorTable,
  MonitorBidChart,
  MonitorIssuesCard,
  MonitorClosedCard,
  MonitorFrame,
  type LivePanel,
} from '@auction-ng/ui/admin/live-monitor-view';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';

function useLivePanel<T>(
  load: () => Promise<T>,
  onExpired: () => void,
  reconcile?: (previous: T | null, next: T) => T,
): LivePanel<T> & { set: Dispatch<SetStateAction<T | null>> } {
  const latest = useRef({ load, onExpired, reconcile });
  latest.current = { load, onExpired, reconcile };
  const [value, set] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const runRef = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true,
      running = false,
      pending = false,
      last = -Infinity;
    let delayed: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      if (!active || document.hidden || !navigator.onLine) return;
      if (running) {
        pending = true;
        return;
      }
      if (performance.now() - last < 1000) {
        if (!delayed)
          delayed = setTimeout(() => {
            delayed = undefined;
            void read();
          }, 1000);
        return;
      }
      running = true;
      last = performance.now();
      try {
        const next = await latest.current.load();
        if (active) {
          set((previous) => latest.current.reconcile?.(previous, next) ?? next);
          setError('');
        }
      } catch (cause) {
        if (active) {
          if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
            set(null);
            if (cause.status === 401) latest.current.onExpired();
          }
          setError(
            cause instanceof ApiError && cause.status === 403
              ? 'Your account cannot view this information.'
              : 'This section could not be refreshed. Check your connection and retry.',
          );
        }
      } finally {
        running = false;
        if (active) {
          setLoading(false);
          if (pending) {
            pending = false;
            void read();
          }
        }
      }
    };
    const refresh = () => {
      void read();
    };
    runRef.current = refresh;
    refresh();
    const interval = setInterval(refresh, 5000);
    window.addEventListener('lotvanta:live-refresh', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(interval);
      clearTimeout(delayed);
      window.removeEventListener('lotvanta:live-refresh', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return { value, error, loading, retry: () => runRef.current(), set };
}
export function LiveMonitor({
  apiUrl,
  accessToken,
  deviceId,
  isAdmin,
  canHistory,
  onUnauthorized,
  onHistory,
}: {
  apiUrl: string;
  accessToken: string;
  deviceId: string;
  isAdmin: boolean;
  canHistory: boolean;
  onUnauthorized: (token: string) => void;
  onHistory: (id: string) => void;
}) {
  const client = useMemo(
    () => createStaffAdminClient(apiUrl, { accessToken, deviceId }),
    [apiUrl, accessToken, deviceId],
  );
  const [category, setCategory] = useState(''),
    [location, setLocation] = useState(''),
    [loaded, setLoaded] = useState(50);
  const expired = () => onUnauthorized(accessToken);
  const summary = useLivePanel(() => client.liveSummary(), expired),
    series = useLivePanel(() => client.liveSeries(), expired),
    issues = useLivePanel(() => client.liveIssues(), expired),
    closed = useLivePanel(() => client.liveClosed({ limit: 6 }), expired),
    filters = useLivePanel(() => client.liveFilters(), expired);
  const loadRows = async () => {
    let cursor: string | undefined;
    let page = await client.liveLots({
      limit: 50,
      categoryId: category || undefined,
      locationId: location || undefined,
    });
    const items = [...page.items];
    while (items.length < loaded && page.nextCursor) {
      cursor = page.nextCursor;
      page = await client.liveLots({
        limit: 50,
        cursor,
        categoryId: category || undefined,
        locationId: location || undefined,
      });
      items.push(...page.items);
    }
    return {
      ...page,
      items: [...new Map(items.map((row) => [row.id, row])).values()],
    };
  };
  const lots = useLivePanel(loadRows, expired, (previous, next) => {
    const old = new Map(previous?.items.map((row) => [row.id, row]) ?? []);
    return {
      ...next,
      items: next.items.map((row) => {
        const newer = old.get(row.id);
        return newer && compareStreamIds(newer.streamId, row.streamId) > 0
          ? newer
          : row;
      }),
    };
  });
  useEffect(() => {
    lots.retry();
  }, [category, location, loaded]); // Only this panel depends on filters/page size.
  const [connected, setConnected] = useState(false),
    [now, setNow] = useState<number | null>(null),
    [target, setTarget] = useState<MonitorLot | null>(null),
    [info, setInfo] = useState('');
  const [allClosed, setAllClosed] = useState<MonitorClosed | null>(null),
    [allOpen, setAllOpen] = useState(false),
    [allLoading, setAllLoading] = useState(false),
    [allError, setAllError] = useState('');
  const [historyReason, setHistoryReason] = useState(''),
    [historyBusy, setHistoryBusy] = useState(false),
    [historyError, setHistoryError] = useState('');
  const historyKey = useRef(crypto.randomUUID());
  const [messageOpen, setMessageOpen] = useState(false),
    [messageLot, setMessageLot] = useState(''),
    [messageText, setMessageText] = useState(''),
    [messageReason, setMessageReason] = useState(''),
    [messageBusy, setMessageBusy] = useState(false),
    [messageError, setMessageError] = useState('');
  const messageKey = useRef(crypto.randomUUID());
  const [pauseOpen, setPauseOpen] = useState(false),
    [pauseOperation, setPauseOperation] = useState<'pause_all' | 'resume_all'>(
      'pause_all',
    ),
    [pauseReason, setPauseReason] = useState(''),
    [pauseConfirmation, setPauseConfirmation] = useState(''),
    [pauseBusy, setPauseBusy] = useState(false),
    [pauseError, setPauseError] = useState('');
  const pauseKey = useRef(crypto.randomUUID());
  const pauseRevision = useRef<string | undefined>(undefined);
  const openPause = () => {
    pauseRevision.current = summary.value?.controlRevision;
    setPauseOperation(summary.value?.paused ? 'resume_all' : 'pause_all');
    setPauseReason('');
    setPauseConfirmation('');
    setPauseError('');
    pauseKey.current = crypto.randomUUID();
    setPauseOpen(true);
  };
  async function submitPause() {
    if (pauseBusy) return;
    setPauseBusy(true);
    setPauseError('');
    try {
      const result = await client.controlLiveBidding({
        operation: pauseOperation,
        idempotencyKey: pauseKey.current,
        reason: pauseReason,
        confirmation: pauseConfirmation,
        expectedRevision: pauseRevision.current,
      });
      setPauseOpen(false);
      setInfo(result.message);
      window.dispatchEvent(new Event('lotvanta:live-refresh'));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expired();
      setPauseError(
        'This action was not confirmed. Bidding status may have changed. Keep the same request and retry, or wait for the live status.',
      );
    } finally {
      setPauseBusy(false);
    }
  }
  const openMessage = (lotId = '') => {
    setMessageLot(lotId);
    setMessageText('');
    setMessageReason('');
    setMessageError('');
    messageKey.current = crypto.randomUUID();
    setMessageOpen(true);
  };
  async function sendMessage() {
    if (messageBusy) return;
    setMessageBusy(true);
    setMessageError('');
    try {
      const result = await client.messageLiveBidders({
        operation: 'message',
        idempotencyKey: messageKey.current,
        lotId: messageLot,
        message: messageText,
        reason: messageReason,
      });
      setMessageOpen(false);
      setInfo(result.message);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expired();
      setMessageError(
        'Message was not confirmed. Check your item, message, reason and permissions; retry this same request.',
      );
    } finally {
      setMessageBusy(false);
    }
  }
  const setRows = lots.set;
  useEffect(() => {
    const live = connectStaffLive(
      process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4001',
      { accessToken, deviceId },
      {
        status: setConnected,
        changed: () => window.dispatchEvent(new Event('lotvanta:live-refresh')),
        patch: (patch) => {
          setRows((previous) =>
            previous
              ? {
                  ...previous,
                  items: previous.items.map((row) =>
                    row.id === patch.lotId &&
                    compareStreamIds(patch.streamId, row.streamId) >= 0
                      ? {
                          ...row,
                          currentPriceKobo: patch.currentPriceKobo,
                          endsAt: patch.endsAt,
                          streamId: patch.streamId,
                          serverTime: patch.serverTime,
                        }
                      : row,
                  ),
                }
              : null,
          );
        },
      },
    );
    const interval = setInterval(() => setNow(live.now()), 1000);
    return () => {
      clearInterval(interval);
      live.close();
    };
  }, [accessToken, deviceId, setRows]);
  const stale =
    !connected ||
    now === null ||
    !summary.value ||
    now - Date.parse(summary.value.serverTime) >= LIVE_MONITOR_STALE_MS;
  const current = summary.value;
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortal(document.getElementById('staff-overview-live-status'));
  }, []);
  const actions = useCallback((row: MonitorLot) => {
    setTarget(row);
    setHistoryReason('');
    setHistoryError('');
    historyKey.current = crypto.randomUUID();
  }, []);
  async function openHistory() {
    if (!target || historyBusy) return;
    setHistoryBusy(true);
    setHistoryError('');
    try {
      await client.recordLiveHistory({
        idempotencyKey: historyKey.current,
        operation: 'history',
        lotId: target.id,
        reason: historyReason,
      });
      onHistory(target.id);
      setTarget(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expired();
      setHistoryError(
        'This inspection could not be recorded. Check your permission and reason, then retry.',
      );
    } finally {
      setHistoryBusy(false);
    }
  }
  async function readClosed(cursor?: string) {
    if (allLoading) return;
    setAllLoading(true);
    setAllError('');
    try {
      setAllClosed(await client.liveClosed({ limit: 25, cursor }));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expired();
      setAllError('Closed auctions could not be loaded. Retry.');
    } finally {
      setAllLoading(false);
    }
  }
  return (
    <>
      {portal &&
        createPortal(
          <span className="lv-monitor-top-pill">
            <i />
            {stale
              ? 'Reconnecting…'
              : 'Live · ' + current?.closing15Count + ' lots closing in 15 min'}
          </span>,
          portal,
        )}
      <LiveMonitorHeader
        summary={current}
        live={!stale}
        now={now}
        canPause={isAdmin}
        controlsReady={summary.value?.phase !== 'resuming'}
        messagingReady
        onMessage={() => openMessage()}
        onEmergency={openPause}
      />
      <MonitorKpis state={summary} stale={stale} />
      <div className="lv-monitor-columns">
        <MonitorFrame
          title="Closing next"
          subtitle="Sorted by time left · yellow under 2 minutes"
          state={lots}
          className="lv-monitor-closing"
          actions={
            <div className="lv-monitor-filter-row">
              <select
                aria-label="Pickup location"
                value={location}
                onChange={(event) => {
                  setLocation(event.target.value);
                  setLoaded(50);
                }}
              >
                <option value="">All locations</option>
                {filters.value?.locations.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setLoaded(50);
                }}
              >
                <option value="">All categories</option>
                {filters.value?.categories.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {(value) => (
            <>
              <MonitorTable
                rows={value.items}
                now={now}
                stale={stale || !!lots.error}
                onActions={actions}
                buyerUrl={
                  process.env.NEXT_PUBLIC_BUYER_URL || 'http://localhost:3300'
                }
              />
              <footer className="lv-monitor-footer">
                <p>
                  View bid history or message this item’s bidders. Actions
                  require a reason and are recorded.
                </p>
                {value.nextCursor && (
                  <Button
                    variant="secondary"
                    onClick={() => setLoaded((count) => count + 50)}
                  >
                    Show more
                  </Button>
                )}
              </footer>
            </>
          )}
        </MonitorFrame>
        <aside className="lv-monitor-right">
          <MonitorBidChart state={series} stale={stale || !!series.error} />
          <MonitorIssuesCard
            state={issues}
            onDetails={(kind) =>
              setInfo(
                issues.value?.items.find((row) => row.kind === kind)?.context ??
                  'Issue details unavailable.',
              )
            }
          />
          <MonitorClosedCard
            state={closed}
            onAll={() => {
              setAllOpen(true);
              void readClosed();
            }}
          />
        </aside>
      </div>
      {filters.error && (
        <div className="lv-admin-widget-error" role="alert">
          Filters could not be refreshed.{' '}
          <button type="button" onClick={filters.retry}>
            Retry filters
          </button>
        </div>
      )}
      <Dialog
        open={!!target}
        onClose={() => setTarget(null)}
        title={target ? 'Actions · ' + target.reference : 'Lot actions'}
      >
        <div className="lv-monitor-controls-list">
          <p>{target?.title}</p>
          <Button
            variant="secondary"
            disabled={stale}
            onClick={() => {
              const id = target?.id;
              setTarget(null);
              openMessage(id);
            }}
          >
            Message bidders
          </Button>
          <Button variant="secondary" disabled>
            Pause lot
          </Button>
          <Button variant="secondary" disabled>
            Extend by 2 min
          </Button>
          <Button variant="danger" disabled>
            Cancel lot
          </Button>
          <label htmlFor="monitor-history-reason">
            Reason for viewing bid history
          </label>
          <textarea
            id="monitor-history-reason"
            className="agn-input"
            value={historyReason}
            maxLength={1000}
            rows={3}
            disabled={historyBusy}
            onChange={(event) => setHistoryReason(event.target.value)}
          />
          {historyError && (
            <p role="alert" className="lv-admin-widget-error">
              {historyError}
            </p>
          )}
          <Button
            disabled={!canHistory || historyReason.trim().length < 5 || stale}
            busy={historyBusy}
            onClick={() => void openHistory()}
          >
            View bid history
          </Button>
          <small>
            Operational controls are not enabled while their money and
            concurrency checks are being connected.
          </small>
        </div>
      </Dialog>
      <Dialog
        open={!!info}
        onClose={() => setInfo('')}
        title="Live monitor details"
      >
        <p>{info}</p>
      </Dialog>
      <Dialog
        open={messageOpen}
        onClose={() => {
          if (!messageBusy) setMessageOpen(false);
        }}
        title="Message bidders on a lot"
      >
        <div className="lv-monitor-controls-list">
          <p>
            This sends your message to buyers who have bid on this item,
            including outbid buyers. It does not change bids or payments. Your
            reason is recorded for staff only.
          </p>
          <label htmlFor="monitor-message-lot">Item</label>
          <select
            id="monitor-message-lot"
            className="agn-input"
            value={messageLot}
            disabled={messageBusy}
            onChange={(event) => {
              setMessageLot(event.target.value);
              messageKey.current = crypto.randomUUID();
            }}
          >
            <option value="">Choose an item</option>
            {lots.value?.items.map((row) => (
              <option key={row.id} value={row.id}>
                {row.reference} · {row.title}
              </option>
            ))}
          </select>
          <label htmlFor="monitor-message-text">Message to bidders</label>
          <textarea
            id="monitor-message-text"
            className="agn-input"
            rows={5}
            maxLength={2000}
            value={messageText}
            disabled={messageBusy}
            onChange={(event) => {
              setMessageText(event.target.value);
              messageKey.current = crypto.randomUUID();
            }}
          />
          <label htmlFor="monitor-message-reason">Staff reason</label>
          <textarea
            id="monitor-message-reason"
            className="agn-input"
            rows={3}
            maxLength={1000}
            value={messageReason}
            disabled={messageBusy}
            onChange={(event) => {
              setMessageReason(event.target.value);
              messageKey.current = crypto.randomUUID();
            }}
          />
          {messageError && (
            <p role="alert" className="lv-admin-widget-error">
              {messageError}
            </p>
          )}
          <Button
            busy={messageBusy}
            disabled={
              stale ||
              !messageLot ||
              messageText.trim().length < 5 ||
              messageReason.trim().length < 5
            }
            onClick={() => void sendMessage()}
          >
            Send message to bidders
          </Button>
          <small>
            Messages appear in-app and are queued for email and enabled phone
            alerts. Delivery depends on the configured providers.
          </small>
        </div>
      </Dialog>
      <Dialog
        open={pauseOpen}
        onClose={() => {
          if (!pauseBusy) setPauseOpen(false);
        }}
        title={
          pauseOperation === 'pause_all'
            ? 'Pause all bidding'
            : 'Resume all bidding'
        }
      >
        <div className="lv-monitor-controls-list">
          <p>
            {pauseOperation === 'pause_all'
              ? 'This freezes bidding, countdowns and closing, and holds scheduled launches. Existing payments continue to reconcile. Reserved bid funds stay reserved.'
              : 'Each active auction keeps its remaining time. Scheduled launches move by the pause duration; affected pre-bids are cancelled with funds released and buyers notified. Bidding stays paused until restoration completes.'}
          </p>
          <label htmlFor="monitor-pause-reason">Reason</label>
          <textarea
            id="monitor-pause-reason"
            className="agn-input"
            rows={3}
            maxLength={1000}
            disabled={pauseBusy}
            value={pauseReason}
            onChange={(event) => {
              setPauseReason(event.target.value);
              pauseKey.current = crypto.randomUUID();
            }}
          />
          <label htmlFor="monitor-pause-confirmation">
            Type {pauseOperation === 'pause_all' ? 'PAUSE' : 'RESUME'} to
            confirm
          </label>
          <input
            id="monitor-pause-confirmation"
            className="agn-input"
            autoComplete="off"
            value={pauseConfirmation}
            disabled={pauseBusy}
            onChange={(event) => setPauseConfirmation(event.target.value)}
          />
          {pauseError && (
            <p role="alert" className="lv-admin-widget-error">
              {pauseError}
            </p>
          )}
          <Button
            variant={pauseOperation === 'pause_all' ? 'danger' : 'primary'}
            busy={pauseBusy}
            disabled={
              stale ||
              pauseReason.trim().length < 5 ||
              pauseConfirmation !==
                (pauseOperation === 'pause_all' ? 'PAUSE' : 'RESUME')
            }
            onClick={() => void submitPause()}
          >
            {pauseOperation === 'pause_all'
              ? 'Pause all bidding'
              : 'Resume all bidding'}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={allOpen}
        onClose={() => setAllOpen(false)}
        title="Auctions closed today"
      >
        <div className="lv-monitor-controls-list">
          {allError && <p role="alert">{allError}</p>}
          {allLoading && <p role="status">Loading closed auctions…</p>}
          {allClosed?.items.map((row) => (
            <article className="lv-staff-record" key={row.id}>
              <strong>{row.title}</strong>
              <span>
                {row.status.replaceAll('_', ' ')} · {row.reference}
              </span>
              <b>
                {row.hammerKobo === null ? '—' : formatNaira(row.hammerKobo)}
              </b>
            </article>
          ))}
          {allClosed && !allClosed.items.length && (
            <p>No lots have closed today.</p>
          )}
          <div>
            <Button
              variant="secondary"
              disabled={allLoading}
              onClick={() => void readClosed()}
            >
              First page
            </Button>
            {allClosed?.nextCursor && (
              <Button
                disabled={allLoading}
                onClick={() =>
                  void readClosed(allClosed.nextCursor ?? undefined)
                }
              >
                Next 25
              </Button>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
