import { z } from 'zod';
import {
  formatCollectionDeadline,
  formatNaira,
  koboSchema,
  FIXED_PRICE_TAX_BPS,
  PICKUP_FREE_WORKING_DAYS,
} from '@auction-ng/shared';
import { winnerPickupSchema } from './winner-pickup';
import template from './winner-email.generated.json';
import { resultMailExtrasSchema, withItemImage } from './watch-lost-email';

export const winnerMailSchema = z
  .object({
    saleType: z.enum(['auction', 'fixed_price']).default('auction'),
    purchaseMethod: z
      .enum(['wallet', 'card', 'bank_transfer'])
      .default('wallet'),
    invoiceNumber: z.string().min(1).max(40),
    title: z.string().min(1).max(200),
    lotNumber: z.string().min(1).max(40),
    hammerKobo: koboSchema,
    premiumKobo: koboSchema,
    lotFeeKobo: koboSchema,
    vatKobo: koboSchema,
    totalKobo: koboSchema,
    feeRates: z
      .object({
        premiumBps: z.number().int().min(0).max(10000),
        vatBps: z.number().int().min(0).max(10000),
      })
      .strict()
      .optional(),
    location: z.string().max(200),
    address: z.string().max(1000),
    // Wins are always paid from held funds at close (2026-11-27); there is
    // no payment-due or defaulted receipt any more.
    status: z.literal('paid'),
    deadline: z.null(),
    pickup: winnerPickupSchema.nullable().optional(),
  })
  .strict();
export type WinnerMail = z.input<typeof winnerMailSchema>;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
export function winnerEmail(
  input: WinnerMail,
  extras: z.input<typeof resultMailExtrasSchema> = {},
) {
  const data = winnerMailSchema.parse(input);
  const extra = resultMailExtrasSchema.parse(extras);
  const greeting = extra.firstName
    ? data.saleType === 'fixed_price'
      ? `Thank you, ${extra.firstName}. `
      : `Congratulations, ${extra.firstName}! `
    : '';
  const pickupDue = data.pickup
    ? formatCollectionDeadline(data.pickup.dueAt, 'short')
    : null;
  const pickupHeading = data.pickup?.collected
    ? 'Collection completed'
    : pickupDue
      ? 'Free collection until ' + pickupDue
      : 'Your pickup window';
  const pickupPolicy = data.pickup?.collected
    ? 'This item has already been collected. No further pickup action is needed.'
    : pickupDue
      ? `You have ${PICKUP_FREE_WORKING_DAYS} working days to collect your item from the collection centre. Collect on any working day up to the deadline above; you don’t have to wait for the last day.`
      : `You have ${PICKUP_FREE_WORKING_DAYS} working days to collect your item from the collection centre. The ${PICKUP_FREE_WORKING_DAYS} days start when we email you that it is ready for pickup, and that email will give your exact pickup deadline.`;
  const pickupCharges = data.pickup?.collected
    ? ''
    : data.pickup?.waived
      ? 'Storage charges are waived for this item.'
      : data.pickup
        ? `After that date, storage costs ${formatNaira(data.pickup.dailyKobo)} per working day, up to ${formatNaira(data.pickup.capKobo)}. You pay it at the collection centre; we never take it from your wallet.`
        : 'If you collect after the deadline, a daily storage charge applies. You pay it at the collection centre; we never take it from your wallet.';
  const percent = (bps: number) =>
    new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(
      bps / 100,
    ) + '%';
  const values: Record<string, string> = {
    pickupHeading,
    pickupPolicy,
    pickupCharges,
    ...Object.fromEntries(
      Object.entries(data).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    ),
    heading:
      data.saleType === 'fixed_price'
        ? 'Your purchase is confirmed'
        : 'You won this lot',
    imageUrl: extra.imageUrl ?? '',
    summary:
      greeting +
      (data.pickup?.collected
        ? 'Payment and collection are complete. Keep this receipt for your records.'
        : 'Your payment is complete. Here is your receipt and where to collect your item.'),
    hammer: formatNaira(data.hammerKobo),
    premiumLabel:
      data.saleType === 'auction' && data.feeRates
        ? `Service charge (${percent(data.feeRates.premiumBps)})`
        : 'Service charge',
    vatLabel:
      data.saleType === 'fixed_price'
        ? `Tax (${percent(FIXED_PRICE_TAX_BPS)})`
        : data.feeRates
          ? `VAT on fees (${percent(data.feeRates.vatBps)})`
          : 'VAT on fees',
    premium: formatNaira(data.premiumKobo),
    lotFee: formatNaira(data.lotFeeKobo),
    vat: formatNaira(data.vatKobo),
    total: formatNaira(data.totalKobo),
    payment:
      data.purchaseMethod === 'card'
        ? 'Paid by card'
        : data.purchaseMethod === 'bank_transfer'
          ? 'Paid by bank transfer'
          : 'Paid from your wallet',
    nextHeading: data.pickup?.collected
      ? 'Your collection is complete'
      : 'Collecting your item',
    next: data.pickup?.collected
      ? 'Keep this receipt for your records. This item has already been collected.'
      : data.pickup
        ? 'Your item is ready for pickup. Bring your private pickup pass and collect before the deadline below. No delivery has been booked.'
        : 'Your pickup pass is available in your account. Wait for the ready-to-collect notice and exact deadline before travelling to the centre. No delivery has been booked.',
  };
  const render = (source: string, html: boolean) =>
    (data.saleType === 'fixed_price'
      ? source.replaceAll('Winning bid', 'Fixed item price')
      : source
    ).replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
      html ? escape(values[key] ?? '') : (values[key] ?? ''),
    );
  return {
    Subject: `${data.saleType === 'fixed_price' ? 'Purchase confirmed for' : 'You won'} ${data.lotNumber} — GiddyDeal`,
    Text: render(template.text, false),
    HTML: withItemImage(render(template.html, true), extra.imageUrl),
  };
}
