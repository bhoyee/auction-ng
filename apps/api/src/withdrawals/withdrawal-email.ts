import { z } from 'zod';
import { formatNaira, koboSchema } from '@auction-ng/shared';
import template from './withdrawal-email.generated.json';
export const withdrawalMailSchema = z
  .object({
    reference: z.string().regex(/^[A-F0-9]{8}$/),
    last4: z.string().regex(/^\d{4}$/),
    status: z.enum(['success', 'failed', 'reversed', 'rejected']),
    amountKobo: koboSchema,
    feeKobo: koboSchema,
    returnedKobo: koboSchema,
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
export function withdrawalEmail(input: z.input<typeof withdrawalMailSchema>) {
  const data = withdrawalMailSchema.parse(input),
    sent = data.status === 'success';
  const heading = sent
    ? 'Your withdrawal was sent'
    : data.status === 'reversed'
      ? 'Your withdrawal was reversed'
      : data.status === 'rejected'
        ? 'Your withdrawal was declined'
        : 'Your withdrawal did not complete';
  const values: Record<string, string> = {
    heading,
    message: sent
      ? 'Your withdrawal has been sent to your verified bank account. Your bank may take longer to display the credit.'
      : 'The available refund has been returned to your wallet. Any provider charges retained are shown below.',
    reference: data.reference,
    last4: data.last4,
    amountLabel: sent ? 'Sent to your bank' : 'Returned to your wallet',
    amount: formatNaira(sent ? data.amountKobo : data.returnedKobo),
    feeLabel: sent ? 'Fees and levy' : 'Retained provider charges',
    fees: formatNaira(data.feeKobo),
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
  const render = (value: string, html: boolean) =>
    value.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
      html ? escape(values[key] ?? '') : (values[key] ?? ''),
    );
  return {
    Subject: `${heading} — Auction NG`,
    HTML: render(template.html, true),
    Text: render(template.text, false),
  };
}
