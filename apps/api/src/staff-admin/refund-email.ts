import { z } from 'zod';
import { formatNaira, koboSchema } from '@auction-ng/shared';
import template from './refund-email.generated.json';
const schema = z
  .object({
    reference: z.string().min(1).max(40),
    amountKobo: koboSchema,
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
export function refundEmail(input: unknown) {
  const value = schema.parse(input),
    values: Record<string, string> = {
      heading: 'Your refund is in your wallet',
      message:
        'Your purchase refund has been credited to your GiddyDeal wallet. You can view the credit in Wallet activity.',
      reference: value.reference,
      amountLabel: 'Refunded to wallet',
      amount: formatNaira(value.amountKobo),
      walletUrl: value.walletUrl,
    };
  const escape = (text: string) =>
    text.replace(
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
  const render = (text: string, html: boolean) =>
    text.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
      html ? escape(values[key] ?? '') : (values[key] ?? ''),
    );
  return {
    Subject: 'Purchase refund · ' + value.reference + ' · GiddyDeal',
    Text: render(template.text, false),
    HTML: render(template.html, true),
  };
}

/** "Send the invoice again": the same layout, linking to the signed-in page. */
export function invoiceEmail(input: unknown) {
  const value = schema.parse(input);
  const message = refundEmail(value);
  const swap = (text: string) =>
    text
      .replaceAll('Your refund is in your wallet', 'Your GiddyDeal invoice')
      .replaceAll(
        'Your purchase refund has been credited to your GiddyDeal wallet. You can view the credit in Wallet activity.',
        'Open your invoice to view it, or download it as a PDF. You need to sign in.',
      )
      .replaceAll('Refunded to wallet', 'Invoice total')
      .replace(/View (your )?wallet/g, 'View your invoice');
  return {
    Subject: 'Invoice ' + value.reference + ' · GiddyDeal',
    Text: swap(message.Text),
    HTML: swap(message.HTML),
  };
}
