import { z } from 'zod';
import { formatNaira, koboSchema } from '@auction-ng/shared';
import template from './bid-cancellation-email.generated.json';
const schema = z
  .object({
    kind: z.enum(['cancelled', 'reopened']),
    title: z.string().max(200),
    lotNumber: z.string().max(40),
    feeKobo: koboSchema,
    premiumBps: z.number().int().min(0).max(10000),
    endsAt: z.iso.datetime(),
    itemUrl: z.url(),
  })
  .strict();
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] ?? char,
  );
export function bidCancellationEmail(input: unknown) {
  const v = schema.parse(input),
    cancelled = v.kind === 'cancelled';
  const values: Record<string, string> = {
    heading: cancelled
      ? 'Your bid cancellation is complete'
      : 'This auction is open for fresh bids',
    body: cancelled
      ? 'Staff completed your requested cancellation. The cancellation fee has been charged and your remaining bid reservation released. You cannot bid again on this item.'
      : 'A previous leading bid was cancelled. Earlier bids will not reactivate automatically. Place a fresh bid if you are still interested; review the current price and total cost first.',
    detail: cancelled
      ? `Cancellation fee: ${formatNaira(v.feeKobo)} (${v.premiumBps / 100}% of the public bid price at approval).`
      : `Bidding closes ${new Date(v.endsAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} WAT, subject to normal late-bid extensions.`,
    lotNumber: v.lotNumber,
    title: v.title,
    url: v.itemUrl,
  };
  const render = (text: string, html: boolean) =>
    text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
      html ? escape(values[key] ?? '') : (values[key] ?? ''),
    );
  return {
    Subject: values.heading + ' · ' + v.lotNumber + ' · Auction NG',
    Text: render(template.text, false),
    HTML: render(template.html, true),
  };
}
