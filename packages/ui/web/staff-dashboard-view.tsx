'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Activity,
  Package,
  Gavel,
  MapPin,
  Users,
  Headphones,
  Wallet,
  ShieldCheck,
  ScrollText,
  Archive,
  Menu,
  X,
  Tags,
  Building2,
  Search,
  ChevronRight,
  ScanLine,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Dialog } from './dialog';
import { OverviewNavigation } from '../admin/overview-navigation';
import { BrandLogo } from './brand-logo';
import { StaffAccountMenu } from './staff-account-menu';
import { Button } from './button';
import { type StaffPermission } from '@auction-ng/shared';
const icons = {
  overview: LayoutDashboard,
  'live-monitor': Activity,
  inventory: Package,
  auctions: Gavel,
  'bid-review': ScrollText,
  pickup: MapPin,
  buyers: Users,
  support: Headphones,
  finance: Wallet,
  staff: ShieldCheck,
  audit: ScrollText,
  trash: Archive,
  categories: Tags,
  centres: Building2,
};
export type StaffSection = keyof typeof icons;
export type StaffQuickResult = {
  id: string;
  label: string;
  hint: string;
  section: StaffSection;
  search: string;
  tab?: string;
};
const inventorySections: readonly StaffSection[] = [
  'inventory',
  'categories',
  'centres',
];
export function StaffInventoryNavigation({
  section,
  permissions,
  onNavigate,
}: {
  section: StaffSection;
  permissions: readonly string[];
  onNavigate: (s: StaffSection) => void;
}) {
  if (!inventorySections.includes(section)) return null;
  return (
    <nav className="lv-staff-inventory-nav" aria-label="Inventory sections">
      {inventorySections
        .map((id) => staffNavigation.find((n) => n.id === id))
        .filter((n) => n && permissions.includes(n.permission))
        .map((item) => {
          if (!item) return null;
          const Icon = icons[item.id];
          return (
            <Button
              key={item.id}
              variant={section === item.id ? 'primary' : 'secondary'}
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={18} />
              {item.id === 'inventory' ? 'Items' : item.label}
            </Button>
          );
        })}
    </nav>
  );
}
export const staffNavigation: {
  id: StaffSection;
  label: string;
  permission: StaffPermission;
}[] = [
  { id: 'overview', label: 'Overview', permission: 'dashboard.view' },
  { id: 'live-monitor', label: 'Live monitor', permission: 'auctions.manage' },
  { id: 'inventory', label: 'Inventory', permission: 'inventory.read' },
  { id: 'auctions', label: 'Auctions', permission: 'auctions.manage' },
  { id: 'bid-review', label: 'Bid review', permission: 'bids.read' },
  { id: 'pickup', label: 'Pickup desk', permission: 'pickup.manage' },
  { id: 'categories', label: 'Categories', permission: 'setup.manage' },
  { id: 'centres', label: 'Pickup centres', permission: 'setup.manage' },
  { id: 'buyers', label: 'Buyers', permission: 'buyers.read' },
  { id: 'support', label: 'Customer support', permission: 'support.manage' },
  { id: 'finance', label: 'Finance', permission: 'finance.read' },
  { id: 'staff', label: 'Staff & roles', permission: 'staff.manage' },
  { id: 'audit', label: 'Audit log', permission: 'audit.read' },
  { id: 'trash', label: 'Archived records', permission: 'records.archive' },
];
export function StaffShell({
  name,
  role,
  section,
  permissions,
  onNavigate,
  onSignOut,
  onSecurity,
  onProfile,
  onPreferences,
  children,
  notifications,
  overviewMode = false,
  overviewStatus,
  onOverviewNavigate,
  onOverviewSearch,
  onOverviewSelect,
}: {
  name: string;
  role: string;
  section: StaffSection;
  permissions: readonly string[];
  onNavigate: (s: StaffSection) => void;
  onSignOut: () => void;
  onSecurity: () => void;
  onProfile: () => void;
  onPreferences: () => void;
  children: ReactNode;
  notifications?: ReactNode;
  overviewMode?: boolean;
  overviewStatus?: ReactNode;
  onOverviewNavigate?: (
    section: StaffSection,
    tab?: string,
    action?: string,
  ) => void;
  onOverviewSearch?: (query: string) => Promise<StaffQuickResult[]>;
  onOverviewSelect?: (result: StaffQuickResult) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [quick, setQuick] = useState<{
    key: string;
    items: StaffQuickResult[];
    loading: boolean;
    error: boolean;
  }>({ key: '', items: [], loading: false, error: false });
  const quickKey = commandQuery.trim() + ':' + permissions.join(',');
  useEffect(() => {
    if (!commandsOpen || !onOverviewSearch || commandQuery.trim().length < 2)
      return;
    let active = true;
    const timer = setTimeout(() => {
      setQuick({ key: quickKey, items: [], loading: true, error: false });
      void onOverviewSearch(commandQuery.trim())
        .then((items) => {
          if (active)
            setQuick({ key: quickKey, items, loading: false, error: false });
        })
        .catch(() => {
          if (active)
            setQuick({ key: quickKey, items: [], loading: false, error: true });
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [commandsOpen, commandQuery, onOverviewSearch, quickKey]);
  const commandTrigger = useRef<HTMLButtonElement>(null);
  const globalInput = useRef<HTMLInputElement>(null);
  const globalSearch = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!globalSearch.current?.contains(event.target as Node))
        setCommandsOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        // Do not open a second modal over a protected confirmation or form.
        if (document.querySelector('dialog[open]') && !commandsOpen) return;
        event.preventDefault();
        if (onOverviewSearch) {
          globalInput.current?.focus();
          setCommandsOpen(true);
          return;
        }
        setMenu(false);
        setCommandQuery('');
        setCommandsOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [commandsOpen, onOverviewSearch]);
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawer.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
      if (event.key !== 'Tab') return;
      const buttons = Array.from(
        drawer.current?.querySelectorAll<HTMLButtonElement>(
          'button:not(:disabled)',
        ) ?? [],
      );
      const first = buttons[0],
        last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [menu]);
  const inventoryTarget: StaffSection | undefined = permissions.includes(
    'inventory.read',
  )
    ? 'inventory'
    : permissions.includes('setup.manage')
      ? 'categories'
      : undefined;
  const nav = staffNavigation.filter(
    (n) =>
      n.id !== 'categories' &&
      n.id !== 'centres' &&
      (n.id === 'inventory'
        ? !!inventoryTarget
        : permissions.includes(n.permission)),
  );
  const content = (
    <>
      <div className="lv-staff-brand">
        {overviewMode ? (
          <>
            <BrandLogo />
            <span className="lv-admin-role-badge">{role}</span>
          </>
        ) : (
          <>
            <BrandLogo />
            <span>Operations workspace</span>
          </>
        )}
      </div>
      {overviewMode ? (
        <OverviewNavigation
          currentSection={section}
          permissions={permissions}
          onNavigate={(next, tab, action) => {
            (onOverviewNavigate ?? onNavigate)(next, tab, action);
            setMenu(false);
          }}
        />
      ) : (
        <nav aria-label="Staff navigation">
          {[
            { label: 'Workspace', ids: ['overview'] },
            { label: 'Auctions', ids: ['inventory', 'auctions', 'bid-review'] },
            { label: 'Orders', ids: ['pickup'] },
            { label: 'Buyers & support', ids: ['buyers', 'support'] },
            { label: 'Finance', ids: ['finance'] },
            { label: 'Administration', ids: ['staff', 'audit', 'trash'] },
          ].map((group) => {
            const items = nav.filter((item) => group.ids.includes(item.id));
            if (!items.length) return null;
            return (
              <div className="lv-staff-nav-group" key={group.label}>
                <p className="lv-staff-nav-label">{group.label}</p>
                {items.map((item) => {
                  const Icon = icons[item.id];
                  const active =
                    item.id === 'inventory'
                      ? inventorySections.includes(section)
                      : section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      aria-label={item.label}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        onNavigate(
                          item.id === 'inventory' && inventoryTarget
                            ? inventoryTarget
                            : item.id,
                        );
                        setMenu(false);
                      }}
                    >
                      <Icon size={19} />
                      <span>{item.label}</span>
                      {active && <ChevronRight size={15} />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      )}
      <div className="lv-staff-sidebar-caption">LotVanta · Staff portal</div>
    </>
  );
  return (
    <div
      className={
        'lv-staff-shell' +
        (collapsed ? ' lv-staff-shell--collapsed' : '') +
        (overviewMode ? ' lv-admin-overview-shell' : '')
      }
    >
      <a className="lv-staff-skip" href="#staff-main">
        Skip to content
      </a>
      <aside className="lv-staff-sidebar">{content}</aside>
      <div className="lv-staff-main">
        <header className="lv-staff-topbar">
          <Button
            variant="ghost"
            className="lv-staff-collapse"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <PanelLeftOpen size={20} />
            ) : (
              <PanelLeftClose size={20} />
            )}
          </Button>
          <Button
            variant="ghost"
            className="lv-staff-menu"
            aria-label="Open staff navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={21} />
          </Button>
          <span className="lv-staff-breadcrumb">
            <strong>
              {staffNavigation.find((n) => n.id === section)?.label}
            </strong>
          </span>
          {onOverviewSearch ? (
            <div className="lv-staff-global-search" ref={globalSearch}>
              <Search size={18} aria-hidden="true" />
              <input
                ref={globalInput}
                type="search"
                aria-label="Search workspace"
                placeholder="Search the staff portal…"
                maxLength={120}
                value={commandQuery}
                onFocus={() => setCommandsOpen(true)}
                onChange={(event) => {
                  setCommandQuery(event.target.value);
                  setCommandsOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setCommandsOpen(false);
                    globalInput.current?.blur();
                  }
                }}
                aria-expanded={commandsOpen}
                aria-controls="staff-global-results"
              />
              {commandsOpen && (
                <div
                  id="staff-global-results"
                  className="lv-staff-global-results lv-staff-command-results"
                  aria-label="Workspace search results"
                >
                  {commandQuery.trim().length < 2 ? (
                    <p>
                      Type at least two characters to search records and pages
                      you can access.
                    </p>
                  ) : (
                    <>
                      {quick.key === quickKey &&
                        quick.items.map((result) => (
                          <button
                            type="button"
                            key={
                              result.section + result.id + (result.tab ?? '')
                            }
                            onClick={() => {
                              onOverviewSelect?.(result);
                              setCommandsOpen(false);
                              setCommandQuery('');
                            }}
                          >
                            <Search size={18} />
                            <span>
                              <strong>{result.label}</strong>
                              <small className="lv-admin-quick-hint">
                                {result.hint}
                              </small>
                            </span>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                      {quick.key !== quickKey || quick.loading ? (
                        <p role="status">Searching permitted records…</p>
                      ) : quick.error ? (
                        <p role="alert">
                          Search could not be completed. Check your connection
                          and try again.
                        </p>
                      ) : !quick.items.length ? (
                        <p role="status">
                          No matching records. Try a name or reference.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              ref={commandTrigger}
              aria-label="Find a section"
              className="lv-staff-command-trigger"
              onClick={() => {
                setCommandQuery('');
                setCommandsOpen(true);
              }}
            >
              <Search size={18} />
              <span>Find a section…</span>
              <kbd>Ctrl / ⌘ K</kbd>
            </button>
          )}
          {overviewMode && (
            <div id="staff-overview-live-status">{overviewStatus}</div>
          )}
          <div className="lv-staff-header-actions">
            {notifications}
            <StaffAccountMenu
              name={name}
              role={role}
              onProfile={onProfile}
              onSecurity={onSecurity}
              onPreferences={onPreferences}
              onSignOut={onSignOut}
            />
          </div>
        </header>
        <main className="lv-staff-content" id="staff-main" tabIndex={-1}>
          {children}
        </main>
        <footer className="lv-staff-footer" aria-label="Staff portal footer">
          <span>© {new Date().getFullYear()} LotVanta · Staff portal</span>
          <div>
            <span>Times shown in WAT</span>
            <a
              href="https://giddyhost.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Powered by <strong>GiddyHost</strong>
            </a>
          </div>
        </footer>
      </div>
      <Dialog
        open={commandsOpen && !onOverviewSearch}
        title="Go to a section"
        onClose={() => {
          setCommandsOpen(false);
          commandTrigger.current?.focus();
        }}
      >
        <div className="lv-staff-command">
          <label htmlFor="staff-command-query">
            {overviewMode
              ? 'Search records and available sections'
              : 'Search available sections'}
          </label>
          <input
            id="staff-command-query"
            type="search"
            autoFocus
            maxLength={120}
            value={commandQuery}
            placeholder={
              overviewMode
                ? 'Lot reference, buyer name or invoice number…'
                : 'Inventory, pickup desk, bid review…'
            }
            onChange={(event) => setCommandQuery(event.target.value)}
          />
          <div className="lv-staff-command-results">
            {overviewMode &&
              quick.key === quickKey &&
              quick.items.map((result) => (
                <button
                  type="button"
                  key={result.section + result.id}
                  onClick={() => {
                    onOverviewSelect?.(result);
                    setCommandsOpen(false);
                    commandTrigger.current?.focus();
                  }}
                >
                  <Search size={18} />
                  <span>
                    <strong>{result.label}</strong>
                    <small className="lv-admin-quick-hint">{result.hint}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            {overviewMode && quick.key === quickKey && quick.loading && (
              <p role="status">Searching permitted records…</p>
            )}
            {overviewMode && quick.key === quickKey && quick.error && (
              <p role="alert">
                Record search could not be completed. Check your connection and
                try again.
              </p>
            )}
            {nav
              .filter((item) =>
                item.label
                  .toLowerCase()
                  .includes(commandQuery.trim().toLowerCase()),
              )
              .map((item) => {
                const Icon = icons[item.id];
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setCommandsOpen(false);
                      onNavigate(
                        item.id === 'inventory' && inventoryTarget
                          ? inventoryTarget
                          : item.id,
                      );
                      commandTrigger.current?.focus();
                    }}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{item.label}</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                );
              })}
            {!(
              overviewMode &&
              quick.key === quickKey &&
              (quick.items.length > 0 || quick.loading)
            ) &&
              !nav.some((item) =>
                item.label
                  .toLowerCase()
                  .includes(commandQuery.trim().toLowerCase()),
              ) && <p role="status">No matching sections. Try another name.</p>}
          </div>
        </div>
      </Dialog>
      {menu && (
        <div
          className="lv-staff-mobile-backdrop"
          onClick={() => setMenu(false)}
        >
          <aside
            ref={drawer}
            role="dialog"
            aria-modal="true"
            className="lv-staff-sidebar lv-staff-sidebar--mobile"
            aria-label="Staff navigation"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              className="lv-staff-close"
              aria-label="Close navigation"
              onClick={() => setMenu(false)}
            >
              <X size={20} />
            </Button>
            {content}
          </aside>
        </div>
      )}
    </div>
  );
}
export function StaffPickupDeskAction({
  onClick,
  prominent = false,
}: {
  onClick: () => void;
  prominent?: boolean;
}) {
  return (
    <Button
      className={
        'lv-staff-checkin-action' +
        (prominent ? ' lv-staff-checkin-action--prominent' : '')
      }
      onClick={onClick}
    >
      <ScanLine size={18} aria-hidden="true" />
      Check in a buyer
    </Button>
  );
}
export function StaffHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="lv-staff-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="lv-staff-heading-actions">{children}</div>
    </div>
  );
}
export function StaffMessage({
  children,
  tone = 'error',
  onDismiss,
}: {
  children: ReactNode;
  tone?: 'error' | 'success' | 'warning';
  onDismiss?: () => void;
}) {
  return (
    <div
      className={
        'lv-staff-message lv-staff-message--' +
        tone +
        (onDismiss ? ' lv-staff-message--dismissible' : '')
      }
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {onDismiss ? (
        <>
          <div className="lv-staff-message-body">{children}</div>
          <button
            type="button"
            className="lv-staff-message-close"
            aria-label="Dismiss notification"
            onClick={onDismiss}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </>
      ) : (
        children
      )}
    </div>
  );
}
export function StaffBadge({ status }: { status: string }) {
  const good = ['paid', 'success', 'active', 'collected', 'ready', 'Core role'];
  const bad = [
    'cancelled',
    'failed',
    'refunded',
    'suspended',
    'damaged',
    'rejected',
  ];
  const waiting = [
    'pending',
    'draft',
    'scheduled',
    'review',
    'open',
    'in_progress',
  ];
  const tone = good.includes(status)
    ? 'success'
    : bad.includes(status)
      ? 'danger'
      : waiting.includes(status)
        ? 'warning'
        : 'neutral';
  return (
    <span className={'lv-staff-badge lv-staff-badge--' + tone}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
export function StaffSearch({
  value,
  onChange,
  onSearch,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: (query: string) => void;
  placeholder: string;
}) {
  const callback = useRef(onSearch);
  const field = useRef<HTMLInputElement>(null);
  callback.current = onSearch;
  const [composing, setComposing] = useState(false),
    [applied, setApplied] = useState(value.trim());
  const previous = useRef(value.trim()),
    current = useRef({ value, composing });
  current.current = { value, composing };
  useEffect(() => {
    if (composing || value.trim() === previous.current) return;
    const timer = setTimeout(() => {
      if (current.current.value !== value || current.current.composing) return;
      const query = value.trim();
      if (query === previous.current) return;
      previous.current = query;
      setApplied(query);
      callback.current(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [value, composing]);
  const flush = (query: string) => {
    previous.current = query;
    setApplied(query);
    callback.current(query);
  };
  return (
    <form
      className="lv-staff-search"
      role="search"
      aria-label="Search staff records"
      aria-busy={value.trim() !== applied}
      onSubmit={(e) => {
        e.preventDefault();
        if (!composing) flush(value.trim());
      }}
    >
      <Search size={18} />
      <input
        ref={field}
        type="search"
        maxLength={120}
        autoComplete="off"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
      />
      {value && (
        <Button
          type="button"
          size="small"
          variant="ghost"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            setComposing(false);
            flush('');
            field.current?.focus();
          }}
        >
          <X size={18} />
        </Button>
      )}
      <span className="sr-only" role="status">
        {value.trim() !== applied
          ? 'Filtering records…'
          : 'Results update as you type.'}
      </span>
    </form>
  );
}
