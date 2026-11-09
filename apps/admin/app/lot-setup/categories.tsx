'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BRAND_FIELD_KEY,
  RUN_TIME_OPTIONS_MINUTES,
  categoryFieldTypeLabels,
  categoryFieldTypes,
  categoryIcons,
  databaseValues,
  formatNaira,
  runTimeLabel,
  slugify,
  type CategoryDetail,
  type CategoryFieldView,
  type CategoryTreeItem,
} from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { Select } from '@auction-ng/ui/web/select';
import { NairaInput } from '@auction-ng/ui/web/naira-input';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Switch } from '@auction-ng/ui/admin/switch';
import {
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Search,
} from '@auction-ng/ui/web/icons';
import {
  describeFailure,
  downloadCsv,
  errorFor,
  useLoad,
  useSetupClient,
  type FieldErrors,
  type SetupContext,
} from './setup-data';
import { CategoryIcon, iconLabels } from './category-icon';
import type { TabActions } from './workspace';

const conditionLabels: Record<string, string> = {
  new: 'New',
  like_new: 'Like new',
  open_box: 'Open box',
  damaged: 'Damaged',
  untested: 'Untested',
};
const SITE = 'lotvanta.ng/c/';

type FieldDraft = Omit<CategoryFieldView, 'id'> & { id: string };
type Draft = {
  name: string;
  slug: string;
  slugTouched: boolean;
  parentId: string | null;
  description: string;
  icon: string;
  runTime: number | null;
  minStartPriceKobo: number | null;
  minPhotos: number | null;
  conditions: string[] | null;
  fields: FieldDraft[] | null;
};

const blank = (parentId: string | null): Draft => ({
  name: '',
  slug: '',
  slugTouched: false,
  parentId,
  description: '',
  icon: 'tag',
  runTime: null,
  minStartPriceKobo: null,
  minPhotos: null,
  conditions: parentId ? null : [...databaseValues.lotConditions],
  fields: parentId ? null : [],
});

const fromDetail = (d: CategoryDetail): Draft => ({
  name: d.name,
  slug: d.slug,
  slugTouched: d.slug !== slugify(d.name),
  parentId: d.parentId,
  description: d.description ?? '',
  icon: d.icon,
  runTime: d.defaults.runTimeMinutes,
  minStartPriceKobo: d.defaults.minStartPriceKobo,
  minPhotos: d.defaults.minPhotos,
  conditions: d.conditions,
  fields: d.fields ? d.fields.map((f) => ({ ...f })) : null,
});

// Number of top-level settings that differ from what is saved.
function changes(a: Draft, b: Draft) {
  const keys: (keyof Draft)[] = [
    'name',
    'slug',
    'parentId',
    'description',
    'icon',
    'runTime',
    'minStartPriceKobo',
    'minPhotos',
    'conditions',
    'fields',
  ];
  return keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .length;
}

const fieldKey = (name: string) =>
  slugify(name).replace(/-/g, '_').slice(0, 60) || 'field';

