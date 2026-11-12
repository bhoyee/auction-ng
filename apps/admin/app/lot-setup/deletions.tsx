'use client';
import { useState } from 'react';
import type { LotSetupDeletion } from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { useLoad, useSetupClient, type SetupContext } from './setup-data';

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

// Read-only list of permanently deleted setup items, from the audit log.
export function DeletionsTab({ ctx }: { ctx: SetupContext }) {
  const client = useSetupClient(ctx);
  const first = useLoad(ctx, () => client.deletions({ limit: 25 }), []);
  const [more, setMore] = useState<LotSetupDeletion[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const rows = [...(first.data?.items ?? []), ...more];
  const next = cursor === undefined ? first.data?.nextCursor : cursor;

  async function loadMore() {
    if (!next) return;
    setLoadingMore(true);
    setMoreError('');
    try {
      const page = await client.deletions({ limit: 25, cursor: next });
      setMore((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setMoreError(
        ctx.online
          ? 'More history could not be loaded. Try again.'
          : 'You’re offline. Reconnect, then try again.',
      );
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="lv-setup-stack">
      <section className="lv-setup-card lv-setup-card--flush">
        {first.loading && !first.data ? (
          <div
            className="lv-setup-skeleton lv-setup-skeleton--rows"
            aria-busy="true"
          />
        ) : first.error && !first.data ? (
          <div className="lv-setup-state" role="alert">
            <p>{first.error}</p>
            <Button variant="secondary" onClick={first.refresh}>
              Try again
            </Button>
          </div>
        ) : !rows.length ? (
          <div className="lv-setup-state">
            <h2>Nothing has been deleted yet.</h2>
            <p>
              When someone permanently deletes a category, location, bin,
              supplier or brand, it appears here with their name and the time.
            </p>
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
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Deleted item">
                      <strong>{row.name}</strong>
                    </td>
                    <td data-label="Type">{kindLabel[row.kind]}</td>
                    <td data-label="Deleted by">{row.deletedBy}</td>
                    <td data-label="Date and time">
                      <time dateTime={row.deletedAt}>
                        {when(row.deletedAt)}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {moreError && (
        <p className="lv-setup-alert" role="alert">
          {moreError}
        </p>
      )}
      {next && rows.length > 0 && (
        <Button
          variant="secondary"
          busy={loadingMore}
          onClick={() => void loadMore()}
        >
          Show older deletions
        </Button>
      )}
    </div>
  );
}
