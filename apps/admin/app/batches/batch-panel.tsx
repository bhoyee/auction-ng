'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  batchFileTypes,
  paidFromLabels,
  type BatchDetail,
} from '@auction-ng/shared';
import type { BatchesClient } from '@auction-ng/api-client/batches';
import type { createLotsClient } from '@auction-ng/api-client/lots';
import { Button } from '@auction-ng/ui/web/button';
import { Pencil, Trash2 } from '@auction-ng/ui/web/icons';
import { useConfirm } from '@auction-ng/ui/admin/confirm-dialog';
import { openStaffPage } from './batches-area';
import {
  ReasonDialog,
  ReceiveDialog,
  StuckDialog,
  BatchDeletionDialog,
} from './batch-dialogs';
import { FilePicker, uploadFiles } from './batch-files';
import {
  BatchStatusPill,
  fieldErrors,
  items,
  LoadState,
  longDay,
  Pager,
  shortDay,
  shortNaira,
  useBatchLoad,
  useCursor,
} from './batch-ui';

const RecoveryChart = dynamic(
  () =>
    import('@auction-ng/ui/admin/recovery-chart').then((m) => m.RecoveryChart),
  { ssr: false },
);
type Tab = 'lots' | 'files' | 'activity';
const time = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** The selected batch: recovery chart, what's left, lots, files, activity. */
export function BatchPanel({
  id,
  client,
  lots,
  online,
  go,
  onChanged,
  onDeletionChanged,
  reveal = false,
  revealRequest = 0,
}: {
  id: string;
  client: BatchesClient;
  lots?: ReturnType<typeof createLotsClient>;
  online: boolean;
  go: (path: string, top?: boolean) => void;
  onChanged: () => void;
  onDeletionChanged?: (action: 'delete' | 'restore', message: string) => void;
  reveal?: boolean;
  revealRequest?: number;
}) {
  const read = useBatchLoad(() => client.detail(id), [client, id]);
  const [dialog, setDialog] = useState<
    'receive' | 'close' | 'reopen' | 'stuck' | 'delete' | 'restore'
  >();
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState<Tab>('lots');
  const data = read.data;
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const loadedId = data?.batch.id;
  const loadState = data ? 'ready' : read.error ? 'error' : 'loading';
  useEffect(() => {
    if (!reveal) return;
    const target = loadedId ? heading.current : panel.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start', behavior: 'instant' });
    // Reveal only on navigation/loading transitions, never on silent data updates.
  }, [loadedId, loadState, reveal, revealRequest]);
  if (!data)
    return (
      <section
        ref={panel}
        className="lv-setup-card"
        aria-label="Selected batch details"
        tabIndex={-1}
      >
        <LoadState error={read.error} onRetry={read.reload} />
      </section>
    );
  const b = data.batch;
  const changed = (message: string) => {
    setDialog(undefined);
    setToast(message);
    read.reload();
    onChanged();
  };
  const tabs: [Tab, string][] = [
    ...(lots ? ([['lots', 'Lots']] as [Tab, string][]) : []),
    ...(data.canSeeCosts
      ? ([['files', 'Attachments']] as [Tab, string][])
      : []),
    ['activity', 'Activity'],
  ];
  const current = tabs.some(([key]) => key === tab) ? tab : tabs[0]?.[0];
  return (
    <section ref={panel} className="lv-batches" aria-label={`Batch ${b.code}`}>
      {toast && (
        <p className="lv-setup-toast" role="status">
          {toast}
        </p>
      )}
      <div className="lv-setup-card lv-batch-summary">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {b.code} · {b.name}{' '}
            <BatchStatusPill status={b.status} deletedAt={b.deletedAt} />
          </h2>
          <p>
            {b.supplierName} · bought {longDay(b.boughtOn)} · {b.locationName}
            {data.categories.length > 0 &&
              ` · mostly ${data.categories.map((c) => c.name).join(', ')}`}
            {data.costs?.paidFrom &&
              ` · paid from ${paidFromLabels[data.costs.paidFrom].toLowerCase()}`}
          </p>
          {data.notes && <p>{data.notes}</p>}
          {data.closedReason && <p>Closed: {data.closedReason}</p>}
        </div>
        <div className="lv-setup-head-actions">
          {data.canReceive && !b.deletedAt && b.status !== 'closed' && (
            <Button
              variant={b.status === 'arriving' ? 'primary' : 'secondary'}
              size="small"
              disabled={!online}
              onClick={() => setDialog('receive')}
            >
              {b.status === 'arriving' ? 'Mark received' : 'Update item count'}
            </Button>
          )}
          {lots && !b.deletedAt && b.status !== 'closed' && (
            <Button
              variant="secondary"
              size="small"
              onClick={() =>
                openStaffPage('inventory', `/lots/new?batch=${b.id}`)
              }
            >
              Start intake
            </Button>
          )}
          {data.canManage && !b.deletedAt && b.status !== 'closed' && (
            <>
              <Button
                variant="secondary"
                size="small"
                onClick={() => go(`/batches/${b.id}/edit`)}
              >
                <Pencil size={16} aria-hidden="true" /> Edit
              </Button>
              {b.status !== 'arriving' && (
                <Button
                  variant="secondary"
                  size="small"
                  disabled={!online}
                  onClick={() => setDialog('close')}
                >
                  Close batch
                </Button>
              )}
            </>
          )}
          {data.canManage && !b.deletedAt && b.status === 'closed' && (
            <Button
              variant="secondary"
              size="small"
              disabled={!online}
              onClick={() => setDialog('reopen')}
            >
              Reopen batch
            </Button>
          )}
          {data.canDelete && (
            <Button
              variant="danger"
              size="small"
              disabled={!online}
              onClick={() => setDialog('delete')}
            >
              Delete batch
            </Button>
          )}
          {data.canRestore && (
            <Button
              size="small"
              disabled={!online}
              onClick={() => setDialog('restore')}
            >
              Restore batch
            </Button>
          )}
        </div>
      </div>
      {b.deletedAt && (
        <div className="lv-setup-alert" role="status">
          <strong>Deleted {time.format(new Date(b.deletedAt))} WAT.</strong>{' '}
          {data.deleteReason}{' '}
          {data.canRestore && data.purgeAt
            ? `Restore before ${time.format(new Date(data.purgeAt))} WAT. This unused batch and its attachments will then be removed automatically.`
            : 'The restore period has ended. Automatic cleanup is pending.'}
        </div>
      )}
      <div
        className="lv-batch-split"
        data-single={data.canSeeCosts ? undefined : ''}
      >
        {data.canSeeCosts && (
          <div className="lv-setup-card">
            <h3>
              {b.code} ·{' '}
              {data.recovery?.breakEvenDay != null
                ? `cost recovered on day ${data.recovery.breakEvenDay}`
                : data.recovery
                  ? 'cost not recovered yet'
                  : 'not received yet'}
            </h3>
            <p className="lv-setup-card-note">
              Money back from sold lots against what the batch cost (
              {shortNaira(b.costKobo ?? 0)})
            </p>
            {data.recovery ? (
              <RecoveryChart
                points={data.recovery.points}
                costKobo={b.costKobo ?? 0}
                breakEvenDay={data.recovery.breakEvenDay}
                money={shortNaira}
                day={shortDay}
              />
            ) : (
              <p className="lv-setup-muted">
                The chart starts when this batch is marked received.
              </p>
            )}
          </div>
        )}
        <WhatsLeft data={data} onStuck={() => setDialog('stuck')} />
      </div>
      <section className="lv-setup-card lv-setup-card--flush">
        <nav className="lv-setup-tabs lv-batch-tabs" aria-label="Batch details">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={key === current ? 'page' : undefined}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        {current === 'lots' && lots && <BatchLots batchId={id} lots={lots} />}
        {current === 'files' && (
          <BatchFiles
            id={id}
            client={client}
            canManage={data.canManage && !b.deletedAt}
            online={online}
          />
        )}
        {current === 'activity' && <BatchActivity id={id} client={client} />}
      </section>
      {dialog === 'receive' && (
        <ReceiveDialog
          batch={b}
          client={client}
          onClose={() => setDialog(undefined)}
          onDone={changed}
        />
      )}
      {(dialog === 'close' || dialog === 'reopen') && (
        <ReasonDialog
          batch={b}
          action={dialog}
          client={client}
          onClose={() => setDialog(undefined)}
          onDone={changed}
        />
      )}
      {dialog === 'stuck' && (
        <StuckDialog
          batch={b}
          client={client}
          canManage={data.canManage && b.status !== 'closed'}
          onClose={() => {
            setDialog(undefined);
            read.reload();
            onChanged();
          }}
        />
      )}
      {(dialog === 'delete' || dialog === 'restore') && (
        <BatchDeletionDialog
          batch={b}
          action={dialog}
          client={client}
          onClose={() => setDialog(undefined)}
          onDone={(message) => {
            const action = dialog;
            setDialog(undefined);
            read.reload();
            if (onDeletionChanged) onDeletionChanged(action, message);
            else changed(message);
          }}
        />
      )}
    </section>
  );
}

