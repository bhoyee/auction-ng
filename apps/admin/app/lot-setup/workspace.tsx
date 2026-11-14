'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LotSetupTab } from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { Plus } from '@auction-ng/ui/web/icons';
import { StaffMessage } from '@auction-ng/ui/web/staff-dashboard-view';
import { useLoad, useSetupClient, type SetupContext } from './setup-data';
import { CategoriesTab } from './categories';
import { LocationsTab } from './locations';
import { BinsPage } from './bins';
import { ConditionsTab } from './conditions';
import { SuppliersTab } from './suppliers';
import { BrandsTab } from './brands';
import { DeletionsTab } from './deletions';

const pages: Record<
  LotSetupTab,
  { label: string; title: string; description: string; create?: string }
> = {
  categories: {
    label: 'Categories',
    title: 'Categories',
    description:
      'Categories decide what staff must fill in for a lot, its default run time, and where buyers find it.',
    create: 'New category',
  },
  locations: {
    label: 'Pickup locations',
    title: 'Pickup locations',
    description:
      'Where lots are stored and where buyers collect them. Every lot belongs to one location, and can be put in a bin.',
    create: 'New location',
  },
  conditions: {
    label: 'Conditions',
    title: 'Conditions',
    description:
      'How each item’s condition is described to buyers. Buyers filter the marketplace by these.',
  },
  suppliers: {
    label: 'Suppliers',
    title: 'Suppliers',
    description:
      'Who you buy stock from. Batches and spend link here once inventory batches are recorded.',
    create: 'New supplier',
  },
  brands: {
    label: 'Brands',
    title: 'Brands',
    description:
      'Brands staff pick on the Create lot form. Merge duplicates so buyers find everything in one place.',
    create: 'New brand',
  },
};
const order: LotSetupTab[] = [
  'categories',
  'locations',
  'conditions',
  'suppliers',
  'brands',
];

export type TabActions = { create?: () => void; exportCsv?: () => void };

function readParam(name: string) {
  if (typeof window === 'undefined') return '';
  const value = new URLSearchParams(window.location.search).get(name) ?? '';
  return /^[0-9a-f-]{36}$/i.test(value) ? value : '';
}
function writeParams(values: Record<string, string>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(values))
    if (value) params.set(key, value);
    else params.delete(key);
  history.replaceState(null, '', '?' + params.toString());
}

export function LotSetupWorkspace({
  tab,
  onTab,
  ...props
}: Omit<SetupContext, 'onChanged'> & {
  tab: LotSetupTab;
  onTab: (tab: LotSetupTab) => void;
}) {
  const [countsVersion, setCountsVersion] = useState(0);
  const ctx: SetupContext = {
    ...props,
    onChanged: () => setCountsVersion((v) => v + 1),
  };
  const client = useSetupClient(ctx);
  const summary = useLoad(ctx, () => client.summary(), [countsVersion]);
  const [selected, setSelected] = useState(() => readParam('id'));
  const [binsFor, setBinsFor] = useState(() => readParam('bins'));
  // Deletion history is a read-only view beside the setup tabs.
  const [history, setHistory] = useState(false);
  const actions = useRef<TabActions>({});
  const register = useCallback((next: TabActions) => {
    actions.current = next;
  }, []);
  useEffect(() => {
    writeParams({ id: selected, bins: binsFor });
  }, [selected, binsFor]);
  const select = (id: string) => setSelected(id);
  const switchTab = (next: LotSetupTab) => {
    setSelected('');
    setBinsFor('');
    setHistory(false);
    actions.current = {};
    onTab(next);
  };
  const openHistory = () => {
    setSelected('');
    setBinsFor('');
    actions.current = {};
    setHistory(true);
  };
  if (summary.forbidden)
    return (
      <StaffMessage>
        Your role doesn’t include Lot setup. Ask an admin to add “View Lot
        setup” to your role.
      </StaffMessage>
    );
  if (binsFor && tab === 'locations' && !history)
    return (
      <BinsPage ctx={ctx} locationId={binsFor} onBack={() => setBinsFor('')} />
    );
  const page = history
    ? {
        label: 'Deleted items',
        title: 'Deleted items',
        description:
          'Deleted categories, locations, bins, suppliers and brands. Restore them, or delete them permanently.',
        create: undefined,
      }
    : pages[tab];
  const counts = summary.data;
  return (
    <section className="lv-setup" aria-labelledby="lv-setup-title">
      <header className="lv-setup-head">
        <div>
          <p className="lv-setup-eyebrow">Lot setup</p>
          <h1 id="lv-setup-title">{page.title}</h1>
          <p className="lv-setup-description">{page.description}</p>
        </div>
        <div className="lv-setup-head-actions">
          {!history &&
            (tab === 'categories' ||
              tab === 'locations' ||
              tab === 'suppliers' ||
              tab === 'brands') && (
              <Button
                variant="secondary"
                onClick={() => actions.current.exportCsv?.()}
              >
                Export
              </Button>
            )}
          {!history && page.create && ctx.canManage && (
            <Button onClick={() => actions.current.create?.()}>
              <Plus size={18} aria-hidden="true" /> {page.create}
            </Button>
          )}
        </div>
      </header>
      <nav className="lv-setup-tabs" aria-label="Lot setup sections">
        {order.map((key) => (
          <button
            key={key}
            type="button"
            aria-current={!history && key === tab ? 'page' : undefined}
            onClick={() => switchTab(key)}
          >
            {pages[key].label}
            <span className="lv-setup-tab-count">
              {counts ? counts[key].toLocaleString('en-NG') : '–'}
            </span>
          </button>
        ))}
        <button
          type="button"
          aria-current={history ? 'page' : undefined}
          onClick={openHistory}
        >
          Deleted items
        </button>
      </nav>
      {!ctx.canManage && (
        <p className="lv-setup-readonly" role="note">
          You can view Lot setup. Only admins and ops managers can change it.
        </p>
      )}
      {history && <DeletionsTab ctx={ctx} />}
      {!history && tab === 'categories' && (
        <CategoriesTab
          ctx={ctx}
          selected={selected}
          onSelect={select}
          register={register}
        />
      )}
      {!history && tab === 'locations' && (
        <LocationsTab
          ctx={ctx}
          selected={selected}
          onSelect={select}
          onManageBins={(id) => setBinsFor(id)}
          register={register}
        />
      )}
      {!history && tab === 'conditions' && <ConditionsTab ctx={ctx} />}
      {!history && tab === 'suppliers' && (
        <SuppliersTab ctx={ctx} register={register} />
      )}
      {!history && tab === 'brands' && (
        <BrandsTab ctx={ctx} register={register} />
      )}
    </section>
  );
}
