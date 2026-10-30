import { z } from 'zod';
import { formatNaira, koboSchema } from '@auction-ng/shared';
import template from './watch-lost-email.generated.json';
export const watchLostMailSchema = z
  .object({
    title: z.string().min(1).max(200),
    lotNumber: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[^\r\n]+$/),
    finalPriceKobo: koboSchema,
    itemUrl: z.url().refine((value) => {
      const u = new URL(value);
      return (
        !u.username &&
        !u.password &&
        (u.protocol === 'https:' ||
          (u.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(u.hostname)))
      );
    }),
  })
  .strict();
export function watchLostEmail(input: z.input<typeof watchLostMailSchema>) {
  return auctionUpdateEmail(input, template, 'Auction result');
}
export function auctionUpdateEmail(
  input: z.input<typeof watchLostMailSchema>,
  content: { text: string; html: string },
  subject: 'Auction result' | 'You were outbid',
) {
  const data = watchLostMailSchema.parse(input);
  const values: Record<string, string> = {
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
    Subject: `${subject} for ${data.lotNumber} — Auction NG`,
    Text: render(content.text, false),
    HTML: render(content.html, true),
  };
}
