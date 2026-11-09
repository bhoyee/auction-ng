import type { ReactNode } from 'react';
import { MapPin, Check, Clock3 } from 'lucide-react';
import type { PickupArrival } from '@auction-ng/shared/pickup-arrival-schemas';
export function ArrivalPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="agn-arrival-panel" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function ArrivalRow({
  arrival,
  staff = false,
  children,
}: {
  arrival: PickupArrival;
  staff?: boolean;
  children?: ReactNode;
}) {
  return (
    <article
      className="agn-arrival-row"
      aria-label={`Arrival ${arrival.invoiceNumber}`}
    >
      <div>
        <strong>{staff ? arrival.buyerName : arrival.invoiceNumber}</strong>
        <span>
          {staff && `${arrival.invoiceNumber} · `}
          {arrival.location}
        </span>
        <small>
          Arrived{' '}
          {new Date(arrival.createdAt).toLocaleString('en-NG', {
            timeZone: 'Africa/Lagos',
            hour: '2-digit',
            minute: '2-digit',
            day: 'numeric',
            month: 'short',
          })}{' '}
          WAT
        </small>
      </div>
      <span
        className={`agn-arrival-state${arrival.status === 'acknowledged' ? ' agn-arrival-state--acknowledged' : ''}`}
      >
        {arrival.status === 'acknowledged' ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Clock3 size={16} aria-hidden="true" />
        )}
        {arrival.status === 'acknowledged'
          ? 'Acknowledged by staff'
          : arrival.status === 'waiting'
            ? 'Waiting for staff'
            : arrival.status === 'closed'
              ? 'Visit closed'
              : 'Cancelled'}
      </span>
      {children}
    </article>
  );
}
export function ArrivalOrder({
  number,
  children,
}: {
  number: string;
  children: ReactNode;
}) {
  return (
    <div className="agn-arrival-row">
      <div>
        <strong>{number}</strong>
        <span>
          <MapPin size={16} aria-hidden="true" />
          Paid pickup order
        </span>
      </div>
      {children}
    </div>
  );
}
