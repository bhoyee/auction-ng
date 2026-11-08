'use client';
import { useEffect, useRef, useState } from 'react';
import type { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';
import { ApiError } from '@auction-ng/api-client/auth';
import {
  formatNaira,
  LOT_EXTENSION_OPTIONS,
  type LotExtensionMs,
  type LotControlQuote,
  type LotControlInput,
  type MonitorLot,
} from '@auction-ng/shared';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Button } from '@auction-ng/ui/web/button';
import type { BulkAction } from '@auction-ng/ui/admin/monitor-bulk-actions';
import { runBulkJobs, type BulkJob } from './live-bulk-runner';
type Client = ReturnType<typeof createStaffAdminClient>;
export type BulkSession = { current: BulkJob[] | null };
type Review = { row: MonitorLot; quote: LotControlQuote | null; issue: string };
const titles = {
  message: 'Message bidders',
  extend: 'Extend bid time',
  pause: 'Pause lots',
  cancel: 'Cancel lots',
};
export function LiveBulkDialog({
  client,
  rows,
  action,
  open,
  globalPaused,
  onClose,
  onUnauthorized,
  session,
}: {
  client: Client;
  rows: MonitorLot[];
  action: BulkAction;
  open: boolean;
  globalPaused: boolean;
  onClose: (unresolved: boolean) => void;
  onUnauthorized: () => void;
  session: BulkSession;
}) {
  const [review, setReview] = useState<Review[]>([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [reason, setReason] = useState(''),
    [message, setMessage] = useState(''),
    [extension, setExtension] = useState<LotExtensionMs>(
      LOT_EXTENSION_OPTIONS[0].value,
    ),
    [category, setCategory] =
      useState<LotControlInput['category']>('item_missing');
  const [final, setFinal] = useState(false),
    [confirmation, setConfirmation] = useState(''),
    [jobs, setJobs] = useState<BulkJob[]>(session.current ?? []);
  const frozen = session;
  const running = useRef(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    if (action === 'message') {
      setReview(rows.map((row) => ({ row, quote: null, issue: '' })));
      return;
    }
    setLoading(true);
    setError('');
    void (async () => {
      const next: Review[] = [];
      for (const row of rows) {
        if (!active) return;
        try {
          const quote = await client.liveLotControlQuote(row.id);
          const issue = !['open', 'closing'].includes(quote.status)
            ? 'Closed; this lot will be skipped.'
            : action === 'pause' && quote.paused
              ? 'Already paused; this lot will be skipped.'
              : !quote.paused && quote.remainingMs <= 0
                ? 'Closing; this lot will be skipped.'
                : '';
          next.push({ row, quote, issue });
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) {
            onUnauthorized();
            return;
          }
          next.push({
            row,
            quote: null,
            issue: 'Could not verify this lot; it will be skipped.',
          });
        }
      }
      if (active) {
        setReview(next);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [action, client, rows, refresh, onUnauthorized]);
  const eligible = review.filter((item) => !item.issue);
  const locked = jobs.length > 0;
  const unresolved = jobs.some((job) =>
    ['ready', 'running', 'pending', 'uncertain'].includes(job.state),
  );
  const needsFinal = action === 'pause' || action === 'cancel';
  const valid =
    reason.trim().length >= 5 &&
    (action !== 'message' || message.trim().length >= 5) &&
    eligible.length > 0 &&
    !loading &&
    (action === 'message' || !globalPaused);
  async function submit() {
    if (running.current || (!locked && !valid)) return;
    if (!locked && needsFinal && !final) {
      setFinal(true);
      return;
    }
    if (!locked && needsFinal && confirmation !== action.toUpperCase()) return;
    if (!frozen.current)
      frozen.current = eligible.map(({ row, quote }) => ({
        reference: row.reference,
        state: 'ready',
        message: 'Ready',
        payload:
          action === 'message'
            ? {
                operation: 'message',
                lotId: row.id,
                idempotencyKey: crypto.randomUUID(),
                reason: reason.trim(),
                message: message.trim(),
              }
            : {
                operation: action,
                lotId: row.id,
                idempotencyKey: crypto.randomUUID(),
                expectedRevision: quote?.revision ?? row.streamId,
                reason: reason.trim(),
                ...(action === 'extend' ? { extensionMs: extension } : {}),
                ...(action === 'cancel' ? { category } : {}),
                ...(needsFinal ? { confirmation: action.toUpperCase() } : {}),
              },
      }));
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const results = await runBulkJobs(
        frozen.current,
        async (payload) => {
          if (payload.operation === 'message') {
            const result = await client.messageLiveBidders(payload);
            return { status: 'completed', message: result.message };
          }
          return client.controlLiveLot(payload);
        },
        (next) => {
          frozen.current = next;
          setJobs(next);
        },
        onUnauthorized,
      );
      frozen.current = results;
      setJobs(results);
      window.dispatchEvent(new Event('lotvanta:live-refresh'));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const checkPending = useRef<() => void>(() => {});
  checkPending.current = () => {
    void submit();
  };
  const hasPending = jobs.some((job) => job.state === 'pending');
  useEffect(() => {
    if (!open || !hasPending) return;
    const timer = setInterval(() => {
      if (!document.hidden && navigator.onLine) checkPending.current();
    }, 10000);
    return () => clearInterval(timer);
  }, [open, hasPending]);
  const done = jobs.filter((job) => job.state === 'completed').length;
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose(unresolved);
      }}
      title={titles[action]}
      className="lv-lot-action-dialog lv-monitor-bulk-dialog"
    >
      <div className="lv-monitor-controls-list">
        <p className="lv-monitor-bulk-intro">
          {rows.length} selected lots. Each lot is checked and processed
          separately; a changed or closed lot will not stop the others.
        </p>
        {loading && <p role="status">Checking selected lots…</p>}
        {error && <p role="alert">{error}</p>}
        {action !== 'message' && globalPaused && (
          <p role="alert" className="lv-monitor-action-summary">
            Marketplace bidding is paused. Resume all bidding before applying
            lot controls.
          </p>
        )}
        {action === 'message' && (
          <p className="lv-monitor-action-summary">
            For listing corrections only, never marketing. Bidders and watchers
            of each lot receive in-app, email and enabled phone alerts. Someone
            following multiple selected lots may receive a notice for each lot.
          </p>
        )}
        {action === 'pause' && (
          <p className="lv-monitor-action-summary">
            Freeze each eligible lot’s countdown and block new bids and
            purchases. Wallet reservations remain protected. Buyers are
            notified.
          </p>
        )}
        {action === 'extend' && (
          <p className="lv-monitor-action-summary">
            Extend each eligible lot’s deadline by the chosen duration. Buyers
            are notified of their lot’s new closing time.
          </p>
        )}
        {action === 'cancel' && (
          <p className="lv-monitor-action-summary">
            Cancel each eligible lot with no winner. Release its active bid
            holds to buyers’ wallets, preserve bids as void auction history and
            notify buyers. No cancellation fee. This cannot be undone. The holds
            below are rechecked by the server.
          </p>
        )}
        <div
          className="lv-monitor-bulk-review"
          role="region"
          aria-label="Selected lot review"
          tabIndex={0}
        >
          {review.map(({ row, quote, issue }) => {
            const job = jobs.find((job) => job.payload.lotId === row.id);
            return (
              <article key={row.id}>
                <div>
                  <strong>{row.title}</strong>
                  <small>{row.reference}</small>
                  {quote && (
                    <small>
                      Deadline:{' '}
                      {new Intl.DateTimeFormat('en-NG', {
                        timeZone: 'Africa/Lagos',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(quote.endsAt))}{' '}
                      WAT
                    </small>
                  )}
                  {action === 'cancel' && quote && (
                    <small>
                      {quote.bidCount} bids · {formatNaira(quote.heldKobo)} held
                      · {quote.buyerCount} buyers
                    </small>
                  )}
                </div>
                <span
                  className={
                    'lv-monitor-bulk-result is-' +
                    (job?.state ?? (issue ? 'rejected' : 'ready'))
                  }
                >
                  {job
                    ? {
                        ready: 'Ready',
                        running: 'Submitting',
                        completed:
                          action === 'message' ? 'Message queued' : 'Completed',
                        pending: 'Processing',
                        uncertain: 'Check result',
                        rejected: 'Not applied',
                      }[job.state]
                    : issue
                      ? 'Skipped'
                      : 'Ready'}
                </span>
                {(job?.message || issue) && <p>{job?.message || issue}</p>}
              </article>
            );
          })}
        </div>
        {!locked && (
          <>
            {!loading && action !== 'message' && (
              <Button
                variant="secondary"
                onClick={() => {
                  setFinal(false);
                  setConfirmation('');
                  setRefresh((value) => value + 1);
                }}
              >
                Refresh lot review
              </Button>
            )}
            <fieldset
              disabled={busy || final}
              className="lv-monitor-bulk-fields"
            >
              {action === 'extend' && (
                <>
                  <legend>Extend by</legend>
                  <div className="lv-monitor-control-options">
                    {LOT_EXTENSION_OPTIONS.map((option) => (
                      <label key={option.value}>
                        <input
                          type="radio"
                          name="bulk-extension"
                          checked={extension === option.value}
                          onChange={() => setExtension(option.value)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
              {action === 'cancel' && (
                <label>
                  Cancellation reason
                  <select
                    className="agn-input"
                    value={category}
                    onChange={(event) =>
                      setCategory(
                        event.target.value as LotControlInput['category'],
                      )
                    }
                  >
                    <option value="item_missing">Item missing</option>
                    <option value="item_damaged">Item damaged</option>
                    <option value="listing_error">Listing error</option>
                    <option value="fraud">Fraud</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              )}
              <label>
                Reason for the audit log
                <textarea
                  className="agn-input"
                  value={reason}
                  maxLength={1000}
                  rows={3}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              {action === 'message' && (
                <label>
                  Correction for bidders and watchers
                  <textarea
                    className="agn-input"
                    value={message}
                    maxLength={2000}
                    rows={4}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </label>
              )}
            </fieldset>
            {final && (
              <div className="lv-monitor-action-summary">
                <strong>Final confirmation</strong>
                <p>
                  This also applies to lots in their final two minutes. Check
                  every selected lot before continuing.
                </p>
                <label>
                  Type {action.toUpperCase()} to confirm
                  <input
                    className="agn-input"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="off"
                  />
                </label>
              </div>
            )}
          </>
        )}
        {locked && (
          <p role="status" className="lv-monitor-action-summary">
            {done} of {jobs.length} requests confirmed.
            {unresolved
              ? ' Pending or unconfirmed requests keep their original reference; retry checks them safely.'
              : ' All selected requests have a result.'}
          </p>
        )}
        {(!locked || unresolved) && (
          <Button
            variant={action === 'cancel' ? 'danger' : 'primary'}
            busy={busy}
            disabled={
              busy ||
              (!locked &&
                (!valid || (final && confirmation !== action.toUpperCase())))
            }
            onClick={() => void submit()}
          >
            {locked
              ? 'Check / retry pending requests'
              : needsFinal && !final
                ? 'Review final confirmation'
                : `${titles[action]} · ${eligible.length} lots`}
          </Button>
        )}
        {locked && !busy && (
          <Button variant="secondary" onClick={() => onClose(unresolved)}>
            {unresolved ? 'Close and keep results' : 'Done'}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