function WhatsLeft({
  data,
  onStuck,
}: {
  data: BatchDetail;
  onStuck: () => void;
}) {
  const { left, batch } = data;
  const most = Math.max(1, ...left.categories.map((c) => c.items));
  return (
    <div className="lv-setup-card">
      <h3>What’s left in {batch.code}</h3>
      <p className="lv-setup-card-note">
        {left.unsold.toLocaleString('en-NG')} of{' '}
        {items(
          Math.max(batch.itemsReceived ?? batch.itemsExpected, batch.lots),
        )}{' '}
        unsold
        {batch.writtenOff > 0 && ` · ${batch.writtenOff} written off`}
      </p>
      {left.categories.length ? (
        <ul className="lv-batch-left">
          {left.categories.map((c) => (
            <li key={c.name}>
              <span>
                {c.name}
                <span>
                  <b>{items(c.items)}</b>
                  {c.costKobo !== null &&
                    ` · ${shortNaira(c.costKobo)} at cost`}
                </span>
              </span>
              <meter
                className="lv-batch-meter is-indigo"
                min={0}
                max={most}
                value={c.items}
                aria-label={`${c.name}: ${items(c.items)}`}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="lv-setup-muted">
          {batch.lots ? 'Nothing left to sell.' : 'No lots yet.'}
        </p>
      )}
      {data.canSeeCosts && data.costsAreEstimates && batch.lots > 0 && (
        <p className="lv-setup-muted lv-batch-note">
          Unit costs are estimates until all{' '}
          {items(batch.itemsReceived ?? batch.itemsExpected)} have a lot.
        </p>
      )}
      {left.stuck > 0 && (
        <p className="lv-batch-stuck">
          {items(left.stuck)} unsold after 2 relists.{' '}
          <button type="button" className="lv-setup-link" onClick={onStuck}>
            {data.canManage ? 'Review or write off' : 'See them'}
          </button>
        </p>
      )}
    </div>
  );
}

function BatchLots({
  batchId,
  lots,
}: {
  batchId: string;
  lots: ReturnType<typeof createLotsClient>;
}) {
  const pager = useCursor();
  const read = useBatchLoad(
    () =>
      lots.list({
        tab: 'all',
        batchIds: batchId,
        sort: 'newest',
        limit: 10,
        cursor: pager.cursor,
      }),
    [lots, batchId, pager.cursor],
  );
  if (!read.data)
    return <LoadState error={read.error} onRetry={read.reload} rows />;
  const rows = read.data.items;
  if (!rows.length)
    return (
      <div className="lv-setup-state">
        <p>No lots in this batch yet.</p>
      </div>
    );
  return (
    <>
      <div className="lv-setup-scroll">
        <table className="lv-setup-table">
          <thead>
            <tr>
              <th scope="col">Lot</th>
              <th scope="col">Category</th>
              <th scope="col">Bin</th>
              <th scope="col">Status</th>
              <th scope="col" className="lv-setup-right">
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <button
                    type="button"
                    className="lv-setup-link"
                    onClick={() => openStaffPage('inventory', `/lots/${r.id}`)}
                  >
                    {r.title}
                  </button>
                  <small>{r.lotNumber}</small>
                </td>
                <td>{r.categoryName}</td>
                <td>{r.binCode ?? '—'}</td>
                <td className="lv-batch-stage">{r.stage}</td>
                <td className="lv-setup-right">
                  {shortNaira(r.currentPriceKobo ?? r.startPriceKobo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lv-setup-table-foot">
        <button
          type="button"
          className="lv-setup-link"
          onClick={() =>
            openStaffPage('inventory', `/lots?tab=all&batchIds=${batchId}`)
          }
        >
          Open in Lots
        </button>
        <Pager
          label="Lot pages"
          page={pager.page}
          next={!!read.data.nextCursor}
          onPrevious={pager.previous}
          onNext={() => pager.next(read.data?.nextCursor)}
        />
      </div>
    </>
  );
}

function BatchFiles({
  id,
  client,
  canManage,
  online,
}: {
  id: string;
  client: BatchesClient;
  canManage: boolean;
  online: boolean;
}) {
  const read = useBatchLoad(() => client.files(id), [client, id]);
  const { confirm, dialog } = useConfirm();
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  if (!read.data)
    return <LoadState error={read.error} onRetry={read.reload} rows />;
  const files = read.data.items;
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setProblem('');
    try {
      await work();
    } catch (failure) {
      setProblem(
        failure instanceof Error && failure.name === 'BatchFileError'
          ? failure.message
          : (Object.values(fieldErrors(failure))[0] ?? ''),
      );
    } finally {
      setBusy(false);
      read.reload();
    }
  }
  return (
    <div className="lv-batch-files">
      {dialog}
      {files.length ? (
        <ul>
          {files.map((f) => (
            <li key={f.id}>
              <span>
                <button
                  type="button"
                  className="lv-setup-link"
                  disabled={busy || !online}
                  onClick={() =>
                    void act(async () => {
                      const url = URL.createObjectURL(
                        await client.file(id, f.id),
                      );
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = f.name;
                      link.click();
                      URL.revokeObjectURL(url);
                    })
                  }
                >
                  {f.name}
                </button>
                <small>
                  {batchFileTypes[f.type as keyof typeof batchFileTypes]} ·{' '}
                  {Math.max(1, Math.round(f.bytes / 1024)).toLocaleString(
                    'en-NG',
                  )}{' '}
                  KB · {f.addedBy}, {time.format(new Date(f.addedAt))}
                </small>
              </span>
              {canManage && (
                <button
                  type="button"
                  className="lv-setup-icon-button lv-setup-icon-button--danger"
                  aria-label={`Remove ${f.name}`}
                  disabled={busy || !online}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Remove ${f.name}?`,
                        message: 'The file is deleted from this batch.',
                        confirmLabel: 'Remove file',
                        tone: 'danger',
                      })
                    )
                      void act(() => client.removeFile(id, f.id));
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="lv-setup-muted">No files attached.</p>
      )}
      {problem && (
        <p className="lv-setup-error" role="alert">
          {problem}
        </p>
      )}
      {canManage && files.length < 10 && (
        <FilePicker
          busy={busy}
          disabled={!online}
          onFiles={(chosen) => void act(() => uploadFiles(client, id, chosen))}
        />
      )}
    </div>
  );
}

function BatchActivity({ id, client }: { id: string; client: BatchesClient }) {
  const pager = useCursor();
  const read = useBatchLoad(
    () => client.activity(id, pager.cursor),
    [client, id, pager.cursor],
  );
  if (!read.data)
    return <LoadState error={read.error} onRetry={read.reload} rows />;
  return (
    <div className="lv-batch-files">
      <ul>
        {read.data.items.map((a) => (
          <li key={a.id}>
            <span>
              <b>{a.label}</b>
              <small>
                {a.actor} · {time.format(new Date(a.at))} WAT
              </small>
            </span>
          </li>
        ))}
      </ul>
      <Pager
        label="Activity pages"
        page={pager.page}
        next={!!read.data.nextCursor}
        onPrevious={pager.previous}
        onNext={() => pager.next(read.data?.nextCursor)}
      />
    </div>
  );
}