export function CategoriesTab({
  ctx,
  selected,
  onSelect,
  register,
}: {
  ctx: SetupContext;
  selected: string;
  onSelect: (id: string) => void;
  register: (actions: TabActions) => void;
}) {
  const client = useSetupClient(ctx);
  const [treeVersion, setTreeVersion] = useState(0);
  const tree = useLoad(ctx, () => client.categories(), [treeVersion]);
  const [creating, setCreating] = useState<{ parentId: string | null }>();
  const [notice, setNotice] = useState('');
  const items = useMemo(() => tree.data?.items ?? [], [tree.data]);
  const firstTop = items.find((i) => i.parentId === null)?.id ?? '';
  const active = creating ? '' : selected || firstTop;

  useEffect(() => {
    register({
      create: () => setCreating({ parentId: null }),
      exportCsv: () =>
        downloadCsv('categories.csv', [
          ['Category', 'Parent', 'Web address', 'Lots', 'Live', 'Visible'],
          ...items.map((i) => [
            i.name,
            items.find((p) => p.id === i.parentId)?.name ?? '',
            SITE + i.slug,
            i.lots,
            i.live,
            i.isVisible ? 'Yes' : 'No',
          ]),
        ]),
    });
  }, [register, items]);

  if (tree.loading && !tree.data)
    return (
      <div className="lv-setup-split" aria-busy="true">
        <div className="lv-setup-card lv-setup-skeleton" />
        <div className="lv-setup-card lv-setup-skeleton lv-setup-skeleton--tall" />
      </div>
    );
  if (tree.error && !tree.data)
    return (
      <div className="lv-setup-card lv-setup-state" role="alert">
        <p>{tree.error}</p>
        <Button variant="secondary" onClick={tree.refresh}>
          Try again
        </Button>
      </div>
    );
  if (!items.length && !creating)
    return (
      <div className="lv-setup-card lv-setup-state">
        <h2>No categories yet. Create the first one.</h2>
        <p>Categories decide what staff fill in and where buyers find lots.</p>
        {ctx.canManage && (
          <Button onClick={() => setCreating({ parentId: null })}>
            New category
          </Button>
        )}
      </div>
    );
  return (
    <>
      {notice && (
        <p className="lv-setup-toast" role="status">
          {notice}
        </p>
      )}
      <div className="lv-setup-split">
        <CategoryTree
          ctx={ctx}
          items={items}
          active={active}
          onSelect={(id) => {
            setCreating(undefined);
            setNotice('');
            onSelect(id);
          }}
          onAddChild={(parentId) => setCreating({ parentId })}
          onReordered={() => setTreeVersion((v) => v + 1)}
        />
        {creating ? (
          <CategoryEditor
            onNotice={setNotice}
            key={'new:' + (creating.parentId ?? 'top')}
            ctx={ctx}
            items={items}
            initial={blank(creating.parentId)}
            onCancel={() => setCreating(undefined)}
            onSaved={(id) => {
              setCreating(undefined);
              onSelect(id);
              setTreeVersion((v) => v + 1);
              ctx.onChanged();
            }}
          />
        ) : active ? (
          <CategoryDetailPanel
            key={active}
            onNotice={setNotice}
            ctx={ctx}
            id={active}
            items={items}
            onChanged={() => setTreeVersion((v) => v + 1)}
            onDeleted={() => {
              onSelect('');
              setTreeVersion((v) => v + 1);
              ctx.onChanged();
            }}
          />
        ) : null}
      </div>
    </>
  );
}

