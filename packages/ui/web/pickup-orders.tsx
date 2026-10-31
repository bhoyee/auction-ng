import type { ReactNode } from 'react';
import { ArrowUpRight, Check, QrCode, ReceiptText } from 'lucide-react';
import { formatNaira } from '@auction-ng/shared/money';

export function PickupOrders({
  orders,
  children,
}: {
  orders: {
    id: string;
    number: string;
    status: string;
    totalKobo: number;
    createdAt: string;
  }[];
  children: ReactNode;
}) {
  return (
    <section className="agn-pickup-orders" aria-label="Orders awaiting pickup">
      <div className="agn-pickup-orders-head" aria-hidden="true">
        <span>Order</span>
        <span>Payment</span>
        <span>Amount</span>
        <span>Collection</span>
      </div>
      <ul className="agn-pickup-orders-list">
        {orders.map((order) => (
          <li key={order.id}>
            <div className="agn-pickup-order-reference">
              <span className="agn-pickup-order-icon" aria-hidden="true">
                <ReceiptText size={22} />
              </span>
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
                className={`agn-pickup-payment${order.status === 'paid' ? ' agn-pickup-payment--paid' : ''}`}
              >
                {order.status === 'paid' && (
                  <Check size={14} aria-hidden="true" />
                )}
                {order.status === 'paid' ? 'Paid' : order.status}
              </span>
            </div>
            <strong className="agn-pickup-order-amount">
              {formatNaira(order.totalKobo)}
            </strong>
            <a
              className="agn-pickup-order-pass"
              href={`/invoices/${order.id}/pickup-pass`}
              aria-label={`View pickup pass for ${order.number}`}
            >
              <QrCode size={18} aria-hidden="true" />
              Pickup pass
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <div className="agn-pickup-orders-pagination">{children}</div>
    </section>
  );
}
