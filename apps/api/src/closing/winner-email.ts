import { z } from 'zod';
import {
  formatNaira,
  koboSchema,
  FIXED_PRICE_TAX_BPS,
  PICKUP_FREE_WORKING_DAYS,
} from '@auction-ng/shared';
import { winnerPickupSchema } from './winner-pickup';
import template from './winner-email.generated.json';

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
    status: z.enum(['paid', 'payment_due', 'defaulted']),
    deadline: z.iso.datetime().nullable(),
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
export function winnerEmail(input: WinnerMail) {
  const data = winnerMailSchema.parse(input);
  const due = data.deadline
    ? new Intl.DateTimeFormat('en-NG', {
        timeZone: 'Africa/Lagos',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(data.deadline)) + ' WAT'
    : '';
  const paid = data.status === 'paid';
  const expired = data.status === 'defaulted';
  const pickupDue = data.pickup
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Lagos',
        dateStyle: 'medium',
        timeStyle: 'short',
        hourCycle: 'h23',
      })
        .format(new Date(data.pickup.dueAt))
        .replace(',', '') + ' WAT'
    : null;
  const pickupHeading = expired
    ? 'Collection unavailable'
    : data.pickup?.collected
      ? 'Collection completed'
      : pickupDue && paid
        ? 'Collect by ' + pickupDue
        : 'Your pickup window';
  const pickupPolicy = expired
    ? 'This cancelled invoice does not qualify for collection.'
    : data.pickup?.collected
      ? 'This item has already been collected. No further pickup action is needed.'
      : pickupDue && paid
        ? `You have ${PICKUP_FREE_WORKING_DAYS} working days at the collection centre for free pickup after readiness and notification. The deadline above is your current recorded deadline; centre closing days and excluded dates do not count.`
        : `Your ${PICKUP_FREE_WORKING_DAYS} working days of free pickup start after payment is complete, your item is marked ready at the collection centre and you are notified. We will send your exact pickup deadline when the item is ready. Centre closing days and excluded dates do not count.`;
  const pickupCharges =
    expired || data.pickup?.collected
      ? ''
      : data.pickup?.waived
        ? 'Unpaid and future storage charges are waived for this item. Previously paid charges are not automatically refunded.'
        : data.pickup && paid
          ? `After the confirmed deadline, storage is ${formatNaira(data.pickup.dailyKobo)} per centre working day, capped at ${formatNaira(data.pickup.capKobo)} per item. Charges are paid explicitly at collection; your wallet is never automatically charged.`
          : 'Late storage charges may apply after your confirmed pickup deadline. Your readiness notice will show the saved rate and cap for this item. Charges are paid explicitly at collection; your wallet is never automatically charged.';
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
    heading: expired
      ? 'Your payment window has ended'
      : data.saleType === 'fixed_price'
        ? 'Your purchase is confirmed'
        : 'You won this lot',
    summary: paid
      ? data.pickup?.collected
        ? 'Payment and collection are complete. Keep this receipt for your records.'
        : 'Your payment is complete. Here is your receipt and where to collect your item.'
      : expired
        ? 'This invoice has been cancelled. The item will be reviewed for relisting.'
        : 'Your winning bid is confirmed. Add funds to your wallet before the deadline to complete payment.',
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
    payment: paid
      ? data.purchaseMethod === 'card'
        ? 'Paid by card'
        : data.purchaseMethod === 'bank_transfer'
          ? 'Paid by bank transfer'
          : 'Paid from your wallet'
      : expired
        ? 'Payment not completed — invoice cancelled'
        : `Payment due by ${due}`,
    nextHeading: paid
      ? data.pickup?.collected
        ? 'Your collection is complete'
        : 'Collecting your item'
      : expired
        ? 'What happens next'
        : 'Complete your payment',
    next: paid
      ? data.pickup?.collected
        ? 'Keep this receipt for your records. This item has already been collected.'
        : data.pickup
          ? 'Your item is ready for pickup. Bring your private pickup pass and collect before the deadline below. No delivery has been booked.'
          : 'Your pickup pass is available in your account. Wait for the ready-to-collect notice and exact deadline before travelling to the centre. No delivery has been booked.'
      : expired
        ? 'A non-payment strike has been recorded. Three active strikes suspend bidding. Contact support through your account if you believe this is incorrect.'
        : `Top up your wallet before ${due}. We will retry payment automatically. Your pickup pass becomes available after payment. If the invoice remains unpaid after 24 hours, a strike will be recorded and the item will be prepared for relisting.`,
  };
  const render = (source: string, html: boolean) =>
    (data.saleType === 'fixed_price'
      ? source.replaceAll('Winning bid', 'Fixed item price')
      : source
    ).replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
      html ? escape(values[key] ?? '') : (values[key] ?? ''),
    );
  return {
    Subject: `${expired ? 'Payment window ended for' : data.saleType === 'fixed_price' ? 'Purchase confirmed for' : 'You won'} ${data.lotNumber} — LotVanta`,
    Text: render(template.text, false),
    HTML: render(template.html, true),
  };
}