function CategoryTree({
  ctx,
  items,
  active,
  onSelect,
  onAddChild,
  onReordered,
}: {
  ctx: SetupContext;
  items: CategoryTreeItem[];
  active: string;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onReordered: () => void;
}) {
  const client = useSetupClient(ctx);
  const [search, setSearch] = useState('');
  const activeParent = items.find((i) => i.id === active)?.parentId ?? active;
  const [open, setOpen] = useState<string>(activeParent);
  const [dragging, setDragging] = useState<string>();
  const [message, setMessage] = useState('');
  useEffect(() => setOpen(activeParent), [activeParent]);
  const term = search.trim().toLowerCase();
  const top = items.filter((i) => i.parentId === null);
  const childrenOf = (id: string) => items.filter((i) => i.parentId === id);
  const matches = (i: CategoryTreeItem) =>
    !term ||
    i.name.toLowerCase().includes(term) ||
    childrenOf(i.id).some((c) => c.name.toLowerCase().includes(term));

  async function move(id: string, onto: string) {
    const item = items.find((i) => i.id === id);
    const target = items.find((i) => i.id === onto);
    if (!item || !target || item.parentId !== target.parentId || id === onto)
      return;
    const siblings = items
      .filter((i) => i.parentId === item.parentId)
      .map((i) => i.id)
      .filter((x) => x !== id);
    siblings.splice(siblings.indexOf(onto), 0, id);
    try {
      await client.orderCategories({ parentId: item.parentId, ids: siblings });
      setMessage('New order saved. Buyers see this order in the menu.');
      onReordered();
    } catch (failure) {
      setMessage(describeFailure(failure, ctx).form ?? 'Order not saved.');
    }
  }
  function nudge(id: string, step: -1 | 1) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const siblings = items.filter((i) => i.parentId === item.parentId);
    const index = siblings.findIndex((s) => s.id === id);
    const onto = siblings[index + step];
    if (onto) void move(id, onto.id);
  }
  const dragProps = (id: string) =>
    ctx.canManage
      ? {
          draggable: true,
          onDragStart: () => setDragging(id),
          onDragEnd: () => setDragging(undefined),
          onDragOver: (e: React.DragEvent) => e.preventDefault(),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            if (dragging) void move(dragging, id);
          },
        }
      : {};
  const handle = (item: CategoryTreeItem) =>
    ctx.canManage && (
      <button
        type="button"
        className="lv-setup-grip"
        aria-label={`Reorder ${item.name}. Use the up and down arrow keys.`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            nudge(item.id, -1);
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            nudge(item.id, 1);
          }
        }}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>
    );
  return (
    <aside className="lv-setup-card lv-setup-tree" aria-label="Category tree">
      <label className="lv-setup-search">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Search categories</span>
        <input
          type="search"
          placeholder="Search categories"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {message && (
        <p className="lv-setup-inline-note" role="status">
          {message}
        </p>
      )}
      <ul className="lv-setup-tree-list">
        {top.filter(matches).map((item) => {
          const expanded = open === item.id || !!term;
          const kids = childrenOf(item.id).filter(
            (c) =>
              !term ||
              c.name.toLowerCase().includes(term) ||
              item.name.toLowerCase().includes(term),
          );
          return (
            <li key={item.id} {...dragProps(item.id)}>
              <div
                className="lv-setup-tree-row"
                data-active={item.id === active || undefined}
                data-dragging={dragging === item.id || undefined}
              >
                <button
                  type="button"
                  className="lv-setup-chevron"
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.name}`}
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? '' : item.id)}
                >
                  {expanded ? (
                    <ChevronDown size={16} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={16} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className="lv-setup-tree-main"
                  aria-current={item.id === active ? 'true' : undefined}
                  onClick={() => {
                    onSelect(item.id);
                    setOpen(item.id);
                  }}
                >
                  <CategoryIcon name={item.icon} />
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.lots.toLocaleString('en-NG')} lots ·{' '}
                      {item.live.toLocaleString('en-NG')} live
                      {!item.isVisible && ' · hidden'}
                    </small>
                  </span>
                </button>
                {handle(item)}
              </div>
              {expanded && (
                <ul className="lv-setup-subtree">
                  {kids.map((child) => (
                    <li key={child.id} {...dragProps(child.id)}>
                      <div
                        className="lv-setup-subrow"
                        data-active={child.id === active || undefined}
                      >
                        <button
                          type="button"
                          aria-current={
                            child.id === active ? 'true' : undefined
                          }
                          onClick={() => onSelect(child.id)}
                        >
                          <span className="lv-setup-dot" aria-hidden="true" />
                          {child.name}
                          {!child.isVisible && (
                            <span className="lv-setup-muted"> · hidden</span>
                          )}
                        </button>
                        <span className="lv-setup-num">
                          {child.lots.toLocaleString('en-NG')}
                        </span>
                        {handle(child)}
                      </div>
                    </li>
                  ))}
                  {ctx.canManage && (
                    <li>
                      <button
                        type="button"
                        className="lv-setup-link"
                        onClick={() => onAddChild(item.id)}
                      >
                        + Add subcategory
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {term && !top.some(matches) && (
        <p className="lv-setup-muted lv-setup-pad">
          No categories match “{search}”.{' '}
          <button
            type="button"
            className="lv-setup-link"
            onClick={() => setSearch('')}
          >
            Clear search
          </button>
        </p>
      )}
      <p className="lv-setup-tree-foot">
        Drag to change the order buyers see in the menu.
      </p>
    </aside>
  );
}

function CategoryDetailPanel({
  onNotice,
  ctx,
  id,
  items,
  onChanged,
  onDeleted,
}: {
  onNotice: (message: string) => void;
  ctx: SetupContext;
  id: string;
  items: CategoryTreeItem[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const client = useSetupClient(ctx);
  const [version, setVersion] = useState(0);
  const detail = useLoad(ctx, () => client.category(id), [id, version]);
  if (detail.loading && !detail.data)
    return (
      <div className="lv-setup-stack" aria-busy="true">
        <div className="lv-setup-card lv-setup-skeleton" />
        <div className="lv-setup-card lv-setup-skeleton lv-setup-skeleton--tall" />
      </div>
    );
  if (!detail.data)
    return (
      <div className="lv-setup-card lv-setup-state" role="alert">
        <p>{detail.error || 'This category could not be loaded.'}</p>
        <Button variant="secondary" onClick={detail.refresh}>
          Try again
        </Button>
      </div>
    );
  return (
    <CategoryEditor
      key={detail.data.updatedAt}
      onNotice={onNotice}
      ctx={ctx}
      items={items}
      detail={detail.data}
      initial={fromDetail(detail.data)}
      onSaved={() => {
        setVersion((v) => v + 1);
        onChanged();
        ctx.onChanged();
      }}
      onDeleted={onDeleted}
    />
  );
}

function CategoryEditor({
  onNotice,
  ctx,
  items,
  detail,
  initial,
  onSaved,
  onCancel,
  onDeleted,
}: {
  onNotice: (message: string) => void;
  ctx: SetupContext;
  items: CategoryTreeItem[];
  detail?: CategoryDetail;
  initial: Draft;
  onSaved: (id: string) => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}) {
  const client = useSetupClient(ctx);
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ index: number | null }>();
  const [moving, setMoving] = useState(false);
  const [dragField, setDragField] = useState<number>();
  const editable = ctx.canManage;
  const parent = items.find((i) => i.id === draft.parentId);
  const pending = changes(draft, initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const effective = detail?.effective;
  const parentOptions = items.filter(
    (i) =>
      i.parentId === null &&
      i.id !== detail?.id &&
      // A category with subcategories must stay at the top level.
      !(detail && detail.subcategories > 0),
  );

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      const result = await client.saveCategory({
        ...(detail
          ? { id: detail.id, expectedUpdatedAt: detail.updatedAt }
          : {}),
        name: draft.name,
        slug: draft.slug,
        parentId: draft.parentId,
        description: draft.description,
        icon: draft.icon as (typeof categoryIcons)[number],
        defaultRunTimeMinutes: draft.runTime,
        minStartPriceKobo: draft.minStartPriceKobo,
        minPhotos: draft.minPhotos,
        conditions: draft.conditions as
          (typeof databaseValues.lotConditions)[number][] | null,
        fields: draft.fields
          ? draft.fields.map((f) => ({
              name: f.name,
              key: f.key,
              type: f.type,
              options: f.options,
              helpText: f.helpText ?? '',
              required: f.required,
              showToBuyers: f.showToBuyers,
            }))
          : null,
      });
      onNotice(result.message);
      onSaved(result.id);
    } catch (failure) {
      setErrors(describeFailure(failure, ctx));
    } finally {
      setBusy(false);
    }
  }

  async function action(
    work: () => Promise<{ message: string }>,
    after?: () => void,
  ) {
    setBusy(true);
    setErrors({});
    try {
      const result = await work();
      onNotice(result.message);
      after?.();
    } catch (failure) {
      setErrors(describeFailure(failure, ctx));
    } finally {
      setBusy(false);
    }
  }

  const conditionsShown = draft.conditions ?? effective?.conditions ?? [];
  const fieldsShown = draft.fields ?? effective?.fields ?? [];
  const inheritsFields = draft.parentId !== null && draft.fields === null;
  const inheritsConditions =
    draft.parentId !== null && draft.conditions === null;

  return (
    <div className="lv-setup-stack">
      {errors.form && (
        <p className="lv-setup-alert" role="alert">
          {errors.form}
        </p>
      )}
      <section className="lv-setup-card lv-setup-summary">
        <CategoryIcon name={draft.icon} size="large" />
        <div className="lv-setup-summary-main">
          <h2>
            {draft.name || 'New category'}
            {detail && (
              <span
                className="lv-setup-pill"
                data-tone={detail.isVisible ? 'green' : 'grey'}
              >
                <span aria-hidden="true">●</span>{' '}
                {detail.isVisible ? 'Visible to buyers' : 'Hidden from buyers'}
              </span>
            )}
          </h2>
          <p>
            {SITE}
            {draft.slug || 'web-address'}
            {detail &&
              ` · ${detail.subcategories} ${detail.subcategories === 1 ? 'subcategory' : 'subcategories'}`}
            {detail?.editedBy &&
              ` · edited by ${detail.editedBy.name}, ${new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }).format(new Date(detail.editedBy.at))}`}
          </p>
        </div>
        {detail && (
          <dl className="lv-setup-stats">
            <div>
              <dt>Live lots</dt>
              <dd>{detail.stats.liveLots.toLocaleString('en-NG')}</dd>
            </div>
            <div>
              <dt>Sell-through</dt>
              <dd>
                {detail.stats.sellThroughPercent === null
                  ? '—'
                  : `${detail.stats.sellThroughPercent}%`}
              </dd>
            </div>
            <div>
              <dt>Avg. of retail</dt>
              <dd>
                {detail.stats.averageRetailPercent === null
                  ? '—'
                  : `${detail.stats.averageRetailPercent}%`}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="lv-setup-card" aria-labelledby="cat-basics">
        <h3 id="cat-basics">Basics</h3>
        <div className="lv-setup-grid lv-setup-grid--3">
          <Input
            label="Name"
            value={draft.name}
            disabled={!editable}
            error={errorFor(errors, 'name')}
            maxLength={100}
            onChange={(e) => {
              const name = e.target.value;
              setDraft((d) => ({
                ...d,
                name,
                slug: d.slugTouched ? d.slug : slugify(name),
              }));
            }}
          />
          <Input
            label="Web address"
            value={draft.slug}
            disabled={!editable}
            error={errorFor(errors, 'slug')}
            hint={SITE + (draft.slug || '…')}
            maxLength={120}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                slug: e.target.value.toLowerCase(),
                slugTouched: true,
              }))
            }
          />
          <Select
            label="Parent category"
            value={draft.parentId ?? ''}
            disabled={!editable || (detail?.subcategories ?? 0) > 0}
            error={errorFor(errors, 'parentId')}
            hint={
              (detail?.subcategories ?? 0) > 0
                ? 'Has subcategories, so it stays at the top level.'
                : undefined
            }
            onChange={(e) => {
              const parentId = e.target.value || null;
              setDraft((d) => ({
                ...d,
                parentId,
                // Top-level categories need their own lists.
                conditions:
                  parentId === null && d.conditions === null
                    ? [
                        ...(effective?.conditions ??
                          databaseValues.lotConditions),
                      ]
                    : d.conditions,
                fields:
                  parentId === null && d.fields === null
                    ? [...(effective?.fields ?? [])]
                    : d.fields,
              }));
            }}
          >
            <option value="">None (top level)</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="lv-setup-grid lv-setup-grid--desc">
          <Input
            label="Short description for buyers"
            value={draft.description}
            disabled={!editable}
            error={errorFor(errors, 'description')}
            maxLength={240}
            onChange={(e) => set('description', e.target.value)}
          />
          <Select
            label="Icon"
            value={draft.icon}
            disabled={!editable}
            onChange={(e) => set('icon', e.target.value)}
          >
            {categoryIcons.map((icon) => (
              <option key={icon} value={icon}>
                {iconLabels[icon]}
              </option>
            ))}
          </Select>
        </div>
      </section>

      <section className="lv-setup-card" aria-labelledby="cat-defaults">
        <h3 id="cat-defaults">Defaults for new lots</h3>
        <p className="lv-setup-card-note">
          Pre-filled when staff create a lot in this category. They can change
          them per lot.
          {parent && ` Empty values use ${parent.name}’s defaults.`}
        </p>
        <div className="lv-setup-grid lv-setup-grid--3">
          <Select
            label="Run time"
            value={draft.runTime ?? ''}
            disabled={!editable}
            error={errorFor(errors, 'defaultRunTimeMinutes')}
            hint={
              draft.runTime === null && effective?.runTimeMinutes
                ? `Uses ${runTimeLabel(effective.runTimeMinutes)} from ${parent?.name ?? 'the parent'}`
                : 'Staff can change it per lot.'
            }
            onChange={(e) =>
              set('runTime', e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">
              {parent ? `Same as ${parent.name}` : 'Not set'}
            </option>
            {RUN_TIME_OPTIONS_MINUTES.map((m) => (
              <option key={m} value={m}>
                {runTimeLabel(m)}
              </option>
            ))}
          </Select>
          <NairaInput
            key={'price:' + String(initial.minStartPriceKobo)}
            label="Lowest start price"
            initialValue={
              draft.minStartPriceKobo === null
                ? ''
                : String(draft.minStartPriceKobo / 100)
            }
            digitsOnly
            prefix="₦"
            disabled={!editable}
            error={errorFor(errors, 'minStartPriceKobo')}
            hint={
              draft.minStartPriceKobo === null &&
              effective?.minStartPriceKobo != null
                ? `Uses ${formatNaira(effective.minStartPriceKobo)} from ${parent?.name ?? 'the parent'}`
                : 'Leave empty for no minimum.'
            }
            onAmountChange={(kobo) => set('minStartPriceKobo', kobo ?? null)}
          />
          <Input
            label="Photos needed to publish"
            inputMode="numeric"
            value={draft.minPhotos ?? ''}
            disabled={!editable}
            error={errorFor(errors, 'minPhotos')}
            hint={
              draft.minPhotos === null && effective?.minPhotos != null
                ? `Uses ${effective.minPhotos} from ${parent?.name ?? 'the parent'}`
                : 'e.g. front, back, screen on, label'
            }
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 2);
              set('minPhotos', v === '' ? null : Number(v));
            }}
          />
        </div>
        <fieldset className="lv-setup-chips" disabled={!editable}>
          <legend>Conditions allowed</legend>
          {inheritsConditions && (
            <p className="lv-setup-card-note">
              Same as {parent?.name}.{' '}
              {editable && (
                <button
                  type="button"
                  className="lv-setup-link"
                  onClick={() => set('conditions', [...conditionsShown])}
                >
                  Choose different conditions
                </button>
              )}
            </p>
          )}
          {databaseValues.lotConditions.map((key) => {
            const on = conditionsShown.includes(key);
            return (
              <button
                key={key}
                type="button"
                className="lv-setup-chip"
                aria-pressed={on}
                disabled={!editable || inheritsConditions}
                onClick={() =>
                  set(
                    'conditions',
                    on
                      ? conditionsShown.filter((c) => c !== key)
                      : databaseValues.lotConditions.filter(
                          (c) => c === key || conditionsShown.includes(c),
                        ),
                  )
                }
              >
                {on && <Check size={14} aria-hidden="true" />}
                {conditionLabels[key]}
              </button>
            );
          })}
          {errorFor(errors, 'conditions') && (
            <p className="lv-setup-error">{errorFor(errors, 'conditions')}</p>
          )}
        </fieldset>
      </section>

      <section
        className="lv-setup-card lv-setup-card--flush"
        aria-labelledby="cat-fields"
      >
        <div className="lv-setup-card-head">
          <div>
            <h3 id="cat-fields">Item details staff must fill in</h3>
            <p className="lv-setup-card-note">
              These appear on the Create lot form and as filters on the buyer
              site.
            </p>
          </div>
          {editable && !inheritsFields && (
            <Button
              variant="secondary"
              size="small"
              onClick={() => setEditing({ index: null })}
            >
              + Add field
            </Button>
          )}
        </div>
        {inheritsFields ? (
          <p className="lv-setup-pad">
            Uses {parent?.name}’s fields ({fieldsShown.length}).{' '}
            {editable && (
              <button
                type="button"
                className="lv-setup-link"
                onClick={() =>
                  set(
                    'fields',
                    fieldsShown.map((f) => ({ ...f })),
                  )
                }
              >
                Customise for this subcategory
              </button>
            )}
          </p>
        ) : null}
        {fieldsShown.length > 0 ? (
          <table className="lv-setup-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Order</span>
                </th>
                <th scope="col">Field</th>
                <th scope="col">Type</th>
                <th scope="col">Required</th>
                <th scope="col">Shown to buyers</th>
                <th scope="col">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {fieldsShown.map((field, index) => {
                const canEdit = editable && !inheritsFields;
                const update = (patch: Partial<FieldDraft>) =>
                  set(
                    'fields',
                    (draft.fields ?? []).map((f, i) =>
                      i === index ? { ...f, ...patch } : f,
                    ),
                  );
                return (
                  <tr
                    key={field.id}
                    draggable={canEdit}
                    data-dragging={dragField === index || undefined}
                    onDragStart={() => setDragField(index)}
                    onDragEnd={() => setDragField(undefined)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragField === undefined || dragField === index)
                        return;
                      const next = [...(draft.fields ?? [])];
                      const [moved] = next.splice(dragField, 1);
                      if (moved) next.splice(index, 0, moved);
                      set('fields', next);
                    }}
                  >
                    <td className="lv-setup-grip-cell">
                      {canEdit && <GripVertical size={14} aria-hidden="true" />}
                    </td>
                    <td>
                      <strong>{field.name}</strong>
                      {(field.helpText ||
                        field.options.length > 0 ||
                        field.key === BRAND_FIELD_KEY) && (
                        <small>
                          {field.key === BRAND_FIELD_KEY &&
                          !field.options.length
                            ? (field.helpText ?? 'From Lot setup › Brands')
                            : field.options.length
                              ? field.options.join(', ')
                              : field.helpText}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className="lv-setup-tag">
                        {categoryFieldTypeLabels[field.type]}
                      </span>
                    </td>
                    <td>
                      <Switch
                        hideLabel
                        label={`${field.name} required`}
                        checked={field.required}
                        disabled={!canEdit}
                        onChange={(required) => update({ required })}
                      />
                    </td>
                    <td>
                      <Switch
                        hideLabel
                        label={`${field.name} shown to buyers`}
                        checked={field.showToBuyers}
                        disabled={!canEdit}
                        onChange={(showToBuyers) => update({ showToBuyers })}
                      />
                    </td>
                    <td>
                      {canEdit && (
                        <button
                          type="button"
                          className="lv-setup-icon-button"
                          aria-label={`Edit ${field.name}`}
                          onClick={() => setEditing({ index })}
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          !inheritsFields && (
            <p className="lv-setup-pad lv-setup-muted">
              No item details yet. Add the fields staff must fill in for this
              category, such as Brand or Model.
            </p>
          )
        )}
        {errorFor(errors, 'fields') && (
          <p className="lv-setup-error lv-setup-pad">
            {errorFor(errors, 'fields')}
          </p>
        )}
      </section>

      {detail && editable && (
        <section
          className="lv-setup-card lv-setup-danger"
          aria-labelledby="cat-delete"
        >
          <div>
            <h3 id="cat-delete">Delete category</h3>
            <p>
              {detail.deleteCheck.allowed
                ? `${detail.name} has no lots, so it can be deleted.`
                : `${detail.name} has ${detail.lots.toLocaleString('en-NG')} ${detail.lots === 1 ? 'lot' : 'lots'}${detail.subcategories ? ` and ${detail.subcategories} subcategories` : ''}. ${detail.deleteCheck.reason} You can also hide it from buyers instead.`}
            </p>
          </div>
          <div className="lv-setup-actions">
            {detail.lots > 0 && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setMoving(true)}
              >
                Move lots
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void action(
                  () =>
                    client.categoryVisibility({
                      id: detail.id,
                      visible: !detail.isVisible,
                      expectedUpdatedAt: detail.updatedAt,
                    }),
                  () => onSaved(detail.id),
                )
              }
            >
              {detail.isVisible ? 'Hide from buyers' : 'Show to buyers'}
            </Button>
            <Button
              variant="danger"
              disabled={busy || !detail.deleteCheck.allowed}
              title={
                detail.deleteCheck.allowed
                  ? undefined
                  : detail.deleteCheck.reason
              }
              onClick={() => {
                if (
                  window.confirm(`Delete ${detail.name}? This can't be undone.`)
                )
                  void action(
                    () =>
                      client.deleteCategory({
                        id: detail.id,
                        expectedUpdatedAt: detail.updatedAt,
                      }),
                    onDeleted,
                  );
              }}
            >
              Delete
            </Button>
          </div>
        </section>
      )}

      {editable && (
        <div className="lv-setup-savebar">
          <p>
            {pending
              ? `${pending} unsaved ${pending === 1 ? 'change' : 'changes'}`
              : detail
                ? 'All changes saved'
                : 'New category'}
          </p>
          <Button
            variant="secondary"
            disabled={busy || (!pending && !onCancel)}
            onClick={() => {
              setDraft(initial);
              setErrors({});
              if (!detail) onCancel?.();
            }}
          >
            {detail ? 'Discard' : 'Cancel'}
          </Button>
          <Button
            busy={busy}
            disabled={!pending && !!detail}
            onClick={() => void save()}
          >
            {detail ? 'Save changes' : 'Create category'}
          </Button>
        </div>
      )}

      {editing && (
        <FieldDialog
          field={
            editing.index === null ? undefined : draft.fields?.[editing.index]
          }
          existing={(draft.fields ?? []).filter((_, i) => i !== editing.index)}
          onClose={() => setEditing(undefined)}
          onRemove={
            editing.index === null
              ? undefined
              : () => {
                  set(
                    'fields',
                    (draft.fields ?? []).filter((_, i) => i !== editing.index),
                  );
                  setEditing(undefined);
                }
          }
          onSave={(field) => {
            const list = draft.fields ?? [];
            set(
              'fields',
              editing.index === null
                ? [...list, field]
                : list.map((f, i) => (i === editing.index ? field : f)),
            );
            setEditing(undefined);
          }}
        />
      )}
      {moving && detail && (
        <MoveLotsDialog
          detail={detail}
          items={items}
          busy={busy}
          onClose={() => setMoving(false)}
          onMove={(targetId) =>
            void action(
              () => client.moveCategoryLots({ id: detail.id, targetId }),
              () => {
                setMoving(false);
                onSaved(detail.id);
              },
            )
          }
        />
      )}
    </div>
  );
}

