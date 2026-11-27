import { z } from 'zod';
import { formatNaira, koboSchema } from '@auction-ng/shared';
import template from './watch-lost-email.generated.json';

const safeUrl = z.url().refine((value) => {
  const u = new URL(value);
  return (
    !u.username &&
    !u.password &&
    (u.protocol === 'https:' ||
      (u.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(u.hostname)))
  );
});
/** Added at send time, never stored in the queued message. */
export const resultMailExtrasSchema = z
  .object({
    firstName: z.string().trim().min(1).max(60).optional(),
    imageUrl: safeUrl.optional(),
  })
  .strict();
export const watchLostMailSchema = z
  .object({
    title: z.string().min(1).max(200),
    lotNumber: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[^\r\n]+$/),
    finalPriceKobo: koboSchema,
    itemUrl: safeUrl,
    // Loss notices (2026-11-27): every losing bidder, plus watchers who did
    // not bid. Older queued notices have neither field and were watch notices.
    reason: z.enum(['watch', 'bid']).optional(),
    outcome: z.enum(['won', 'bought']).optional(),
  })
  .strict();

/** Removes the photo block when there is no photo to show. */
export function withItemImage(html: string, imageUrl: string | undefined) {
  return imageUrl
    ? html
    : html.replace(/<!--item-image-->[\s\S]*?<!--\/item-image-->/g, '');
}
export function lossWording(
  data: z.output<typeof watchLostMailSchema>,
  firstName?: string,
) {
  const bought = data.outcome === 'bought';
  const bid = data.reason === 'bid';
  const sorry = firstName ? `Sorry, ${firstName}.` : 'Sorry.';
  return {
    heading: bought
      ? 'Another buyer bought this item'
      : 'Another buyer won this item',
    intro: bid
      ? `${sorry} ${bought ? 'Another buyer bought this item before bidding ended.' : 'Bidding has ended and this item went to another buyer.'}`
      : `${sorry} The deal has ended and this item was sold to another buyer.`,
    note: bid
      ? 'No payment is due from you, and the money reserved for your bid has been released.'
      : 'No payment is due from you for this item. It remains in the Lost tab of your watchlist for reference.',
    reason: bid
      ? 'You received this email because you bid on this item.'
      : 'You received this update because you saved this item to your watchlist.',
  };
}
export function watchLostEmail(
  input: z.input<typeof watchLostMailSchema>,
  extras: z.input<typeof resultMailExtrasSchema> = {},
) {
  return auctionUpdateEmail(input, template, 'Deal result', extras);
}
export function auctionUpdateEmail(
  input: z.input<typeof watchLostMailSchema>,
  content: { text: string; html: string },
  subject: 'Deal result' | 'You were outbid' | 'Your bid is live',
  extras: z.input<typeof resultMailExtrasSchema> = {},
) {
  const data = watchLostMailSchema.parse(input);
  const extra = resultMailExtrasSchema.parse(extras);
  const values: Record<string, string> = {
    ...lossWording(data, extra.firstName),
    imageUrl: extra.imageUrl ?? '',
    title: data.title,
    lotNumber: data.lotNumber,
    price: formatNaira(data.finalPriceKobo),
    itemUrl: data.itemUrl,
  };
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c] ?? c,
    );
  const render = (source: string, html: boolean) =>
    source.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
      html ? escape(values[key] ?? '') : (values[key] ?? ''),
    );
  return {
    Subject: `${subject} for ${data.lotNumber} — GiddyDeal`,
    Text: render(content.text, false),
    HTML: withItemImage(render(content.html, true), extra.imageUrl),
  };
}
