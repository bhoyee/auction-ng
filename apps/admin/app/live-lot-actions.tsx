'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';
import { ApiError } from '@auction-ng/api-client/auth';
import {
  formatNaira,
  type MonitorHistory,
  type LotControlQuote,
  type MonitorLot,
  type LotControlInput,
  LOT_EXTENSION_OPTIONS,
  type LotExtensionMs,
} from '@auction-ng/shared';
import {
  MonitorActionMenu,
  type MonitorLotAction,
} from '@auction-ng/ui/admin/monitor-action-menu';
import { MonitorHistoryPanel } from '@auction-ng/ui/admin/lot-operation-panels';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Button } from '@auction-ng/ui/web/button';
type Client = ReturnType<typeof createStaffAdminClient>;
type History = MonitorHistory;
type Quote = LotControlQuote;
const stamp = (at: string) =>
  new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(at));
export function LiveLotActions({
  client,
  row,
  anchor,
  canControl,
  canOpen,
  closed,
  globalPaused,
  onClose,
  onMessage,
  onOpen,
  onUnauthorized,
  onSuccess,
}: {
  client: Client;
  row: MonitorLot;
  anchor: HTMLElement;
  canControl: boolean;
  canOpen: boolean;
  closed: boolean;
  globalPaused: boolean;
  onClose: () => void;
  onMessage: (id: string) => void;
  onOpen: (id: string) => void;
  onUnauthorized: () => void;
  onSuccess: (message: string) => void;
}) {
  const [action, setAction] = useState<MonitorLotAction | null>(null),
    [history, setHistory] = useState<History | null>(null),
    [cursor, setCursor] = useState<string | undefined>(),
    [pages, setPages] = useState<(string | undefined)[]>([]),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(''),
    [category, setCategory] =
      useState<LotControlInput['category']>('item_missing'),
    [extension, setExtension] = useState<LotExtensionMs>(
      LOT_EXTENSION_OPTIONS[0].value,
    ),
    [confirmation, setConfirmation] = useState(''),
    [second, setSecond] = useState(false);
  const key = useRef(crypto.randomUUID());
  const closeMenu = useCallback(() => {
    if (!action) onClose();
  }, [action, onClose]);
  const controls = ['pause', 'resume', 'extend', 'cancel'];
  useEffect(() => {
    if (!action || action === 'message' || action === 'open') return;
    let active = true,
      running = false;
    const read = async () => {
      if (running || document.hidden) return;
      running = true;
      setLoading(true);
      try {
        if (action === 'history') {
          const next = await client.liveBidHistory(row.id, {
            limit: 25,
            cursor,
          });
          if (active) setHistory(next);
        } else {
          const next = await client.liveLotControlQuote(row.id);
          if (active) setQuote(next);
        }
        if (active) setError('');
      } catch (cause) {
        if (active) {
          if (cause instanceof ApiError && cause.status === 401)
            onUnauthorized();
          if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
            setHistory(null);
            setQuote(null);
          }
          setError(
            'This item could not be refreshed. Check your connection and permissions.',
          );
        }
      } finally {
        running = false;
        if (active) setLoading(false);
      }
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [action, client, row.id, cursor, onUnauthorized]);
  const expired = quote && !['open', 'closing'].includes(quote.status);
  const changed = quote && quote.revision !== row.streamId;
  const finalMinutes =
    quote &&
    quote.remainingMs <= 120000 &&
    ['pause', 'cancel'].includes(action ?? '');
  const frozen = useRef<LotControlInput | null>(null);
  const valid =
    reason.trim().length >= 5 &&
    !globalPaused &&
    !error &&
    !closed &&
    !expired &&
    !changed &&
    quote;
  const label =
    action === 'extend'
      ? 'Extend bid time'
      : action === 'pause'
        ? 'Pause lot'
        : action === 'resume'
          ? 'Resume lot'
          : action === 'cancel'
            ? 'Cancel lot'
            : 'Bid history';
  const submit = async () => {
    if (!quote || !action || !controls.includes(action) || busy) return;
    if (finalMinutes && !second) {
      setSecond(true);
      return;
    }
    const input: LotControlInput = frozen.current ?? {
      lotId: row.id,
      idempotencyKey: key.current,
      operation: action as LotControlInput['operation'],
      expectedRevision: row.streamId,
      reason,
      ...(action === 'extend' ? { extensionMs: extension } : {}),
      ...(action === 'cancel' ? { category } : {}),
      ...(confirmation ? { confirmation } : {}),
    };
    frozen.current = input;
    setBusy(true);
    setError('');
    try {
      const result = await client.controlLiveLot(input);
      onSuccess(result.message);
      window.dispatchEvent(new Event('lotvanta:live-refresh'));
      onClose();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      setError(
        cause instanceof ApiError && cause.status === 409
          ? 'The item changed or another checkout/control is active. Close this dialog and review the updated item before trying again.'
          : 'This action was not confirmed. Retry the same request; do not create another request while its result is uncertain.',
      );
    } finally {
      setBusy(false);
    }
  };
  const select = (next: MonitorLotAction) => {
    if (next === 'message') {
      onMessage(row.id);
      onClose();
      return;
    }
    if (next === 'open') {
      onOpen(row.id);
      onClose();
      return;
    }
    setAction(next);
  };
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <>
      {!action &&
        createPortal(
          <MonitorActionMenu
            row={row}
            anchor={anchor}
            canControl={canControl}
            canOpen={canOpen}
            closed={closed}
            onClose={closeMenu}
            onSelect={select}
          />,
          document.body,
        )}
      <Dialog
        open={!!action}
        onClose={close}
        title={label}
        className={
          'lv-lot-action-dialog' +
          (action === 'history' ? ' lv-lot-history-dialog' : '')
        }
        presentation={action === 'history' ? 'drawer' : 'dialog'}
      >
        <div
          className={
            action === 'history'
              ? 'lv-lot-history-shell'
              : 'lv-monitor-controls-list'
          }
        >
          {action !== 'history' && (
            <div>
              <p className="lv-lot-action-reference">{row.reference}</p>
              <p className="lv-lot-action-item">{row.title}</p>
            </div>
          )}
          {error && (
            <p
              className="lv-admin-widget-error lv-lot-dialog-state"
              role="alert"
            >
              {error}
            </p>
          )}
          {loading && !history && !quote && (
            <p role="status">Loading current item…</p>
          )}
          {action === 'history' && history && (
            <MonitorHistoryPanel
              row={row}
              history={history}
              buyerUrl={
                process.env.NEXT_PUBLIC_BUYER_URL || 'http://localhost:3300'
              }
              page={pages.length + 1}
              previous={!!pages.length}
              busy={loading}
              onPrevious={() => {
                setCursor(pages.at(-1));
                setPages((p) => p.slice(0, -1));
              }}
              onNext={() => {
                setPages((p) => [...p, cursor]);
                setCursor(history.nextCursor ?? undefined);
              }}
            />
          )}
          {action && controls.includes(action) && quote && (
            <>
              {globalPaused && (
                <p className="lv-monitor-action-summary" role="status">
                  Marketplace bidding is paused. Resume all bidding before
                  applying an individual lot control.
                </p>
              )}
              <div className="lv-monitor-action-summary">
                {action === 'cancel' ? (
                  <p>
                    Cancel <strong>{quote.reference}</strong>? Its{' '}
                    <strong>{quote.bidCount} recorded bids</strong> will remain
                    as void auction history.{' '}
                    <strong>{formatNaira(quote.heldKobo)}</strong> in active
                    holds will be released to{' '}
                    <strong>{quote.buyerCount} buyers</strong>. No winner or
                    cancellation fee. This cannot be undone.
                  </p>
                ) : action === 'pause' ? (
                  <p>
                    This stops this item’s countdown, new bids and new
                    purchases. Remaining time and wallet reservations stay
                    protected.
                  </p>
                ) : action === 'resume' ? (
                  <p>
                    This item will resume with the time remaining when it was
                    paused. Buyers will be notified.
                  </p>
                ) : (
                  <p>
                    Move this item’s end time later. Bidders and watchers will
                    receive the new closing time.
                  </p>
                )}
                <small>
                  Current deadline: {stamp(quote.endsAt)} WAT. Effects are
                  rechecked by the server at confirmation.
                </small>
              </div>
              {expired && (
                <p role="alert">
                  This item has closed. Only viewing actions are available.
                </p>
              )}
              {changed && (
                <p role="alert">
                  Bidding changed while this dialog was open. Close it and
                  review the item again.
                </p>
              )}
              {action === 'extend' && (
                <fieldset disabled={busy || !!frozen.current}>
                  <legend>Extend by</legend>
                  <div className="lv-monitor-control-options">
                    {LOT_EXTENSION_OPTIONS.map((o) => (
                      <label key={o.value}>
                        <input
                          type="radio"
                          name="extension"
                          checked={extension === o.value}
                          onChange={() => setExtension(o.value)}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {action === 'cancel' && (
                <>
                  <label htmlFor="lot-cancel-category">
                    Cancellation reason
                  </label>
                  <select
                    id="lot-cancel-category"
                    className="agn-input"
                    value={category}
                    disabled={busy || !!frozen.current}
                    onChange={(e) =>
                      setCategory(e.target.value as LotControlInput['category'])
                    }
                  >
                    <option value="item_missing">Item missing</option>
                    <option value="item_damaged">Item damaged</option>
                    <option value="listing_error">Listing error</option>
                    <option value="fraud">Fraud</option>
                    <option value="other">Other</option>
                  </select>
                </>
              )}
              <label htmlFor="lot-control-reason">
                {action === 'cancel' ? 'Additional note' : 'Reason'}
              </label>
              <textarea
                id="lot-control-reason"
                className="agn-input"
                rows={4}
                maxLength={1000}
                value={reason}
                disabled={busy || !!frozen.current}
                onChange={(e) => setReason(e.target.value)}
              />
              {finalMinutes && second && (
                <>
                  <p role="alert" className="lv-monitor-action-summary">
                    This auction is in its final two minutes. Confirm again to
                    interrupt active bidding.
                  </p>
                  <label htmlFor="lot-control-confirm">
                    Type {action.toUpperCase()} to confirm
                  </label>
                  <input
                    id="lot-control-confirm"
                    className="agn-input"
                    value={confirmation}
                    disabled={busy || !!frozen.current}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </>
              )}
              <Button
                variant={action === 'cancel' ? 'danger' : 'primary'}
                busy={busy}
                disabled={
                  !valid ||
                  (!!finalMinutes &&
                    second &&
                    confirmation !== action.toUpperCase())
                }
                onClick={() => void submit()}
              >
                {finalMinutes && !second
                  ? 'Review final confirmation'
                  : frozen.current
                    ? 'Retry same request'
                    : label}
              </Button>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
