'use client';
import type { ReactNode } from 'react';
import { CalendarClock, PackageCheck } from 'lucide-react';
import { formatNaira, type StorageCase } from '@auction-ng/shared';
export function pickupDeadline(value: string | null) {
  return value
    ? new Date(value).toLocaleString('en-NG', {
        timeZone: 'Africa/Lagos',
        dateStyle: 'medium',
        timeStyle: 'short',
      }) + ' WAT'
    : 'Not yet ready';
}
export function PickupStorageItems({
  items,
  actions,
  staff = false,
}: {
  items: StorageCase[];
  actions?: (item: StorageCase) => ReactNode;
  staff?: boolean;
}) {
  return (
    <div className="lv-storage-items">
      {items.map((item) => (
        <article className="lv-storage-item" key={item.invoiceLineId}>
          <div className="lv-storage-item-main">
            <PackageCheck size={22} aria-hidden="true" />
            <div>
              <strong>{item.title}</strong>
              <small>
                {item.reference} · {item.invoiceNumber}
              </small>
              {staff && (
                <small>
                  {item.buyerName} · {item.location}
                </small>
              )}
            </div>
          </div>
          <div>
            <span
              className={'lv-storage-status lv-storage-status--' + item.status}
            >
              {item.status.replaceAll('_', ' ')}
            </span>
            <p>
              <CalendarClock size={16} aria-hidden="true" />{' '}
              {pickupDeadline(item.dueAt)}
            </p>
            {item.id && (
              <small>
                {item.waived
                  ? 'Storage charges waived'
                  : `${formatNaira(item.dailyKobo)} / working day · ${formatNaira(item.capKobo)} cap`}
              </small>
            )}
          </div>
          <div className="lv-storage-item-total">
            <strong>{formatNaira(item.outstandingKobo)}</strong>
            <small>Storage outstanding</small>
            {item.paidKobo > 0 && (
              <small>{formatNaira(item.paidKobo)} paid</small>
            )}
            {item.assignedToName && staff && (
              <small>Assigned: {item.assignedToName}</small>
            )}
          </div>
          {actions && <div className="lv-storage-actions">{actions(item)}</div>}
        </article>
      ))}
    </div>
  );
}
