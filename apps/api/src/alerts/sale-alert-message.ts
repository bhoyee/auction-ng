import { z } from 'zod';
import { formatNaira } from '@auction-ng/shared';

/**
 * What a WhatsApp sale alert carries (owner decision 2026-11-21). The buyer
 * appears only as first name and initial; email and phone are never sent to
 * the alert provider.
 */
export const saleAlertSchema = z
  .object({
    kind: z.enum(['auction', 'buy-now']),
    orderNumber: z.string().min(1).max(40),
    title: z.string().min(1).max(200),
    lotNumber: z.string().min(1).max(40),
    location: z.string().max(120).nullable(),
    priceKobo: z.number().int().nonnegative(),
    totalKobo: z.number().int().nonnegative(),
    moreItems: z.number().int().nonnegative(),
    buyer: z.string().min(1).max(60),
    paidAt: z.iso.datetime(),
  })
  .strict();
export type SaleAlert = z.infer<typeof saleAlertSchema>;

const TITLE_MAX = 60;

/** "Chiamaka Okafor" → "Chiamaka O."; one name stays as is; none → "Buyer". */
export function buyerDisplayName(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return 'Buyer';
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const initial = last?.[0]?.toLocaleUpperCase('en-NG');
  return (initial ? `${first} ${initial}.` : first).slice(0, 60);
}

function shortTitle(title: string) {
  const clean = title.replace(/\s+/g, ' ').trim();
  return clean.length <= TITLE_MAX
    ? clean
    : clean.slice(0, TITLE_MAX - 1).trimEnd() + '…';
}

const lagosTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Short plain-text WhatsApp message, one fact per line. */
export function saleAlertText(alert: SaleAlert) {
  const auction = alert.kind === 'auction';
  const item =
    `Item: ${shortTitle(alert.title)} (Lot ${alert.lotNumber})` +
    (alert.moreItems > 0
      ? ` + ${alert.moreItems} more item${alert.moreItems === 1 ? '' : 's'}`
      : '');
  return [
    auction ? 'GiddyDeal: Deal won' : 'GiddyDeal: Buy Now sale',
    item,
    `${auction ? 'Winning bid' : 'Price'}: ${formatNaira(alert.priceKobo)} · Paid ${formatNaira(alert.totalKobo)}`,
    `Buyer: ${alert.buyer}`,
    `Order: ${alert.orderNumber}`,
    ...(alert.location ? [`Pickup: ${alert.location}`] : []),
    lagosTime
      .format(new Date(alert.paidAt))
      .replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase()),
  ].join('\n');
}

/** Bid engine health alerts (2026-11-28): no buyer data. */
export const systemAlertSchema = z
  .object({
    kind: z.literal('system'),
    event: z.enum(['paused', 'resumed']),
    at: z.iso.datetime(),
  })
  .strict();
export type SystemAlert = z.infer<typeof systemAlertSchema>;

export function systemAlertText(alert: SystemAlert) {
  const when = lagosTime.format(new Date(alert.at)) + ' WAT';
  return alert.event === 'paused'
    ? `GiddyDeal: bidding is PAUSED (${when}).\nThe bid engine could not confirm its saved data after a restart, so bidding stays paused to protect buyers' money. A technical review is needed.`
    : `GiddyDeal: bidding resumed automatically (${when}).\nThe bid engine restarted, verified its saved data and resumed. No action needed.`;
}

/** Text for any queued alert payload. */
export function adminAlertText(payload: unknown) {
  const system = systemAlertSchema.safeParse(payload);
  return system.success
    ? systemAlertText(system.data)
    : saleAlertText(saleAlertSchema.parse(payload));
}
