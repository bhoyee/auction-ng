'use client';
import {
  formatNaira,
  invoicePaymentLabels,
  invoicePickupLabels,
  type InvoicePaymentState,
  type InvoicePickupState,
} from '@auction-ng/shared';

/** Two decimals always, so columns of money line up. */
export function money(kobo: number) {
  const text = formatNaira(Math.abs(kobo));
  return (kobo < 0 ? '−' : '') + (text.includes('.') ? text : text + '.00');
}
const wat = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', ...options });
const dayTime = wat({
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const shortDay = wat({ weekday: 'short', day: 'numeric', month: 'short' });
export const when = (iso: string) => dayTime.format(new Date(iso));
export const onDay = (iso: string) => shortDay.format(new Date(iso));

const paymentTone: Record<InvoicePaymentState, string> = {
  paid: 'green',
  refund_pending: 'amber',
  partly_refunded: 'amber',
  refunded: 'grey',
  disputed: 'red',
  cancelled: 'grey',
  pending: 'amber',
};
const pickupTone: Record<InvoicePickupState, string> = {
  preparing: 'grey',
  ready: 'indigo',
  overdue: 'red',
  collected: 'green',
  cancelled: 'grey',
  none: 'grey',
};
export function PaymentBadge({ state }: { state: InvoicePaymentState }) {
  return (
    <span className="lv-setup-pill" data-tone={paymentTone[state]}>
      <span aria-hidden="true">●</span> {invoicePaymentLabels[state]}
    </span>
  );
}
export function PickupBadge({ state }: { state: InvoicePickupState }) {
  return state === 'none' ? (
    <>—</>
  ) : (
    <span className="lv-setup-pill" data-tone={pickupTone[state]}>
      <span aria-hidden="true">●</span> {invoicePickupLabels[state]}
    </span>
  );
}
export const lotsText = (n: number) =>
  `${n.toLocaleString('en-NG')} ${n === 1 ? 'lot' : 'lots'}`;
export const ratePercent = (bps: number | null) =>
  bps === null ? '' : `${bps / 100}%`;

export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
/** Opens a PDF for printing in a new tab. */
export function openFile(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
/** A typed Naira amount as kobo; undefined when it isn't one. */
export function nairaValue(text: string) {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(
    text.replace(/[₦,\s]/g, ''),
  );
  if (!match) return undefined;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}
