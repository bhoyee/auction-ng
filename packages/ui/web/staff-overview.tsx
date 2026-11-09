'use client';
import { useLayoutEffect, useRef } from 'react';
import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  Clock,
  Gavel,
  Headphones,
  Package,
  Receipt,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import { formatNaira, type StaffDashboard } from '@auction-ng/shared';
import { PaidSalesChart } from '../charts/paid-sales-chart';
import type { StaffSection } from './staff-dashboard-view';

function KpiValue({ value }: { value: string }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      element.style.fontSize = '';
      const size = Number.parseFloat(getComputedStyle(element).fontSize);
      if (element.scrollWidth > element.clientWidth) {
        element.style.fontSize = `${Math.max(13, Math.floor((size * element.clientWidth) / element.scrollWidth))}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    void document.fonts.ready.then(fit);
    return () => observer.disconnect();
  }, [value]);
  return <strong ref={ref}>{value}</strong>;
}

export function StaffOverview({
  data,
  allowedSections,
  onNavigate,
}: {
  data: StaffDashboard;
  allowedSections: readonly StaffSection[];
  onNavigate: (section: StaffSection) => void;
}) {
  const m = data.metrics;
  const cards = [
    {
      label: 'Paid sales',
      value: formatNaira(m.paidSalesKobo),
      note: 'Paid invoice totals · past 14 days',
      icon: Wallet,
      to: 'finance' as const,
    },
    {
      label: 'Paid orders',
      value: String(m.paidOrders),
      note: 'Past 14 days · excludes refunded orders',
      icon: Receipt,
      to: 'finance' as const,
    },
    {
      label: 'Refunds',
      value: formatNaira(m.refundsKobo),
      note: 'Recorded refunds · past 14 days',
      icon: RotateCcw,
      to: 'finance' as const,
    },
    {
      label: 'Live auctions',
      value: String(m.live),
      note: 'Open and closing lots · now',
      icon: Gavel,
      to: 'auctions' as const,
    },
    {
      label: 'Awaiting pickup',
      value: String(m.pickup),
      note: 'Paid, uncollected pickup orders · now',
      icon: Package,
      to: 'pickup' as const,
    },
    {
      label: 'Open conversations',
      value: String(m.support),
      note: 'Open and in-progress requests · now',
      icon: Headphones,
      to: 'support' as const,
    },
  ];
  const queues = [
    {
      label: 'Inventory drafts',
      count: m.drafts,
      note: 'Review photos and prepare listings',
      to: 'inventory' as const,
      icon: Package,
    },
    {
      label: 'Scheduled auctions',
      count: m.scheduled,
      note: 'Review upcoming lots',
      to: 'auctions' as const,
      icon: CalendarClock,
    },
    {
      label: 'Awaiting pickup',
      count: m.pickup,
      note: 'Open the collection desk',
      to: 'pickup' as const,
      icon: Receipt,
    },
    {
      label: 'Buyer conversations',
      count: m.support,
      note: 'Respond to open requests',
      to: 'support' as const,
      icon: Headphones,
    },
  ].filter((row) => allowedSections.includes(row.to));
  return (
    <div className="lv-overview">
      <div className="lv-overview-context">
        <span>
          <Activity size={15} />
          Operational overview
        </span>
        <span>
          <Clock size={15} />
          Updated{' '}
          {new Date(data.serverTime).toLocaleTimeString('en-NG', {
            timeZone: 'Africa/Lagos',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          WAT
        </span>
      </div>
      <div className="lv-overview-metrics">
        {cards.map((card) => {
          const content = (
            <>
              <div className="lv-overview-kpi-heading">
                <span>{card.label}</span>
                <card.icon size={18} aria-hidden="true" />
              </div>
              <KpiValue value={card.value} />
              <small>{card.note}</small>
            </>
          );
          return allowedSections.includes(card.to) ? (
            <button
              type="button"
              key={card.label}
              className="lv-overview-kpi"
              onClick={() => onNavigate(card.to)}
            >
              {content}
            </button>
          ) : (
            <div key={card.label} className="lv-overview-kpi">
              {content}
            </div>
          );
        })}
      </div>
      <div className="lv-overview-primary">
        <section className="lv-staff-panel lv-overview-panel">
          <div className="lv-staff-panel-title">
            <div>
              <h2>Paid sales trend</h2>
              <p>Past 14 days · paid invoice totals, not net revenue</p>
            </div>
            <span className="lv-overview-period">Daily · WAT</span>
          </div>
          <PaidSalesChart sales={data.sales} />
        </section>
        <section className="lv-staff-panel lv-overview-panel lv-overview-live">
          <div className="lv-staff-panel-title">
            <div>
              <h2>Live right now</h2>
              <p>Current auction activity</p>
            </div>
            <Activity size={20} />
          </div>
          <div className="lv-overview-live-total">
            <strong>{m.live}</strong>
            <span>live auctions</span>
          </div>
          <dl>
            <div>
              <dt>Scheduled next</dt>
              <dd>{m.scheduled}</dd>
            </div>
            <div>
              <dt>Inventory drafts</dt>
              <dd>{m.drafts}</dd>
            </div>
          </dl>
          <p className="lv-overview-live-note">
            {m.live
              ? 'Open and closing listings. Each item runs on its own countdown.'
              : 'No auctions are running right now.'}
          </p>
          {allowedSections.includes('auctions') && (
            <button
              className="lv-overview-action"
              type="button"
              onClick={() => onNavigate('auctions')}
            >
              Manage auctions
              <ArrowUpRight size={17} />
            </button>
          )}
        </section>
      </div>
      <div className="lv-overview-secondary">
        <section className="lv-staff-panel lv-overview-panel">
          <div className="lv-staff-panel-title">
            <div>
              <h2>Inventory pipeline</h2>
              <p>Current, unarchived listings by status</p>
            </div>
            <Package size={20} />
          </div>
          {data.lots.length ? (
            <div className="lv-overview-pipeline">
              {data.lots.map((row) => (
                <div key={row.status}>
                  <div>
                    <span>{row.status.replaceAll('_', ' ')}</span>
                    <strong>{row.count}</strong>
                  </div>
                  <progress
                    aria-label={row.status.replaceAll('_', ' ') + ' listings'}
                    value={row.count}
                    max={Math.max(1, ...data.lots.map((lot) => lot.count))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="lv-overview-empty">
              <Package size={28} />
              <strong>No inventory yet</strong>
              <p>Listings will appear here as stock is added.</p>
            </div>
          )}
        </section>
        <section className="lv-staff-panel lv-overview-panel">
          <div className="lv-staff-panel-title">
            <div>
              <h2>Work queues</h2>
              <p>Your next operational actions</p>
            </div>
            <Receipt size={20} />
          </div>
          <div className="lv-overview-queues">
            {queues.map((row) => (
              <button
                type="button"
                key={row.label}
                onClick={() => onNavigate(row.to)}
              >
                <row.icon size={19} aria-hidden="true" />
                <span>
                  <strong>{row.label}</strong>
                  <small>{row.note}</small>
                </span>
                <b>{row.count}</b>
                <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            ))}
            {!queues.length && (
              <p>No operational queues are assigned to your role.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
