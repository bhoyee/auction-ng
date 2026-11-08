'use client';
import {
  Activity,
  Archive,
  BarChart3,
  ClipboardList,
  Gavel,
  Headphones,
  LayoutDashboard,
  Package,
  ScanLine,
  Settings,
  ShieldCheck,
  ScrollText,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import type { StaffSection } from '../web/staff-dashboard-view';

type Entry = {
  label: string;
  section?: StaffSection;
  permission: string;
  icon: typeof Package;
  tab?: string;
  action?: string;
};
const groups: { label: string; items: Entry[] }[] = [
  {
    label: '',
    items: [
      {
        label: 'Overview',
        section: 'overview',
        permission: 'dashboard.view',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: 'Auctions',
    items: [
      {
        label: 'Live monitor',
        section: 'live-monitor',
        permission: 'auctions.manage',
        icon: Activity,
      },
      {
        label: 'Publish queue',
        section: 'auctions',
        permission: 'auctions.manage',
        icon: ClipboardList,
      },
      {
        label: 'Lots',
        section: 'inventory',
        permission: 'inventory.read',
        icon: Package,
      },
      {
        label: 'Intake',
        section: 'inventory',
        permission: 'inventory.write',
        action: 'intake',
        icon: ScanLine,
      },
      {
        label: 'Inventory batches',
        permission: 'inventory.write',
        icon: Archive,
      },
      {
        label: 'Bid review',
        section: 'bid-review',
        permission: 'bids.read',
        icon: Gavel,
      },
    ],
  },
  {
    label: 'Orders',
    items: [
      {
        label: 'Invoices',
        section: 'finance',
        tab: 'invoices',
        permission: 'finance.read',
        icon: ClipboardList,
      },
      {
        label: 'Pickup desk',
        section: 'pickup',
        permission: 'pickup.manage',
        icon: ScanLine,
      },
      { label: 'Deliveries', permission: 'pickup.manage', icon: Truck },
    ],
  },
  {
    label: 'Buyers',
    items: [
      {
        label: 'Buyers',
        section: 'buyers',
        permission: 'buyers.read',
        icon: Users,
      },
      {
        label: 'Strikes and fraud',
        permission: 'buyers.manage',
        icon: ShieldCheck,
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        label: 'Finance overview',
        section: 'finance',
        permission: 'finance.read',
        icon: BarChart3,
      },
      { label: 'Wallets and ledger', permission: 'finance.read', icon: Wallet },
      {
        label: 'Refunds and payouts',
        section: 'finance',
        tab: 'withdrawals',
        permission: 'finance.read',
        icon: Wallet,
      },
      { label: 'Expenses', permission: 'finance.read', icon: ClipboardList },
      {
        label: 'Reconciliation',
        permission: 'finance.read',
        icon: ShieldCheck,
      },
    ],
  },
  {
    label: 'Support',
    items: [
      {
        label: 'Tickets',
        section: 'support',
        permission: 'support.manage',
        icon: Headphones,
      },
    ],
  },
  {
    label: 'Insights',
    items: [{ label: 'Reports', permission: 'finance.read', icon: BarChart3 }],
  },
  {
    label: 'Settings',
    items: [
      {
        label: 'Staff and roles',
        section: 'staff',
        permission: 'staff.manage',
        icon: Users,
      },
      {
        label: 'Audit log',
        section: 'audit',
        permission: 'audit.read',
        icon: ScrollText,
      },
      {
        label: 'Fees and rules',
        section: 'finance',
        tab: 'settings',
        permission: 'fees.manage',
        icon: Settings,
      },
      {
        label: 'Archived records',
        section: 'trash',
        permission: 'records.archive',
        icon: Archive,
      },
    ],
  },
];
export function OverviewNavigation({
  permissions,
  onNavigate,
  currentSection = 'overview',
}: {
  currentSection?: StaffSection;
  permissions: readonly string[];
  onNavigate: (section: StaffSection, tab?: string, action?: string) => void;
}) {
  return (
    <nav aria-label="Staff navigation">
      {groups.map((group) => {
        const items = group.items.filter((item) =>
          permissions.includes(item.permission),
        );
        if (
          group.label === 'Auctions' &&
          permissions.includes('setup.manage') &&
          !permissions.includes('inventory.read')
        )
          items.push({
            label: 'Inventory setup',
            section: 'categories',
            permission: 'setup.manage',
            icon: Package,
          });
        if (!items.length) return null;
        return (
          <div className="lv-staff-nav-group" key={group.label}>
            {group.label && <p className="lv-staff-nav-label">{group.label}</p>}
            {items.map((item) => (
              <button
                type="button"
                key={item.label}
                title={
                  item.section
                    ? item.label
                    : item.label + ' · not available yet'
                }
                aria-label={item.label}
                aria-current={
                  item.section === currentSection ? 'page' : undefined
                }
                disabled={!item.section}
                onClick={() =>
                  item.section &&
                  onNavigate(item.section, item.tab, item.action)
                }
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.section && (
                  <span
                    className="lv-admin-nav-count"
                    id={
                      'overview-count-' +
                      item.label.toLowerCase().replaceAll(' ', '-')
                    }
                  />
                )}
                {!item.section && (
                  <small className="lv-admin-nav-planned">Later</small>
                )}
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
