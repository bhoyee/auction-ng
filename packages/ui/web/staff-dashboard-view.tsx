'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
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
  LogOut,
  Settings,
  ArrowUpRight,
  Clock,
  Plus,
  Search,
  ChevronRight,
} from 'lucide-react';
import { BrandLogo } from './brand-logo';
import { Button } from './button';
import {
  formatNaira,
  type StaffDashboard,
  type StaffPermission,
} from '@auction-ng/shared';
const icons = {
  overview: LayoutDashboard,
  inventory: Package,
  auctions: Gavel,
  pickup: MapPin,
  buyers: Users,
  support: Headphones,
  finance: Wallet,
  staff: ShieldCheck,
  audit: ScrollText,
  trash: Archive,
};
export type StaffSection = keyof typeof icons;
export const staffNavigation: {
  id: StaffSection;
  label: string;
  permission: StaffPermission;
}[] = [
  { id: 'overview', label: 'Overview', permission: 'dashboard.view' },
  { id: 'inventory', label: 'Inventory', permission: 'inventory.read' },
  { id: 'auctions', label: 'Auctions', permission: 'auctions.manage' },
  { id: 'pickup', label: 'Pickup desk', permission: 'pickup.manage' },
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
  children,
}: {
  name: string;
  role: string;
  section: StaffSection;
  permissions: readonly string[];
  onNavigate: (s: StaffSection) => void;
  onSignOut: () => void;
  onSecurity: () => void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
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
  const nav = staffNavigation.filter((n) => permissions.includes(n.permission));
  const content = (
    <>
      <div className="lv-staff-brand">
        <BrandLogo />
        <span>Operations workspace</span>
      </div>
      <nav aria-label="Staff navigation">
        {nav.map((item) => {
          const Icon = icons[item.id];
          return (
            <button
              key={item.id}
              type="button"
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => {
                onNavigate(item.id);
                setMenu(false);
              }}
            >
              <Icon size={19} />
              <span>{item.label}</span>
              {section === item.id && <ChevronRight size={15} />}
            </button>
          );
        })}
      </nav>
      <div className="lv-staff-sidebar-bottom">
        <button type="button" onClick={onSecurity}>
          <Settings size={18} />
          Account security
        </button>
        <button type="button" onClick={onSignOut}>
          <LogOut size={18} />
          Sign out
        </button>
        <div className="lv-staff-person">
          <span>{name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{name}</strong>
            <small>{role}</small>
          </div>
        </div>
      </div>
    </>
  );
  return (
    <div className="lv-staff-shell">
      <aside className="lv-staff-sidebar">{content}</aside>
      <div className="lv-staff-main">
        <header className="lv-staff-topbar">
          <Button
            variant="ghost"
            className="lv-staff-menu"
            aria-label="Open staff navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={21} />
          </Button>
          <span>
            Workspace <ChevronRight size={14} />{' '}
            <strong>
              {staffNavigation.find((n) => n.id === section)?.label}
            </strong>
          </span>
          <span className="lv-staff-session">
            <ShieldCheck size={16} />
            Secure staff workspace
          </span>
        </header>
        <main className="lv-staff-content" id="staff-main">
          {children}
        </main>
      </div>
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
}: {
  children: ReactNode;
  tone?: 'error' | 'success' | 'warning';
}) {
  return (
    <div
      className={'lv-staff-message lv-staff-message--' + tone}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
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
export function StaffOverview({
  data,
  onNavigate,
  allowedSections,
}: {
  data: StaffDashboard;
  onNavigate: (section: StaffSection) => void;
  allowedSections: readonly StaffSection[];
}) {
  const m = data.metrics,
    max = Math.max(1, ...data.sales.map((s) => s.amountKobo));
  const points = data.sales.map(
    (s, i) =>
      `${48 + (i / Math.max(1, data.sales.length - 1)) * 660},${220 - (s.amountKobo / max) * 165}`,
  );
  const path = points.length ? 'M' + points.join(' L') : '';
  return (
    <>
      <div className="lv-staff-metrics">
        {[
          {
            label: 'Live auctions',
            value: String(m.live),
            note: `${m.scheduled} scheduled next`,
            icon: Gavel,
            to: 'auctions' as const,
          },
          {
            label: 'Paid sales',
            value: formatNaira(m.paidSalesKobo),
            note: 'Past 14 days · excludes refunded orders',
            icon: Wallet,
            to: 'finance' as const,
          },
          {
            label: 'Awaiting pickup',
            value: String(m.pickup),
            note: 'Paid orders ready for the collection desk',
            icon: Package,
            to: 'pickup' as const,
          },
          {
            label: 'Open conversations',
            value: String(m.support),
            note: 'Open and in-progress support requests',
            icon: Headphones,
            to: 'support' as const,
          },
        ].map((card, i) => (
          <button
            key={card.label}
            className={
              'lv-staff-metric ' + (i === 0 ? 'lv-staff-metric--featured' : '')
            }
            onClick={() => onNavigate(card.to)}
            disabled={!allowedSections.includes(card.to)}
          >
            <div>
              <span>{card.label}</span>
              <card.icon size={20} />
            </div>
            <strong>{card.value}</strong>
            <small>{card.note}</small>
          </button>
        ))}
      </div>
      <div className="lv-staff-charts">
        <section className="lv-staff-panel">
          <div className="lv-staff-panel-title">
            <div>
              <h2>Sales performance</h2>
              <p>Paid order value over the past 14 days</p>
            </div>
            <span className="lv-staff-period">
              <Clock size={14} />
              WAT
            </span>
          </div>
          {data.sales.length ? (
            <>
              <svg
                className="lv-staff-sales-chart"
                viewBox="0 0 760 270"
                role="img"
                aria-label="Paid sales trend; detailed daily totals follow"
              >
                <title>Paid sales by day</title>
                {[55, 110, 165, 220].map((y) => (
                  <line
                    key={y}
                    x1="48"
                    y1={y}
                    x2="708"
                    y2={y}
                    className="lv-staff-chart-grid"
                  />
                ))}
                <path d={path} className="lv-staff-chart-line" />
                {points.map((p, i) => (
                  <circle
                    key={data.sales[i]?.day}
                    cx={p.split(',')[0]}
                    cy={p.split(',')[1]}
                    r="5"
                    className="lv-staff-chart-point"
                  />
                ))}
                <text x="48" y="255">
                  {data.sales[0]?.day}
                </text>
                <text x="708" y="255" textAnchor="end">
                  {data.sales.at(-1)?.day}
                </text>
                <text x="48" y="28">
                  {formatNaira(max)}
                </text>
              </svg>
              <details className="lv-staff-chart-data">
                <summary>View daily totals</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Date (WAT)</th>
                      <th>Orders</th>
                      <th>Paid sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sales.map((r) => (
                      <tr key={r.day}>
                        <td>{r.day}</td>
                        <td>{r.count}</td>
                        <td>{formatNaira(r.amountKobo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <div className="lv-staff-empty">
              <Wallet size={30} />
              <h3>No paid sales in this period</h3>
              <p>
                Confirmed orders will appear here. Wallet deposits are not
                sales.
              </p>
            </div>
          )}
        </section>
        <section className="lv-staff-panel">
          <div className="lv-staff-panel-title">
            <div>
              <h2>Auction pipeline</h2>
              <p>Current inventory by status</p>
            </div>
            <Package size={20} />
          </div>
          <div className="lv-staff-distribution">
            {data.lots.map((r) => (
              <div key={r.status}>
                <div>
                  <StaffBadge status={r.status} />
                  <strong>{r.count}</strong>
                </div>
                <progress
                  value={r.count}
                  max={Math.max(1, ...data.lots.map((l) => l.count))}
                  aria-label={r.status + ' lots'}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="lv-staff-panel">
        <div className="lv-staff-panel-title">
          <div>
            <h2>Keep operations moving</h2>
            <p>Go directly to the work that needs attention.</p>
          </div>
        </div>
        <div className="lv-staff-quick-actions">
          {[
            {
              title: 'Prepare inventory',
              text: `${m.drafts} drafts waiting for photos and scheduling`,
              to: 'inventory' as const,
              icon: Plus,
            },
            {
              title: 'Open the pickup desk',
              text: `${m.pickup} paid orders awaiting collection`,
              to: 'pickup' as const,
              icon: MapPin,
            },
            {
              title: 'Help your buyers',
              text: `${m.support} conversations still open`,
              to: 'support' as const,
              icon: Headphones,
            },
          ]
            .filter((a) => allowedSections.includes(a.to))
            .map((a) => (
              <button key={a.title} onClick={() => onNavigate(a.to)}>
                <a.icon size={22} />
                <span>
                  <strong>{a.title}</strong>
                  <small>{a.text}</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
        </div>
      </section>
    </>
  );
}
export function StaffSearch({
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
}) {
  return (
    <form
      className="lv-staff-search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Search size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button type="submit" size="small">
        Search
      </Button>
    </form>
  );
}
