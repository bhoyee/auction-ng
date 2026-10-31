import { ArrowLeft, Check, MapPin, Printer, QrCode } from 'lucide-react';
import type { buyerInvoiceDetailSchema } from '@auction-ng/shared/buyer-schemas';
import { formatNaira } from '@auction-ng/shared/money';
import { Button } from './button';

type InvoiceData = ReturnType<typeof buyerInvoiceDetailSchema.parse>;

export function InvoiceToolbar({ onPrint }: { onPrint?: () => void }) {
  return (
    <div className="agn-invoice-toolbar">
      <a href="/awaiting-pickup">
        <ArrowLeft size={18} aria-hidden="true" />
        Back to awaiting pickup
      </a>
      {onPrint && (
        <Button onClick={onPrint}>
          <Printer size={18} aria-hidden="true" />
          Print / Save as PDF
        </Button>
      )}
    </div>
  );
}

export function InvoiceDocument({
  invoice,
  buyer,
  showPass = true,
}: {
  invoice: InvoiceData;
  buyer?: { name: string; email: string };
  showPass?: boolean;
}) {
  const fixed = invoice.saleType === 'fixed_price';
  return (
    <article
      className="agn-invoice-document"
      aria-label={`Invoice ${invoice.number}`}
    >
      <div className="agn-invoice-masthead">
        <div>
          <div className="agn-invoice-brand">
            Auction<span>NG</span>
            <i aria-hidden="true" />
          </div>
          <p>Your auction. Your find.</p>
        </div>
        <div className="agn-invoice-identity">
          <h2>Invoice</h2>
          <strong>{invoice.number}</strong>
          <span
            className={`agn-invoice-status${invoice.status === 'paid' ? ' agn-invoice-status--paid' : ''}`}
          >
            {invoice.status === 'paid' && (
              <Check size={16} aria-hidden="true" />
            )}
            {invoice.status === 'paid' ? 'Paid' : invoice.status}
          </span>
        </div>
      </div>
      <div className="agn-invoice-details">
        <div>
          <h3>Buyer account</h3>
          {buyer && (
            <>
              <strong>{buyer.name}</strong>
              <span>{buyer.email}</span>
            </>
          )}
        </div>
        <dl>
          <div>
            <dt>Invoice date</dt>
            <dd>
              {new Date(invoice.createdAt).toLocaleDateString('en-NG', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'Africa/Lagos',
              })}
            </dd>
          </div>
          <div>
            <dt>Order type</dt>
            <dd>{fixed ? 'Buy Now purchase' : 'Auction purchase'}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>Nigerian Naira (NGN)</dd>
          </div>
        </dl>
      </div>
      <table className="agn-invoice-items">
        <caption className="agn-sr-only">Invoice items</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Line total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.lot.id}>
              <td>
                <strong>{line.lot.title}</strong>
                <span>Item ID: {line.lot.lotNumber}</span>
              </td>
              <td>{formatNaira(line.totalKobo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="agn-invoice-table-note">
        Line totals include the charges itemised below.
      </p>
      <div className="agn-invoice-summary">
        <dl>
          <div>
            <dt>{fixed ? 'Fixed item price' : 'Hammer total'}</dt>
            <dd>{formatNaira(invoice.hammerTotalKobo)}</dd>
          </div>
          {!fixed && (
            <>
              <div>
                <dt>Buyer premium</dt>
                <dd>{formatNaira(invoice.premiumKobo)}</dd>
              </div>
              <div>
                <dt>Lot fees</dt>
                <dd>{formatNaira(invoice.lotFeeKobo)}</dd>
              </div>
            </>
          )}
          <div>
            <dt>{fixed ? 'Item tax' : 'VAT on fees'}</dt>
            <dd>{formatNaira(invoice.vatKobo)}</dd>
          </div>
          <div className="agn-invoice-total">
            <dt>Total</dt>
            <dd>{formatNaira(invoice.totalKobo)}</dd>
          </div>
        </dl>
      </div>
      {invoice.pickup && (
        <div className="agn-invoice-collection">
          <MapPin size={22} aria-hidden="true" />
          <div>
            <h3>Pickup location</h3>
            <strong>{invoice.pickup.location}</strong>
            <p>Bring your private pickup pass to the collection desk.</p>
          </div>
          {invoice.status === 'paid' && showPass && (
            <a
              className="agn-button agn-button--primary"
              href={`/invoices/${invoice.id}/pickup-pass`}
            >
              <QrCode size={18} aria-hidden="true" />
              Open pickup pass
            </a>
          )}
        </div>
      )}
      <div className="agn-invoice-footnote">
        <strong>Thank you for choosing Auction NG.</strong>
        <span>
          Keep this invoice for your records. Your private pickup pass is
          required for collection.
        </span>
      </div>
    </article>
  );
}
