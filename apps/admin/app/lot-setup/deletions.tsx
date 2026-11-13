'use client';
import { useEffect, useState } from 'react';
import type { LotSetupDeletion } from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { Search } from '@auction-ng/ui/web/icons';
import {
  deleteConfirmation,
  useConfirm,
} from '@auction-ng/ui/admin/confirm-dialog';
import {
  describeFailure,
  useLoad,
  useSetupClient,
  type SetupContext,
} from './setup-data';
import { SETUP_PAGE_SIZE, SetupPager, useKeysetPager } from './pager';

const kindLabel: Record<LotSetupDeletion['kind'], string> = {
  category: 'Category',
  location: 'Pickup location',
  bin: 'Bin',
  supplier: 'Supplier',
  brand: 'Brand',
};
const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso)) + ' WAT';

// Deleted items: setup items moved to the bin. Staff who manage Lot setup can
// restore them or delete them permanently (type DELETE).
export function DeletionsTab({ ctx }: { ctx: SetupContext }) {
  const client = useSetupClient(ctx);
  const { confirm, dialog } = useConfirm();
  const pager = useKeysetPager();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [problem, setProblem] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const { reset } = pager;
  useEffect(() => reset(), [query, reset]);
  const page = useLoad(
    ctx,
    () =>
      client.deletions({
        search: query || undefined,
        cursor: pager.cursor,
        limit: SETUP_PAGE_SIZE,
      }),
    [query, pager.cursor, version],
  );
  const rows = page.data?.items ?? [];
  const canManage = page.data?.canManage ?? false;

  async function act(row: LotSetupDeletion, action: 'restore' | 'purge') {
    const label = kindLabel[row.kind].toLowerCase();
    if (action === 'purge') {
      if (!(await confirm(deleteConfirmation(label, row.name, 'permanent'))))
        return;
    } else if (
      !(await confirm({
        title: `Restore ${label}?`,
        message: (
          <p>
            <strong>{row.name}</strong> goes back to where it was, with its
            settings.
          </p>
        ),
        confirmLabel: 'Restore',
      }))
    )
      return;
    setBusy(row.id);
    setProblem('');
    setToast('');
    try {
      const result =
        action === 'restore'
          ? await client.restoreDeleted({ kind: row.kind, id: row.id })
          : await client.purgeDeleted({ kind: row.kind, id: row.id });
      setToast(result.message);
      setVersion((v) => v + 1);
      ctx.onChanged();
    } catch (failure) {
      setProblem(
        Object.values(describeFailure(failure, ctx))[0] ??
          'That didn’t work. Try again.',
      );
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      {dialog}
      <div className="lv-setup-stack">
        {toast && (
          <p className="lv-setup-toast" role="status">
            {toast}
          </p>
        )}
        {problem && (
          <p className="lv-setup-alert" role="alert">
            {problem}
          </p>
        )}
        <section className="lv-setup-card lv-setup-card--flush">
          <div className="lv-setup-table-tools">
            <label className="lv-setup-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search deleted items</span>
              <input
                type="search"
                placeholder="Search deleted items"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {page.loading && !page.data ? (
            <div
              className="lv-setup-skeleton lv-setup-skeleton--rows"
              aria-busy="true"
            />
          ) : page.error && !page.data ? (
            <div className="lv-setup-state" role="alert">
              <p>{page.error}</p>
              <Button variant="secondary" onClick={page.refresh}>
                Try again
              </Button>
            </div>
          ) : !rows.length ? (
            <div className="lv-setup-state">
              {query ? (
                <p>
                  No deleted items match “{query}”.{' '}
                  <button
                    type="button"
                    className="lv-setup-link"
                    onClick={() => setSearch('')}
                  >
                    Clear search
                  </button>
                </p>
              ) : (
                <>
                  <h2>Deleted items is empty.</h2>
                  <p>
                    Deleted categories, locations, bins, suppliers and brands
                    appear here. You can restore them or delete them
                    permanently.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="lv-setup-scroll">
              <table className="lv-setup-table lv-setup-table--stack">
                <thead>
                  <tr>
                    <th scope="col">Deleted item</th>
                    <th scope="col">Type</th>
                    <th scope="col">Deleted by</th>
                    <th scope="col">Date and time</th>
                    {canManage && (
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.kind}:${row.id}`}>
                      <td data-label="Deleted item">
                        <strong>{row.name}</strong>
                        {row.detail && <small>{row.detail}</small>}
                      </td>
                      <td data-label="Type">{kindLabel[row.kind]}</td>
                      <td data-label="Deleted by">{row.deletedBy}</td>
                      <td data-label="Date and time">
                        <time dateTime={row.deletedAt}>
                          {when(row.deletedAt)}
                        </time>
                      </td>
                      {canManage && (
                        <td className="lv-setup-trash-actions">
                          <Button
                            variant="secondary"
                            size="small"
                            disabled={busy !== ''}
                            busy={busy === row.id}
                            onClick={() => void act(row, 'restore')}
                          >
                            Restore
                          </Button>
                          <Button
                            variant="danger"
                            size="small"
                            disabled={busy !== ''}
                            onClick={() => void act(row, 'purge')}
                          >
                            Delete permanently
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <SetupPager
            label="Deleted items"
            page={pager.page}
            count={rows.length}
            nextCursor={page.data?.nextCursor}
            onPrev={pager.prev}
            onNext={pager.next}
          />
        </section>
      </div>
    </>
  );
}
