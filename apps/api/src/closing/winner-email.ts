import { z } from 'zod';
import { formatNaira, koboSchema } from '@auction-ng/shared';
import template from './winner-email.generated.json';

export const winnerMailSchema = z
  .object({
    invoiceNumber: z.string().min(1).max(40),
    title: z.string().min(1).max(200),
    lotNumber: z.string().min(1).max(40),
    hammerKobo: koboSchema,
    premiumKobo: koboSchema,
    lotFeeKobo: koboSchema,
    vatKobo: koboSchema,
    totalKobo: koboSchema,
    location: z.string().max(200),
    address: z.string().max(1000),
    status: z.enum(['paid', 'payment_due', 'defaulted']),
    deadline: z.iso.datetime().nullable(),
  })
  .strict();
export type WinnerMail = z.infer<typeof winnerMailSchema>;
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
  const values: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(data).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    ),
    heading: expired ? 'Your payment window has ended' : 'You won this lot',
    summary: paid
      ? 'Your payment is complete. Here is your receipt and where to collect your item.'
      : expired
        ? 'This invoice has been cancelled. The item will be reviewed for relisting.'
        : 'Your winning bid is confirmed. Add funds to your wallet before the deadline to complete payment.',
    hammer: formatNaira(data.hammerKobo),
    premium: formatNaira(data.premiumKobo),
    lotFee: formatNaira(data.lotFeeKobo),
    vat: formatNaira(data.vatKobo),
    total: formatNaira(data.totalKobo),
    payment: paid
      ? 'Paid from your wallet'
      : expired
        ? 'Payment not completed — invoice cancelled'
        : `Payment due by ${due}`,
    nextHeading: paid
      ? 'Collecting your item'
      : expired
        ? 'What happens next'
        : 'Complete your payment',
    next: paid
      ? 'Your pickup pass is ready. Use your account to view the pass and arrange collection at the warehouse. Bring the pass when you collect. No delivery has been booked.'
      : expired
        ? 'A non-payment strike has been recorded. Three active strikes suspend bidding. Contact support through your account if you believe this is incorrect.'
        : `Top up your wallet before ${due}. We will retry payment automatically. Your pickup pass becomes available after payment. If the invoice remains unpaid after 24 hours, a strike will be recorded and the item will be prepared for relisting.`,
  };
  const render = (source: string, html: boolean) =>
    source.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
      html ? escape(values[key] ?? '') : (values[key] ?? ''),
    );
  return {
    Subject: `${expired ? 'Payment window ended for' : 'You won'} ${data.lotNumber} — Auction NG`,
    Text: render(template.text, false),
    HTML: render(template.html, true),
  };
}
