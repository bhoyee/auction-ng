'use client';
import { useState } from 'react';
import type { BatchRow } from '@auction-ng/shared';
import type { BatchesClient } from '@auction-ng/api-client/batches';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Input } from '@auction-ng/ui/web/input';
import { confirmationMatches } from '@auction-ng/ui/admin/confirm-dialog';
import {
  fieldErrors,
  items,
  LoadState,
  Pager,
  useBatchLoad,
  useCursor,
} from './batch-ui';

/** One change with its retry key: a retry never applies it twice. */
function useChange(onDone: (message: string) => void) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return {
    busy,
    errors,
    run: async (work: (key: string) => Promise<{ message: string }>) => {
      setBusy(true);
      setErrors({});
      try {
        onDone((await work(key)).message);
      } catch (failure) {
        const next = fieldErrors(failure);
        // A refused change is over; only an unconfirmed one keeps its key.
        if (!next.form?.includes('couldn’t be confirmed'))
          setKey(crypto.randomUUID());
        setErrors(next);
        setBusy(false);
      }
    },
  };
}

export function ReceiveDialog({
  batch: live,
  client,
  onClose,
  onDone,
}: {
  batch: BatchRow;
  client: BatchesClient;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  // A refresh behind the dialog never changes what is being confirmed.
  const [batch] = useState(live);
  const [count, setCount] = useState(
    String(batch.itemsReceived ?? batch.itemsExpected),
  );
  const change = useChange(onDone);
  const arriving = batch.status === 'arriving';
  return (
    <Dialog
      open
      title={
        arriving ? `Mark ${batch.code} received` : `Items in ${batch.code}`
      }
      onClose={change.busy ? () => undefined : onClose}
    >
      <form
        className="lv-setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          void change.run((idempotencyKey) =>
            client.receive({
              id: batch.id,
              expectedUpdatedAt: batch.updatedAt,
              idempotencyKey,
              itemsReceived: Number(count),
            }),
          );
        }}
      >
        <Input
          label="How many items arrived?"
          inputMode="numeric"
          value={count}
          maxLength={6}
          autoFocus
          hint={`You expected about ${items(batch.itemsExpected)}. Count them before saving.`}
          error={change.errors.itemsReceived ?? change.errors.form}
          onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))}
        />
        <div className="lv-setup-actions lv-setup-actions--end">
          <Button variant="secondary" onClick={onClose} disabled={change.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={change.busy} disabled={!Number(count)}>
            {arriving ? 'Mark received' : 'Save item count'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ReasonDialog({
  batch: live,
  action,
  client,
  onClose,
  onDone,
}: {
  batch: BatchRow;
  action: 'close' | 'reopen';
  client: BatchesClient;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  // A refresh behind the dialog never changes what is being confirmed.
  const [batch] = useState(live);
  const [reason, setReason] = useState('');
  const change = useChange(onDone);
  const label = action === 'close' ? 'Close batch' : 'Reopen batch';
  return (
    <Dialog
      open
      title={`${action === 'close' ? 'Close' : 'Reopen'} ${batch.code}?`}
      onClose={change.busy ? () => undefined : onClose}
    >
      <form
        className="lv-setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          void change.run((idempotencyKey) =>
            client[action]({
              id: batch.id,
              expectedUpdatedAt: batch.updatedAt,
              idempotencyKey,
              reason,
            }),
          );
        }}
      >
        <p>
          {action === 'close'
            ? 'No more lots can join this batch and unit costs stop changing. Lots already selling keep selling, and their money still counts.'
            : 'Lots can join this batch again and unit costs are shared again. It won’t close by itself after this.'}
        </p>
        <Input
          label="Reason"
          value={reason}
          maxLength={200}
          autoFocus
          error={change.errors.reason ?? change.errors.form}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="lv-setup-actions lv-setup-actions--end">
          <Button variant="secondary" onClick={onClose} disabled={change.busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            busy={change.busy}
            disabled={reason.trim().length < 3}
          >
            {label}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Items unsold after two relists: choose which to write off. */
export function StuckDialog({
  batch,
  client,
  canManage,
  onClose,
}: {
  batch: BatchRow;
  client: BatchesClient;
  canManage: boolean;
  onClose: () => void;
}) {
  const pager = useCursor();
  const read = useBatchLoad(
    () => client.stuck(batch.id, pager.cursor),
    [client, batch.id, pager.cursor],
  );
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [skipped, setSkipped] = useState<
    { id: string; lotNumber: string; reason: string }[]
  >([]);
  const change = useChange(() => {
    setChosen(new Set());
    setReason('');
    setTyped('');
    read.reload();
  });
  const rows = read.data?.items ?? [];
  return (
    <Dialog
      open
      title={`Unsold after 2 relists in ${batch.code}`}
      onClose={change.busy ? () => undefined : onClose}
    >
      <form
        className="lv-setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          void change.run(async (idempotencyKey) => {
            const result = await client.writeOff(batch.id, {
              lotIds: [...chosen],
              reason,
              idempotencyKey,
            });
            setSkipped(result.skipped);
            return { message: '' };
          });
        }}
      >
        {!read.data ? (
          <LoadState error={read.error} onRetry={read.reload} rows />
        ) : !rows.length ? (
          <p>Nothing is waiting here.</p>
        ) : (
          <ul className="lv-batch-pick">
            {rows.map((r) => (
              <li key={r.id}>
                <label>
                  {canManage && (
                    <input
                      type="checkbox"
                      checked={chosen.has(r.id)}
                      onChange={(e) =>
                        setChosen((old) => {
                          const next = new Set(old);
                          if (e.target.checked) next.add(r.id);
                          else next.delete(r.id);
                          return next;
                        })
                      }
                    />
                  )}
                  <span>
                    {r.title}
                    <small>
                      {r.lotNumber} · relisted {r.relists} times
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <Pager
          label="Unsold item pages"
          page={pager.page}
          next={!!read.data?.nextCursor}
          onPrevious={() => {
            setChosen(new Set());
            pager.previous();
          }}
          onNext={() => {
            setChosen(new Set());
            pager.next(read.data?.nextCursor);
          }}
        />
        {skipped.length > 0 && (
          <ul className="lv-setup-alert" role="alert">
            {skipped.map((s) => (
              <li key={s.id}>
                {s.lotNumber}: {s.reason}
              </li>
            ))}
          </ul>
        )}
        {chosen.size > 0 && (
          <>
            <p>
              Writing off {items(chosen.size)} takes them out of the Lots list
              for good. Their cost still counts against {batch.code}.
            </p>
            <Input
              label="Reason"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
            />
            <Input
              label="Type WRITE OFF to confirm"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </>
        )}
        {change.errors.form && (
          <p className="lv-setup-error" role="alert">
            {change.errors.form}
          </p>
        )}
        <div className="lv-setup-actions lv-setup-actions--end">
          <Button variant="secondary" onClick={onClose} disabled={change.busy}>
            Close
          </Button>
          {canManage && (
            <Button
              type="submit"
              variant="danger"
              busy={change.busy}
              disabled={
                !chosen.size ||
                reason.trim().length < 3 ||
                !confirmationMatches(typed, 'WRITE OFF')
              }
            >
              Write off {chosen.size ? items(chosen.size) : ''}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