function FieldDialog({
  field,
  existing,
  onClose,
  onSave,
  onRemove,
}: {
  field?: FieldDraft;
  existing: FieldDraft[];
  onClose: () => void;
  onSave: (field: FieldDraft) => void;
  onRemove?: () => void;
}) {
  const [name, setName] = useState(field?.name ?? '');
  const [type, setType] = useState<FieldDraft['type']>(field?.type ?? 'text');
  const [options, setOptions] = useState(field?.options.join(', ') ?? '');
  const [helpText, setHelpText] = useState(field?.helpText ?? '');
  const [required, setRequired] = useState(field?.required ?? false);
  const [showToBuyers, setShowToBuyers] = useState(field?.showToBuyers ?? true);
  const [error, setError] = useState<FieldErrors>({});
  const keyRef = useRef(field?.key);
  const key = keyRef.current ?? fieldKey(name);
  const list = options
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  function submit() {
    const next: FieldErrors = {};
    if (name.trim().length < 2)
      next.name = 'Give the field a name of at least 2 characters.';
    if (
      existing.some(
        (f) =>
          f.key === key || f.name.toLowerCase() === name.trim().toLowerCase(),
      )
    )
      next.name = 'Another field already uses this name.';
    if (type === 'list' && !list.length && key !== BRAND_FIELD_KEY)
      next.options = 'Add at least one option, separated by commas.';
    setError(next);
    if (Object.keys(next).length) return;
    onSave({
      id: field?.id ?? crypto.randomUUID(),
      name: name.trim(),
      key,
      type,
      options: type === 'list' ? list : [],
      helpText: helpText.trim() || null,
      required,
      showToBuyers,
    });
  }
  return (
    <Dialog
      open
      title={field ? `Edit ${field.name}` : 'Add a field'}
      onClose={onClose}
    >
      <form
        className="lv-setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          label="Field name"
          value={name}
          maxLength={60}
          error={error.name}
          hint={
            field ? undefined : 'e.g. Brand, Model, Storage, Battery health'
          }
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as FieldDraft['type'])}
        >
          {categoryFieldTypes.map((t) => (
            <option key={t} value={t}>
              {categoryFieldTypeLabels[t]}
            </option>
          ))}
        </Select>
        {type === 'list' && (
          <Input
            label="List options"
            value={options}
            error={error.options}
            hint={
              key === BRAND_FIELD_KEY
                ? 'Leave empty to use the brands linked to this category in Lot setup › Brands.'
                : 'Separate options with commas, e.g. 64GB, 128GB, 256GB'
            }
            onChange={(e) => setOptions(e.target.value)}
          />
        )}
        <Input
          label="Help text (optional)"
          value={helpText}
          maxLength={160}
          hint="Shown under the field on the Create lot form."
          onChange={(e) => setHelpText(e.target.value)}
        />
        <Switch label="Required" checked={required} onChange={setRequired} />
        <Switch
          label="Shown to buyers"
          checked={showToBuyers}
          onChange={setShowToBuyers}
        />
        <div className="lv-setup-actions lv-setup-actions--end">
          {onRemove && (
            <Button type="button" variant="ghost" onClick={onRemove}>
              Remove field
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{field ? 'Update field' : 'Add field'}</Button>
        </div>
        <p className="lv-setup-card-note">
          Field changes apply to new lots. Existing lots keep the details they
          were created with.
        </p>
      </form>
    </Dialog>
  );
}

