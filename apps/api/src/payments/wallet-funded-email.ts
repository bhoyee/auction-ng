import { z } from 'zod';
import { formatNaira, koboSchema } from '@auction-ng/shared';
import template from './wallet-funded-email.generated.json';
export const walletFundedMailSchema = z
  .object({
    amountKobo: koboSchema,
    method: z.enum(['card', 'bank_transfer', 'checkout_transfer']),
    reference: z.string().regex(/^[A-F0-9]{8}$/),
    walletUrl: z.url().refine((value) => {
      const url = new URL(value);
      return (
        !url.username &&
        !url.password &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(url.hostname)))
      );
    }),
  })
  .strict();
const methods = {
  card: 'Card',
  bank_transfer: 'Bank transfer to your account number',
  checkout_transfer: 'Bank transfer',
} as const;
export function walletFundedEmail(
  input: z.input<typeof walletFundedMailSchema>,
) {
  const data = walletFundedMailSchema.parse(input);
  const values: Record<string, string> = {
    amount: formatNaira(data.amountKobo),
    method: methods[data.method],
    reference: data.reference,
    walletUrl: data.walletUrl,
  };
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char] ?? char,
    );
  const render = (source: string, html: boolean) =>
    source.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
      html ? escape(values[key] ?? '') : (values[key] ?? ''),
    );
  return {
    Subject: `${values.amount} added to your wallet — GiddyDeal`,
    Text: render(template.text, false),
    HTML: render(template.html, true),
  };
}
