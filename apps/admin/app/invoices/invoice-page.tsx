'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { refundReasonLabels, type InvoiceView } from '@auction-ng/shared';
import type { InvoicesClient } from '@auction-ng/api-client/invoices';
import { Button } from '@auction-ng/ui/web/button';
import {
  Download,
  ImageOff,
  MoreHorizontal,
  Printer,
  Send,
} from '@auction-ng/ui/web/icons';
import { productImageSource } from '@auction-ng/ui/web/demo-image';
import { openStaffPage } from '../batches/batches-area';
import { LoadState, useBatchLoad } from '../batches/batch-ui';
import { PendingRefund, useInvoiceActions } from './invoice-actions';
import {
  lotsText,
  money,
  onDay,
  PaymentBadge,
  PickupBadge,
  ratePercent,
  when,
} from './invoice-ui';

type Tab = 'payments' | 'refunds' | 'messages' | 'notes' | 'activity';

/** A small menu that closes on an outside click or Escape. */
function Menu({
  label,
  items,
}: {
  label: string;
  items: { label: string; onClick: () => void; disabled?: boolean }[];
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node))
        ref.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return (
    <details
      ref={ref}
      className="lv-inv-menu"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.currentTarget.open = false;
        e.currentTarget.querySelector('summary')?.focus();
      }}
    >
      <summary aria-label={label}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </summary>
      <div>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (ref.current) ref.current.open = false;
              item.onClick();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}

