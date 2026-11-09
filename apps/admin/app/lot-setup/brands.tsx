'use client';
import { useEffect, useState } from 'react';
import type { BrandRow } from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { Select } from '@auction-ng/ui/web/select';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Pencil, Search, Trash2 } from '@auction-ng/ui/web/icons';
import {
  describeFailure,
  downloadCsv,
  errorFor,
  useLoad,
  useSetupClient,
  type FieldErrors,
  type SetupContext,
} from './setup-data';
import type { TabActions } from './workspace';

export function BrandsTab({
  ctx,
  register,
}: {
  ctx: SetupContext;
  register: (actions: TabActions) => void;
}) {
  const client = useSetupClient(ctx);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [version, setVersion] = useState(0);
  const [rows, setRows] = useState<BrandRow[]>([]);
  const page = useLoad(ctx, () => client.brands({ search: query, cursor }), [
    query,
    cursor,
    version,
  ]);
  const categories = useLoad(ctx, () => client.categories(), []);
  const [editing, setEditing] = useState<BrandRow | null>();
  const [merging, setMerging] = useState<BrandRow>();
  const [toast, setToast] = useState('');
  const [problem, setProblem] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setCursor(undefined), [query, version]);
  useEffect(() => {
    if (page.data)
      setRows((r) => (cursor ? [...r, ...page.data!.items] : page.data!.items));
  }, [page.data]);
  useEffect(() => {
    register({
      create: () => setEditing(null),
      exportCsv: () =>
        downloadCsv('brands.csv', [
          ['Brand', 'Categories', 'Lots'],
          ...rows.map((b) => [
            b.name,
            b.categories.map((c) => c.name).join('; '),
            b.lots,
          ]),
        ]),
    });
  }, [register, rows]);
  const refresh = () => {
    setVersion((v) => v + 1);
    ctx.onChanged();
  };
  async function act(work: () => Promise<{ message: string }>) {
    setProblem('');
    try {
      setToast((await work()).message);
      refresh();
    } catch (failure) {
      setProblem(
        Object.values(describeFailure(failure, ctx))[0] ?? 'Not saved.',
      );
    }
  }
  return (
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
            <span className="sr-only">Search brands</span>
            <input
              type="search"
              placeholder="Search brands"
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
                No brands match “{query}”.{' '}
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
                <h2>No brands yet. Add the first one.</h2>
                {ctx.canManage && (
                  <Button onClick={() => setEditing(null)}>New brand</Button>
                )}
              </>
            )}
          </div>
        ) : (
          <table className="lv-setup-table">
            <thead>
              <tr>
                <th scope="col">Brand</th>
                <th scope="col">Used in categories</th>
                <th scope="col" className="lv-setup-right">
                  Lots
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.name}</strong>
                  </td>
                  <td>
                    <span className="lv-setup-chip-row">
                      {b.categories.length ? (
                        b.categories.map((c) => (
                          <span
                            key={c.id}
                            className="lv-setup-chip lv-setup-chip--static"
                          >
                            {c.name}
                          </span>
                        ))
                      ) : (
                        <span className="lv-setup-muted">All categories</span>
                      )}
                    </span>
                  </td>
                  <td className="lv-setup-right">
                    {b.lots.toLocaleString('en-NG')}
                  </td>
                  <td className="lv-setup-row-actions">
                    {ctx.canManage && (
                      <>
                        <button
                          type="button"
                          className="lv-setup-icon-button"
                          aria-label={`Edit ${b.name}`}
                          onClick={() => setEditing(b)}
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => setMerging(b)}
                        >
                          Merge
                        </Button>
                        <button
                          type="button"
                          className="lv-setup-icon-button lv-setup-icon-button--danger"
                          disabled={!b.deleteCheck.allowed}
                          title={
                            b.deleteCheck.allowed
                              ? undefined
                              : b.deleteCheck.reason
                          }
                          aria-label={
                            b.deleteCheck.allowed
                              ? `Delete ${b.name}`
                              : `${b.name} can't be deleted: ${b.deleteCheck.reason}`
                          }
                          onClick={() => {
                            if (window.confirm(`Delete ${b.name}?`))
                              void act(() =>
                                client.deleteBrand({
                                  id: b.id,
                                  expectedUpdatedAt: b.updatedAt,
                                }),
                              );
                          }}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="lv-setup-table-foot">
          <p>
            A brand used by lots can’t be deleted. Merge duplicates into one
            brand instead; their lots move with them.
          </p>
          {page.data?.nextCursor && (
            <Button
              variant="secondary"
              size="small"
              onClick={() => setCursor(page.data?.nextCursor ?? undefined)}
            >
              Show more
            </Button>
          )}
        </div>
      </section>
      {editing !== undefined && (
        <BrandDialog
          ctx={ctx}
          brand={editing ?? undefined}
          categories={categories.data?.items ?? []}
          onClose={() => setEditing(undefined)}
          onSaved={(message) => {
            setEditing(undefined);
            setToast(message);
            refresh();
          }}
        />
      )}
      {merging && (
        <MergeDialog
          ctx={ctx}
          source={merging}
          onClose={() => setMerging(undefined)}
          onMerged={(message) => {
            setMerging(undefined);
            setToast(message);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function BrandDialog({
  ctx,
  brand,
  categories,
  onClose,
  onSaved,
}: {
  ctx: SetupContext;
  brand?: BrandRow;
  categories: { id: string; name: string; parentId: string | null }[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const client = useSetupClient(ctx);
  const [name, setName] = useState(brand?.name ?? '');
  const [chosen, setChosen] = useState(
    () => new Set(brand?.categories.map((c) => c.id) ?? []),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const top = categories.filter((c) => c.parentId === null);
  return (
    <Dialog
      open
      title={brand ? `Edit ${brand.name}` : 'New brand'}
      onClose={onClose}
    >
      <form
        className="lv-setup-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErrors({});
          try {
            const result = await client.saveBrand({
              ...(brand
                ? { id: brand.id, expectedUpdatedAt: brand.updatedAt }
                : {}),
              name,
              categoryIds: [...chosen],
            });
            onSaved(result.message);
          } catch (failure) {
            setErrors(describeFailure(failure, ctx));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          label="Brand name"
          value={name}
          maxLength={80}
          error={errorFor(errors, 'name')}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <fieldset className="lv-setup-checklist">
          <legend>Categories it applies to</legend>
          <p className="lv-setup-muted lv-setup-small">
            Staff see this brand in the Brand list for these categories. Leave
            all unticked to show it everywhere.
          </p>
          {top.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={chosen.has(c.id)}
                onChange={(e) => {
                  const next = new Set(chosen);
                  if (e.target.checked) next.add(c.id);
                  else next.delete(c.id);
                  setChosen(next);
                }}
              />{' '}
              {c.name}
            </label>
          ))}
        </fieldset>
        {errors.form && <p className="lv-setup-error">{errors.form}</p>}
        <div className="lv-setup-actions lv-setup-actions--end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {brand ? 'Save brand' : 'Add brand'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function MergeDialog({
  ctx,
  source,
  onClose,
  onMerged,
}: {
  ctx: SetupContext;
  source: BrandRow;
  onClose: () => void;
  onMerged: (message: string) => void;
}) {
  const client = useSetupClient(ctx);
  const [search, setSearch] = useState('');
  const options = useLoad(ctx, () => client.brands({ search }), [search]);
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const choices = (options.data?.items ?? []).filter((b) => b.id !== source.id);
  const picked = choices.find((b) => b.id === target);
  return (
    <Dialog open title={`Merge ${source.name}`} onClose={onClose}>
      <div className="lv-setup-form">
        <p>
          Merge {source.name} into another brand. Its{' '}
          {source.lots.toLocaleString('en-NG')}{' '}
          {source.lots === 1 ? 'lot moves' : 'lots move'} to the brand you keep,
          and {source.name} is removed.
        </p>
        <Input
          label="Find the brand to keep"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label="Keep this brand"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">Pick a brand</option>
          {choices.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.lots.toLocaleString('en-NG')} lots)
            </option>
          ))}
        </Select>
        {error && <p className="lv-setup-error">{error}</p>}
        <div className="lv-setup-actions lv-setup-actions--end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={busy}
            disabled={!target}
            onClick={async () => {
              if (
                !window.confirm(
                  `Merge ${source.name} into ${picked?.name ?? 'the chosen brand'}? This can't be undone.`,
                )
              )
                return;
              setBusy(true);
              try {
                const result = await client.mergeBrands({
                  sourceId: source.id,
                  targetId: target,
                });
                onMerged(result.message);
              } catch (failure) {
                setError(
                  Object.values(describeFailure(failure, ctx))[0] ??
                    'Not merged.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Merge into {picked?.name ?? '…'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
