'use client';
import { useEffect, useRef } from 'react';
import type { InvoicesClient } from '@auction-ng/api-client/invoices';
import { Button } from '@auction-ng/ui/web/button';
import { ImageOff, X } from '@auction-ng/ui/web/icons';
import { productImageSource } from '@auction-ng/ui/web/demo-image';
import { LoadState, useBatchLoad } from '../batches/batch-ui';
import { openStaffPage } from '../batches/batches-area';
import { PendingRefund, useInvoiceActions } from './invoice-actions';
import { money, onDay, PaymentBadge, ratePercent, when } from './invoice-ui';

/** The selected invoice beside the list. */
export function InvoiceDrawer({
  number,
  client,
  onClose,
  onStep,
  onOpenPage,
  onChanged,
}: {
  number: string;
  client: InvoicesClient;
  onClose: () => void;
  onStep: (by: 1 | -1) => void;
  onOpenPage: () => void;
  onChanged: () => void;
}) {
  const read = useBatchLoad(() => client.view(number), [client, number]);
  const invoice = read.data?.number === number ? read.data : undefined;
  const actions = useInvoiceActions(invoice, client, () => {
    read.reload();
    onChanged();
  });
  const panel = useRef<HTMLElement>(null);
  const { dialogOpen } = actions;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      // Typing and open dialogs keep their own keys.
      if (
        dialogOpen ||
        event.defaultPrevented ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input,textarea,select,[role=dialog]'))
      )
        return;
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowDown') onStep(1);
      else if (event.key === 'ArrowUp') onStep(-1);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [dialogOpen, onClose, onStep]);
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [number]);
  return (
    <aside
      ref={panel}
      className="lv-inv-drawer"
      aria-label={`Invoice ${number}`}
    >
      <header>
        <button type="button" className="lv-setup-link" onClick={onOpenPage}>
          Open full page
        </button>
        <span>
          <Button
            variant="secondary"
            size="small"
            disabled={!invoice}
            busy={actions.busy}
            onClick={actions.download}
          >
            Download PDF
          </Button>
          <button
            type="button"
            className="lv-setup-icon-button"
            aria-label="Close invoice"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </span>
      </header>
      {actions.messages}
      {!invoice ? (
        <LoadState error={read.error} onRetry={read.reload} />
      ) : (
        <div className="lv-inv-drawer-body">
          <div className="lv-inv-drawer-top">
            <span>Issued {when(invoice.issuedAt)}</span>
            <PaymentBadge state={invoice.payment} />
          </div>
          <h2>{invoice.number}</h2>
          <p>
            {invoice.buyer.name}
            {invoice.buyer.phone && ` · ${invoice.buyer.phone}`} ·{' '}
            <button
              type="button"
              className="lv-setup-link"
              onClick={() =>
                openStaffPage(
                  'buyers',
                  `/?section=buyers&search=${encodeURIComponent(invoice.buyer.name)}`,
                )
              }
            >
              View buyer
            </button>
          </p>
          <PendingRefund
            invoice={invoice}
            onDecide={(refund, approve) =>
              actions.open({ kind: 'decide', refund, approve })
            }
          />
          <div className="lv-inv-box">
            <ul>
              {invoice.lines.map((l) => (
                <li key={l.id}>
                  <span className="lv-inv-thumb">
                    {l.thumbnailUrl ? (
                      <img
                        src={productImageSource(l.thumbnailUrl)}
                        alt=""
                        width={36}
                        height={36}
                        loading="lazy"
                      />
                    ) : (
                      <ImageOff size={16} aria-hidden="true" />
                    )}
                  </span>
                  <span>
                    {l.title}
                    <small>{l.lotNumber}</small>
                  </span>
                  <b>{money(l.hammerKobo)}</b>
                </li>
              ))}
            </ul>
            <dl>
              <div>
                <dt>
                  {invoice.saleType === 'fixed_price'
                    ? 'Item price'
                    : 'Hammer total'}
                </dt>
                <dd>{money(invoice.hammerKobo)}</dd>
              </div>
              {invoice.saleType === 'auction' && (
                <>
                  <div>
                    <dt>
                      Buyer’s premium{' '}
                      {invoice.premiumBps !== null &&
                        `(${ratePercent(invoice.premiumBps)})`}
                    </dt>
                    <dd>{money(invoice.premiumKobo)}</dd>
                  </div>
                  <div>
                    <dt>
                      {invoice.lines.length === 1
                        ? 'Lot fee'
                        : `Lot fees (${invoice.lines.length})`}
                    </dt>
                    <dd>{money(invoice.lotFeeKobo)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>
                  {invoice.saleType === 'fixed_price' ? 'Tax' : 'VAT on fees'}{' '}
                  {invoice.vatBps !== null &&
                    `(${ratePercent(invoice.vatBps)})`}
                </dt>
                <dd>{money(invoice.vatKobo)}</dd>
              </div>
              <div data-total="">
                <dt>{invoice.paidKobo ? 'Total paid' : 'Total'}</dt>
                <dd>{money(invoice.totalKobo)}</dd>
              </div>
              {invoice.refundedKobo > 0 && (
                <div>
                  <dt>Refunded to wallet</dt>
                  <dd>{money(-invoice.refundedKobo)}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="lv-inv-facts">
            <b>Payment</b>
            {invoice.payments.map((p) => (
              <p key={p.id}>
                <span>
                  {p.what === 'Hold captured'
                    ? 'Wallet hold captured at close'
                    : p.what}
                </span>
                <small>{p.reference}</small>
              </p>
            ))}
            {!invoice.payments.length && <p>No payment recorded.</p>}
            {invoice.pickup && (
              <p>
                <span>Pickup</span>
                <span>
                  {invoice.pickup.locationName} ·{' '}
                  {invoice.pickup.collectedAt
                    ? `collected ${onDay(invoice.pickup.collectedAt)}`
                    : invoice.pickup.state === 'cancelled'
                      ? 'cancelled'
                      : invoice.pickup.dueAt
                        ? `free until ${onDay(invoice.pickup.dueAt)}`
                        : 'being prepared'}
                </span>
              </p>
            )}
          </div>
          <div className="lv-inv-drawer-actions">
            {invoice.access.canRequestRefund && (
              <Button
                variant="secondary"
                disabled={!!invoice.refundBlocked}
                title={invoice.refundBlocked ?? undefined}
                onClick={() => actions.open({ kind: 'refund' })}
              >
                Request refund
              </Button>
            )}
            {invoice.access.canDispute && (
              <Button
                variant="secondary"
                disabled={invoice.payment === 'disputed'}
                onClick={() => actions.open({ kind: 'dispute' })}
              >
                Open dispute
              </Button>
            )}
            {invoice.access.canManage && (
              <Button
                variant="secondary"
                onClick={() => actions.open({ kind: 'resend' })}
              >
                Resend
              </Button>
            )}
          </div>
          {invoice.refundBlocked && invoice.access.canRequestRefund && (
            <p className="lv-setup-muted lv-inv-small">
              {invoice.refundBlocked}
            </p>
          )}
        </div>
      )}
      {actions.dialogs}
    </aside>
  );
}