export function InvoicePage({
  number,
  client,
  onBack,
}: {
  number: string;
  client: InvoicesClient;
  onBack: () => void;
}) {
  const read = useBatchLoad(() => client.view(number), [client, number]);
  const invoice = read.data;
  const actions = useInvoiceActions(invoice, client, read.reload);
  const [tab, setTab] = useState<Tab>('payments');
  const [openLine, setOpenLine] = useState('');
  const [copied, setCopied] = useState(false);
  const crumb = (
    <nav className="lv-setup-breadcrumb" aria-label="Breadcrumb">
      <button type="button" className="lv-setup-link" onClick={onBack}>
        Invoices
      </button>{' '}
      › <span aria-current="page">{number}</span>
    </nav>
  );
  if (!invoice)
    return (
      <section className="lv-batches">
        {crumb}
        <div className="lv-setup-card">
          <LoadState error={read.error} onRetry={read.reload} />
        </div>
      </section>
    );
  const { access } = invoice;
  const fees = invoice.premiumKobo + invoice.lotFeeKobo + invoice.vatKobo;
  const tabs: [Tab, string, number][] = [
    ['payments', 'Payments', invoice.payments.length],
    ['refunds', 'Refunds', invoice.refunds.length],
    ['messages', 'Messages', invoice.messages.length],
    ['notes', 'Notes', invoice.notes.length],
    ['activity', 'Activity', invoice.activity.length],
  ];
  return (
    <section className="lv-batches lv-inv-page" aria-labelledby="lv-inv-number">
      {crumb}
      <header className="lv-setup-head">
        <div>
          <h1 id="lv-inv-number">
            {invoice.number} <PaymentBadge state={invoice.payment} />{' '}
            {invoice.pickup && <PickupBadge state={invoice.pickup.state} />}
          </h1>
          <p className="lv-setup-description">
            {lotsText(invoice.lines.length)} · issued {when(invoice.issuedAt)}
            {invoice.pickup && ` · ${invoice.pickup.locationName}`}
          </p>
        </div>
        <div className="lv-setup-head-actions">
          <Button
            variant="secondary"
            busy={actions.busy}
            onClick={actions.download}
          >
            <Download size={16} aria-hidden="true" /> Download PDF
          </Button>
          <Button
            variant="secondary"
            disabled={actions.busy}
            onClick={actions.print}
          >
            <Printer size={16} aria-hidden="true" /> Print
          </Button>
          {access.canManage && (
            <Button
              variant="secondary"
              onClick={() => actions.open({ kind: 'resend' })}
            >
              <Send size={16} aria-hidden="true" /> Resend to buyer
            </Button>
          )}
          {access.canRequestRefund && (
            <Button
              disabled={!!invoice.refundBlocked}
              title={invoice.refundBlocked ?? undefined}
              onClick={() => actions.open({ kind: 'refund' })}
            >
              Request refund
            </Button>
          )}
          <Menu
            label="More actions"
            items={[
              ...(access.canDispute
                ? [
                    {
                      label: 'Open dispute',
                      disabled: invoice.payment === 'disputed',
                      onClick: () => actions.open({ kind: 'dispute' as const }),
                    },
                  ]
                : []),
              ...(access.canManage
                ? [
                    {
                      label: 'Add note',
                      onClick: () => actions.open({ kind: 'note' as const }),
                    },
                  ]
                : []),
              {
                label: 'Combined receipt',
                onClick: () => actions.open({ kind: 'receipt' }),
              },
              {
                label: copied ? 'Link copied' : 'Copy link',
                onClick: () => {
                  void navigator.clipboard
                    .writeText(window.location.href)
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    })
                    .catch(() => undefined);
                },
              },
            ]}
          />
        </div>
      </header>
      {actions.messages}
      {read.error && (
        <p className="lv-setup-inline-note" role="status">
          Couldn’t refresh. Showing the last details.
        </p>
      )}
      <PendingRefund
        invoice={invoice}
        onDecide={(refund, approve) =>
          actions.open({ kind: 'decide', refund, approve })
        }
      />
      <div className="lv-batch-kpis">
        <div className="lv-batch-kpi">
          <span>Total</span>
          <b>{money(invoice.totalKobo)}</b>
          <small>
            {invoice.saleType === 'fixed_price' ? 'price' : 'hammer'}{' '}
            {money(invoice.hammerKobo)} + fees {money(fees)}
          </small>
        </div>
        <div className="lv-batch-kpi">
          <span>Paid</span>
          <b className="lv-inv-green">{money(invoice.paidKobo)}</b>
          <small>
            {invoice.paidKobo
              ? invoice.saleType === 'fixed_price'
                ? 'from wallet, at checkout'
                : 'from wallet, when it ended'
              : 'not paid'}
          </small>
        </div>
        <div className="lv-batch-kpi">
          <span>Refunded</span>
          <b>{money(invoice.refundedKobo)}</b>
          <small>
            {invoice.refundedKobo ? 'to the buyer’s wallet' : 'no refunds'}
          </small>
        </div>
        <CollectBy invoice={invoice} />
      </div>
      <div className="lv-inv-columns">
        <div className="lv-setup-stack">
          <section className="lv-setup-card lv-setup-card--flush">
            <div className="lv-batch-card-head">
              <div>
                <h2>Lots on this invoice</h2>
                <p>
                  {invoice.saleType === 'fixed_price'
                    ? 'Buy now price plus tax.'
                    : 'Hammer, buyer’s premium, lot fee and VAT on both. Click a lot for its breakdown.'}
                </p>
              </div>
            </div>
            <div className="lv-setup-scroll">
              <table className="lv-setup-table lv-batch-table">
                <thead>
                  <tr>
                    <th scope="col">Lot</th>
                    <th scope="col" className="lv-setup-right">
                      Hammer
                    </th>
                    <th scope="col" className="lv-setup-right">
                      Fees + VAT
                    </th>
                    <th scope="col" className="lv-setup-right">
                      Total
                    </th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((l) => (
                    <Fragment key={l.id}>
                      <tr
                        onClick={() =>
                          setOpenLine(openLine === l.id ? '' : l.id)
                        }
                      >
                        <td>
                          <span className="lv-inv-lot">
                            <span className="lv-inv-thumb">
                              {l.thumbnailUrl ? (
                                <img
                                  src={productImageSource(l.thumbnailUrl)}
                                  alt=""
                                  width={40}
                                  height={40}
                                  loading="lazy"
                                />
                              ) : (
                                <ImageOff size={16} aria-hidden="true" />
                              )}
                            </span>
                            <span>
                              <button
                                type="button"
                                className="lv-inv-title"
                                aria-expanded={openLine === l.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenLine(openLine === l.id ? '' : l.id);
                                }}
                              >
                                {l.title}
                              </button>
                              <small>
                                {l.lotNumber} · won {when(l.wonAt)}
                                {l.binCode && ` · bin ${l.binCode}`}
                              </small>
                            </span>
                          </span>
                        </td>
                        <td className="lv-setup-right">
                          {money(l.hammerKobo)}
                        </td>
                        <td className="lv-setup-right">
                          {money(l.premiumKobo + l.lotFeeKobo + l.vatKobo)}
                        </td>
                        <td className="lv-setup-right">
                          <b>{money(l.totalKobo)}</b>
                          {l.refundedKobo > 0 && (
                            <small>{money(l.refundedKobo)} refunded</small>
                          )}
                        </td>
                        <td className="lv-setup-right">
                          <Menu
                            label={`Actions for ${l.lotNumber}`}
                            items={[
                              {
                                label: 'View lot',
                                onClick: () =>
                                  openStaffPage(
                                    'inventory',
                                    `/lots/${l.lotId}`,
                                  ),
                              },
                              ...(access.canRequestRefund
                                ? [
                                    {
                                      label: 'Refund this lot',
                                      disabled:
                                        !!invoice.refundBlocked ||
                                        l.refundedKobo >= l.totalKobo,
                                      onClick: () =>
                                        actions.open({
                                          kind: 'refund' as const,
                                          lineId: l.id,
                                        }),
                                    },
                                  ]
                                : []),
                              ...(access.canDispute
                                ? [
                                    {
                                      label: 'Mark not as described',
                                      disabled: invoice.payment === 'disputed',
                                      onClick: () =>
                                        actions.open({
                                          kind: 'dispute' as const,
                                        }),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </td>
                      </tr>
                      {openLine === l.id && (
                        <tr className="lv-inv-breakdown">
                          <td colSpan={5}>
                            <dl>
                              <div>
                                <dt>Buyer’s premium</dt>
                                <dd>{money(l.premiumKobo)}</dd>
                              </div>
                              <div>
                                <dt>Lot fee</dt>
                                <dd>{money(l.lotFeeKobo)}</dd>
                              </div>
                              <div>
                                <dt>
                                  {invoice.saleType === 'fixed_price'
                                    ? 'Tax'
                                    : 'VAT on fees'}
                                </dt>
                                <dd>{money(l.vatKobo)}</dd>
                              </div>
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{lotsText(invoice.lines.length)}</th>
                    <td className="lv-setup-right">
                      <b>{money(invoice.hammerKobo)}</b>
                    </td>
                    <td className="lv-setup-right">
                      <b>{money(fees)}</b>
                    </td>
                    <td className="lv-setup-right">
                      <b>{money(invoice.totalKobo)}</b>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
          <section className="lv-setup-card lv-setup-card--flush">
            <nav
              className="lv-setup-tabs lv-batch-tabs"
              aria-label="Invoice records"
            >
              {tabs.map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  aria-current={key === tab ? 'page' : undefined}
                  onClick={() => setTab(key)}
                >
                  {label}
                  <span className="lv-setup-tab-count">{count}</span>
                </button>
              ))}
            </nav>
            <Records
              tab={tab}
              invoice={invoice}
              onNote={() => actions.open({ kind: 'note' })}
            />
          </section>
        </div>
        <aside className="lv-setup-stack">
          <BuyerCard invoice={invoice} />
          <Summary invoice={invoice} />
          <PickupCard invoice={invoice} />
          <section className="lv-setup-card">
            <h2>Timeline</h2>
            <ol className="lv-inv-timeline">
              {invoice.timeline.map((t) => (
                <li key={t.label} data-done={t.at ? '' : undefined}>
                  <b>{t.label}</b>
                  <small>
                    {t.at && `${when(t.at)} · `}
                    {t.detail}
                  </small>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
      {actions.dialogs}
    </section>
  );
}

function CollectBy({ invoice }: { invoice: InvoiceView }) {
  const p = invoice.pickup;
  return (
    <div className="lv-batch-kpi">
      <span>Collect by</span>
      <b>
        {p?.collectedAt
          ? 'Collected'
          : p?.state === 'cancelled'
            ? 'Cancelled'
            : p?.dueAt
              ? onDay(p.dueAt)
              : '—'}
      </b>
      <small>
        {p?.collectedAt
          ? when(p.collectedAt)
          : p?.dueAt && p.dailyKobo && !p.storageWaived
            ? `then ${money(p.dailyKobo)} per working day storage`
            : p?.storageWaived
              ? 'storage waived'
              : 'starts when the item is ready on the shelf'}
      </small>
    </div>
  );
}

function BuyerCard({ invoice }: { invoice: InvoiceView }) {
  const b = invoice.buyer;
  const initials = b.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <section className="lv-setup-card">
      <div className="lv-inv-card-head">
        <h2>Buyer</h2>
        <button
          type="button"
          className="lv-setup-link"
          onClick={() =>
            openStaffPage(
              'buyers',
              `/?section=buyers&search=${encodeURIComponent(b.name)}`,
            )
          }
        >
          View buyer
        </button>
      </div>
      <div className="lv-inv-buyer">
        <span aria-hidden="true">{initials}</span>
        <div>
          <b>{b.name}</b>
          <small>{[b.phone, b.email].filter(Boolean).join(' · ')}</small>
        </div>
      </div>
      <div className="lv-setup-chip-row">
        <span className="lv-setup-tag">
          {b.wins} {b.wins === 1 ? 'win' : 'wins'}
        </span>
        <span className="lv-setup-tag">
          {b.strikes} {b.strikes === 1 ? 'strike' : 'strikes'}
        </span>
        <span className="lv-setup-tag">Wallet {money(b.walletKobo)}</span>
      </div>
    </section>
  );
}

function Summary({ invoice }: { invoice: InvoiceView }) {
  const auction = invoice.saleType === 'auction';
  const rows: [string, string, number][] = [
    [auction ? 'Hammer total' : 'Item price', '', invoice.hammerKobo],
    ...(auction
      ? ([
          [
            'Buyer’s premium',
            ratePercent(invoice.premiumBps),
            invoice.premiumKobo,
          ],
          ['Lot fees', `${invoice.lines.length} ×`, invoice.lotFeeKobo],
        ] as [string, string, number][])
      : []),
    [
      auction ? 'VAT on fees' : 'Tax',
      ratePercent(invoice.vatBps),
      invoice.vatKobo,
    ],
  ];
  return (
    <section className="lv-setup-card lv-inv-summary">
      <h2>Summary</h2>
      <dl>
        {rows.map(([label, hint, value]) => (
          <div key={label}>
            <dt>
              {label} {hint && <small>{hint}</small>}
            </dt>
            <dd>{money(value)}</dd>
          </div>
        ))}
        <div data-total="">
          <dt>Total</dt>
          <dd>{money(invoice.totalKobo)}</dd>
        </div>
        <div>
          <dt>Paid</dt>
          <dd>{money(invoice.paidKobo)}</dd>
        </div>
        <div>
          <dt>Refunded</dt>
          <dd>{money(invoice.refundedKobo)}</dd>
        </div>
        <div data-balance={invoice.balanceKobo ? 'due' : 'clear'}>
          <dt>Balance</dt>
          <dd>{money(invoice.balanceKobo)}</dd>
        </div>
      </dl>
    </section>
  );
}

function PickupCard({ invoice }: { invoice: InvoiceView }) {
  const [qr, setQr] = useState('');
  const p = invoice.pickup;
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(invoice.number, { margin: 1, width: 152 })
      .then((url) => active && setQr(url))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [invoice.number]);
  if (!p) return null;
  return (
    <section className="lv-setup-card">
      <div className="lv-inv-card-head">
        <h2>Pickup</h2>
        <button
          type="button"
          className="lv-setup-link"
          onClick={() => openStaffPage('pickup', '/?section=pickup')}
        >
          Open pickup desk
        </button>
      </div>
      <div className="lv-inv-pickup">
        {qr && (
          <img
            src={qr}
            width={76}
            height={76}
            alt={`QR code for ${invoice.number}`}
          />
        )}
        <div>
          <small>Find at the desk by</small>
          <b>{invoice.number}</b>
          <small>ID must match {invoice.buyer.name}</small>
        </div>
      </div>
      <dl className="lv-inv-where">
        <div>
          <dt>Where</dt>
          <dd>
            {p.locationName} · {p.address}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <PickupBadge state={p.state} />
          </dd>
        </div>
        {p.dueAt && !p.collectedAt && (
          <div>
            <dt>Free until</dt>
            <dd>{onDay(p.dueAt)}</dd>
          </div>
        )}
      </dl>
      <p className="lv-setup-muted lv-inv-small">
        The buyer still shows their pickup pass to collect.
      </p>
    </section>
  );
}

function Records({
  tab,
  invoice,
  onNote,
}: {
  tab: Tab;
  invoice: InvoiceView;
  onNote: () => void;
}) {
  const none = (text: string) => (
    <div className="lv-setup-state">
      <p>{text}</p>
    </div>
  );
  if (tab === 'payments')
    return invoice.payments.length ? (
      <>
        <div className="lv-setup-scroll">
          <table className="lv-setup-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What</th>
                <th scope="col">Account</th>
                <th scope="col" className="lv-setup-right">
                  Amount
                </th>
                <th scope="col">Ledger ref</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((p) => (
                <tr key={p.id}>
                  <td className="lv-batch-nowrap">{when(p.at)}</td>
                  <td>{p.what}</td>
                  <td>{p.account}</td>
                  <td className="lv-setup-right">
                    <b>
                      {p.amountKobo > 0 ? '+' : ''}
                      {money(p.amountKobo)}
                    </b>
                  </td>
                  <td>{p.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lv-setup-table-foot">
          Every naira moves through the ledger. Refunds go back to the buyer’s
          wallet and appear here as new lines; nothing is edited or deleted.
        </p>
      </>
    ) : (
      none('No payments recorded.')
    );
  if (tab === 'refunds')
    return invoice.refunds.length ? (
      <ul className="lv-inv-records">
        {invoice.refunds.map((r) => (
          <li key={r.id}>
            <b>
              {money(r.amountKobo)} ·{' '}
              {r.status === 'requested'
                ? r.step === 'admin'
                  ? 'waiting for an admin'
                  : 'waiting for a manager'
                : r.status === 'approved'
                  ? 'paid to the wallet'
                  : 'rejected'}
            </b>
            <span>
              {refundReasonLabels[r.reason]}
              {r.note && `: ${r.note}`}
            </span>
            <small>
              Asked for by {r.requestedBy}, {when(r.requestedAt)}
              {r.firstApprovedBy &&
                r.firstApprovedAt &&
                ` · first approval by ${r.firstApprovedBy}, ${when(r.firstApprovedAt)}`}
              {r.firstNote && ` · ${r.firstNote}`}
              {r.decidedBy &&
                r.decidedAt &&
                ` · ${r.status === 'approved' ? 'approved' : 'rejected'} by ${r.decidedBy}, ${when(r.decidedAt)}`}
              {r.decisionNote && ` · ${r.decisionNote}`}
            </small>
          </li>
        ))}
      </ul>
    ) : (
      none('No refunds.')
    );
  if (tab === 'messages')
    return invoice.messages.length ? (
      <ul className="lv-inv-records">
        {invoice.messages.map((m) => (
          <li key={m.id}>
            <b>{m.what}</b>
            <span>
              {m.channel} ·{' '}
              {m.status === 'sent'
                ? `sent ${m.sentAt ? when(m.sentAt) : ''}`
                : m.status === 'failed'
                  ? 'email not delivered'
                  : 'sending'}
            </span>
            <small>{when(m.at)}</small>
          </li>
        ))}
      </ul>
    ) : (
      none('Nothing sent about this invoice yet.')
    );
  if (tab === 'notes')
    return (
      <div className="lv-inv-notes">
        {invoice.access.canManage && (
          <Button variant="secondary" size="small" onClick={onNote}>
            Add note
          </Button>
        )}
        {invoice.notes.length ? (
          <ul className="lv-inv-records">
            {invoice.notes.map((n) => (
              <li key={n.id}>
                <span>{n.body}</span>
                <small>
                  {n.author}, {when(n.at)}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="lv-setup-muted">No notes yet.</p>
        )}
        {invoice.disputes.map((d) => (
          <p key={d.conversationId}>
            Dispute {d.number} · {d.status.replace('_', ' ')} · opened by{' '}
            {d.openedBy}, {when(d.at)}
          </p>
        ))}
      </div>
    );
  return invoice.activity.length ? (
    <ul className="lv-inv-records">
      {invoice.activity.map((a) => (
        <li key={a.id}>
          <b>{a.label}</b>
          <small>
            {a.actor}, {when(a.at)}
          </small>
        </li>
      ))}
    </ul>
  ) : (
    none('No activity yet.')
  );
}

/** Pickup desk staff: what to hand over, with no money. */
export function InvoicePickupPage({
  number,
  client,
}: {
  number: string;
  client: InvoicesClient;
}) {
  const read = useBatchLoad(() => client.pickup(number), [client, number]);
  if (!read.data)
    return (
      <div className="lv-setup-card">
        <LoadState error={read.error} onRetry={read.reload} />
      </div>
    );
  const v = read.data;
  return (
    <section className="lv-batches" aria-labelledby="lv-inv-number">
      <header className="lv-setup-head">
        <h1 id="lv-inv-number">
          {v.number} {v.pickup && <PickupBadge state={v.pickup.state} />}
        </h1>
      </header>
      <div className="lv-setup-card">
        <h2>
          {v.collectable ? 'Hand over to' : 'Not ready to hand over:'}{' '}
          {v.buyerName}
        </h2>
        <p className="lv-setup-muted">
          Check their pickup pass and ID first.
          {v.pickup && ` ${v.pickup.locationName}, ${v.pickup.address}.`}
        </p>
        <ul className="lv-inv-records">
          {v.lines.map((l) => (
            <li key={l.id}>
              <b>{l.title}</b>
              <small>
                {l.lotNumber} · {l.binCode ? `bin ${l.binCode}` : 'no bin'}
              </small>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
