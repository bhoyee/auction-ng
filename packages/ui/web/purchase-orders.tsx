import type { ReactNode } from 'react';
import { ArrowUpRight, Check, ReceiptText, ShoppingBag } from 'lucide-react';
import type { buyerInvoiceSchema } from '@auction-ng/shared/buyer-schemas';
import { formatNaira } from '@auction-ng/shared/money';

export function PurchaseOrders({
  orders,
  children,
}: {
  orders: ReturnType<typeof buyerInvoiceSchema.parse>[];
  children: ReactNode;
}) {
  return (
    <section className="agn-purchases" aria-label="Buy Now purchase orders">
      <header className="agn-purchases-heading">
        <span className="agn-purchases-icon">
          <ShoppingBag size={22} aria-hidden="true" />
        </span>
        <div>
          <h2>Your orders</h2>
          <p>Buy Now purchases, newest first</p>
        </div>
      </header>
      <div className="agn-purchases-columns" aria-hidden="true">
        <span>Order</span>
        <span>Payment</span>
        <span>Order total</span>
        <span>Details</span>
      </div>
      <ul className="agn-purchases-list">
        {orders.map((order) => (
          <li key={order.id}>
            <div className="agn-purchases-reference">
              <ReceiptText size={20} aria-hidden="true" />
              <div>
                <a href={`/invoices/${order.id}`}>{order.number}</a>
                <time dateTime={order.createdAt}>
                  {new Date(order.createdAt).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'Africa/Lagos',
                  })}
                </time>
              </div>
            </div>
            <div>
              <span
                className={`agn-purchase-status agn-purchase-status--${order.status}`}
              >
                {order.status === 'paid' && (
                  <Check size={14} aria-hidden="true" />
                )}
                {order.status === 'paid'
                  ? 'Paid'
                  : order.status === 'pending'
                    ? 'Pending'
                    : order.status === 'refunded'
                      ? 'Refunded'
                      : 'Cancelled'}
              </span>
            </div>
            <strong className="agn-purchases-total">
              <span>Total</span>
              {formatNaira(order.totalKobo)}
            </strong>
            <a
              className="agn-purchases-action"
              href={`/invoices/${order.id}`}
              aria-label={`View invoice for ${order.number}`}
            >
              View invoice
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <div className="agn-purchases-pagination">{children}</div>
    </section>
  );
}
