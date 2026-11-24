'use client';
import { useEffect, useRef, useState } from 'react';
import {
  UNSOLD_BULK_MAX,
  UNSOLD_RESTORE_DAYS,
  type UnsoldBulkResult,
  type UnsoldLot,
} from '@auction-ng/shared';
import type { createRelistClient } from '@auction-ng/api-client/relist';
import { ApiError } from '@auction-ng/api-client/auth';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Input } from '@auction-ng/ui/web/input';
import {
  CircleAlert,
  ChevronDown,
  RotateCcw,
  Trash2,
} from '@auction-ng/ui/web/icons';
import { confirmationMatches } from '@auction-ng/ui/admin/confirm-dialog';
import {
  hoursText,
  newSchedule,
  ScheduleFields,
  scheduleReady,
  scheduleStart,
  scheduleText,
} from './unsold-schedule';

export type BulkAction = 'relist' | 'delete';
export type BulkOutcome = UnsoldBulkResult & {
  action: BulkAction;
  /** Items whose answer never arrived (lost connection). */
  unconfirmed: number;
};
type Client = ReturnType<typeof createRelistClient>;

export const itemsText = (count: number) =>
  `${count.toLocaleString('en-NG')} ${count === 1 ? 'item' : 'items'}`;

/** Select-all box, what is selected and the Actions menu. */
export function SelectionBar({
  selected,
  onPage,
  pageCount,
  total,
  selectableTotal,
  busy,
  online,
  onTogglePage,
  onSelectAll,
  onClear,
  onAction,
}: {
  selected: number;
  /** How many of this page's items are ticked. */
  onPage: number;
  pageCount: number;
  total: number;
  selectableTotal: number;
  busy: boolean;
  online: boolean;
  onTogglePage: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onAction: (action: BulkAction) => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const all = pageCount > 0 && onPage === pageCount;
  useEffect(() => {
    if (box.current) box.current.indeterminate = onPage > 0 && !all;
  });
  // Close the menu on an outside click.
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        menu.current?.open &&
        event.target instanceof Node &&
        !menu.current.contains(event.target)
      )
        menu.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const choose = (action: BulkAction) => {
    if (menu.current) menu.current.open = false;
    onAction(action);
  };
  return (
    <div className="lv-unsold-select">
      <label className="lv-unsold-check">
        <input
          ref={box}
          type="checkbox"
          checked={all}
          disabled={busy || !pageCount}
          onChange={onTogglePage}
        />
        Select all on this page
      </label>
      {selected > 0 && (
        <div
          className="lv-unsold-bulk"
          role="region"
          aria-label="Selected items"
        >
          <strong aria-live="polite">
            {selected.toLocaleString('en-NG')} selected
          </strong>
          {all && selected < selectableTotal && (
            <Button
              variant="ghost"
              size="small"
              disabled={busy || !online}
              onClick={onSelectAll}
            >
              {selectableTotal < total
                ? `Select the newest ${selectableTotal}`
                : `Select all ${total.toLocaleString('en-NG')} waiting items`}
            </Button>
          )}
          <Button
            variant="ghost"
            size="small"
            disabled={busy}
            onClick={onClear}
          >
            Clear
          </Button>
          {busy || !online ? (
            <Button size="small" disabled>
              {busy ? 'Selecting…' : 'Actions'}
            </Button>
          ) : (
            <details
              ref={menu}
              className="lv-unsold-menu"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.currentTarget.open = false;
                event.currentTarget.querySelector('summary')?.focus();
              }}
            >
              <summary className="agn-button agn-button--primary agn-button--small">
                Actions <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div>
                <button type="button" onClick={() => choose('relist')}>
                  <RotateCcw size={16} aria-hidden="true" /> Relist
                </button>
                <button
                  type="button"
                  data-danger=""
                  onClick={() => choose('delete')}
                >
                  <Trash2 size={16} aria-hidden="true" /> Delete
                </button>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

type Batch = { key: string; lots: UnsoldLot[]; result?: UnsoldBulkResult };
const batches = (lots: UnsoldLot[]): Batch[] =>
  Array.from({ length: Math.ceil(lots.length / UNSOLD_BULK_MAX) }, (_, i) => ({
    key: crypto.randomUUID(),
    lots: lots.slice(i * UNSOLD_BULK_MAX, (i + 1) * UNSOLD_BULK_MAX),
  }));

/** Relist or delete the selected items, after a typed confirmation. */
export function BulkDialog({
  action,
  lots,
  client,
  defaultHours,
  online,
  onClose,
  onDone,
}: {
  action: BulkAction;
  lots: UnsoldLot[];
  client: Client;
  defaultHours: number;
  online: boolean;
  onClose: () => void;
  onDone: (outcome: BulkOutcome) => void;
}) {
  const word = action === 'relist' ? 'RELIST' : 'DELETE';
  const [schedule, setSchedule] = useState(() => newSchedule(defaultHours));
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [startError, setStartError] = useState('');
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(0);
  // Batches keep their keys and results, so trying again after a lost
  // connection continues where it stopped and can't relist twice. Once the
  // first batch is sent the terms are fixed.
  const work = useRef<Batch[]>(undefined);
  const [locked, setLocked] = useState(false);
  const ready =
    online &&
    !running &&
    confirmationMatches(typed, word) &&
    (action === 'delete' || scheduleReady(schedule));
  const outcome = (): BulkOutcome => {
    const results = (work.current ?? []).flatMap((b) => b.result ?? []);
    return {
      action,
      done: results.reduce((sum, r) => sum + r.done, 0),
      skipped: results.flatMap((r) => r.skipped),
      unconfirmed: (work.current ?? [])
        .filter((b) => !b.result)
        .reduce((sum, b) => sum + b.lots.length, 0),
    };
  };

  async function submit() {
    if (!ready) return;
    setRunning(true);
    setError('');
    setStartError('');
    work.current ??= batches(lots);
    setLocked(true);
    try {
      for (const batch of work.current) {
        if (batch.result) continue;
        batch.result =
          action === 'delete'
            ? await client.dismiss(batch.lots.map((lot) => lot.id))
            : await client.relistMany({
                items: batch.lots.map((lot) => ({
                  id: lot.id,
                  expectedUpdatedAt: lot.updatedAt,
                })),
                startsAt: scheduleStart(schedule),
                runHours: schedule.hours,
                idempotencyKey: batch.key,
              });
        setFinished((count) => count + batch.lots.length);
      }
      onDone(outcome());
      return;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401)
        window.dispatchEvent(new Event('giddydeal:staff-unauthorized'));
      if (
        cause instanceof ApiError &&
        cause.code === 'FIELD_ERROR' &&
        cause.field === 'startsAt'
      ) {
        setStartError(cause.detail ?? 'Choose a start time in the future.');
        // Nothing in this batch was relisted. The terms open up again unless
        // an earlier batch already used them.
        if (!work.current.some((batch) => batch.result)) {
          work.current = undefined;
          setLocked(false);
        } else
          setError(
            'The start time has passed. Close this and relist the remaining items with a new time.',
          );
      } else if (cause instanceof ApiError && cause.status === 403)
        setError(`Your role can’t ${action} items. Ask an admin.`);
      else
        setError(
          `Not every item could be confirmed. Check your connection and try again; ${action === 'relist' ? 'nothing will be relisted twice' : 'it continues where it stopped'}.`,
        );
    }
    setRunning(false);
  }

  const close = () => {
    if (running) return;
    // Something may already have gone through: reload the list on close.
    if (locked) onDone(outcome());
    else onClose();
  };
  return (
    <Dialog
      open
      onClose={close}
      title={
        action === 'relist'
          ? `Relist ${itemsText(lots.length)}`
          : `Delete ${itemsText(lots.length)} from Unsold review?`
      }
    >
      <form
        className="lv-relist-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {action === 'relist' ? (
          <>
            <p className="lv-bulk-notice">
              <strong>
                {lots.length === 1
                  ? 'This item keeps its current prices.'
                  : `All ${itemsText(lots.length)} keep their current prices.`}
              </strong>
              Starting and buy-now prices don’t change. To change a price, use
              Relist on that item.
            </p>
            <fieldset className="lv-bulk-terms" disabled={locked}>
              <ScheduleFields
                value={schedule}
                defaultHours={defaultHours}
                error={startError}
                onChange={setSchedule}
              />
            </fieldset>
            {scheduleReady(schedule) && (
              <p className="lv-relist-summary" aria-live="polite">
                {scheduleText(schedule)} for {hoursText(schedule.hours)}.
                {lots.length > 1 ? ' All items end around the same time.' : ''}
              </p>
            )}
          </>
        ) : (
          <div className="lv-bulk-notice" data-danger="">
            <CircleAlert size={20} aria-hidden="true" />
            <p>
              <strong>This only removes them from Unsold review.</strong>
              The items stay in Lots. You can restore them from the Deleted tab
              for {UNSOLD_RESTORE_DAYS} days; after that the removal is
              permanent.
            </p>
          </div>
        )}
        <Input
          label={`Type ${word} to confirm`}
          value={typed}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={running}
          onChange={(event) => setTyped(event.target.value)}
        />
        {running && lots.length > UNSOLD_BULK_MAX && (
          <p className="lv-unsold-note" role="status">
            {action === 'relist' ? 'Relisting' : 'Deleting'}: {finished} of{' '}
            {lots.length} done
          </p>
        )}
        {!online && (
          <p className="lv-unsold-note" role="status">
            You’re offline. Reconnect to continue.
          </p>
        )}
        {error && (
          <p className="lv-relist-error" role="alert">
            {error}
          </p>
        )}
        <div className="lv-relist-actions">
          <Button variant="secondary" onClick={close} disabled={running}>
            {locked ? 'Close' : 'Cancel'}
          </Button>
          <Button
            type="submit"
            variant={action === 'delete' ? 'danger' : 'primary'}
            busy={running}
            disabled={!ready}
          >
            {action === 'relist' ? 'Relist' : 'Delete'} {itemsText(lots.length)}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** What a bulk action did, and why any item was skipped. */
export function BulkResult({ outcome }: { outcome: BulkOutcome }) {
  const { action, done, skipped, unconfirmed } = outcome;
  const verb = action === 'relist' ? 'relisted' : 'deleted from Unsold review';
  return (
    <div
      className="lv-unsold-toast"
      data-partial={skipped.length || unconfirmed ? '' : undefined}
      role="status"
    >
      {itemsText(done)} {verb}.
      {unconfirmed > 0 &&
        ` ${itemsText(unconfirmed)} not confirmed: check the list below.`}
      {skipped.length > 0 && (
        <>
          {' '}
          {skipped.length} skipped:
          <ul>
            {skipped.slice(0, 10).map((item) => (
              <li key={item.id}>
                {item.lotNumber}: {item.reason}
              </li>
            ))}
            {skipped.length > 10 && <li>and {skipped.length - 10} more</li>}
          </ul>
        </>
      )}
    </div>
  );
}