function MoveLotsDialog({
  detail,
  items,
  busy,
  onClose,
  onMove,
}: {
  detail: CategoryDetail;
  items: CategoryTreeItem[];
  busy: boolean;
  onClose: () => void;
  onMove: (targetId: string) => void;
}) {
  const [target, setTarget] = useState('');
  const options = items.filter((i) => i.id !== detail.id);
  const label = (i: CategoryTreeItem) => {
    const parent = items.find((p) => p.id === i.parentId);
    return parent ? `${parent.name} › ${i.name}` : i.name;
  };
  return (
    <Dialog open title={`Move ${detail.name}’s lots`} onClose={onClose}>
      <div className="lv-setup-form">
        <p>
          Move all {detail.lots.toLocaleString('en-NG')}{' '}
          {detail.lots === 1 ? 'lot' : 'lots'} in {detail.name} to another
          category. Subcategory lots stay where they are.
        </p>
        <Select
          label="New category"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">Pick a category</option>
          {options.map((i) => (
            <option key={i.id} value={i.id}>
              {label(i)}
            </option>
          ))}
        </Select>
        <div className="lv-setup-actions lv-setup-actions--end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} disabled={!target} onClick={() => onMove(target)}>
            Move {detail.lots.toLocaleString('en-NG')} lots
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
