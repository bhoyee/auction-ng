import { z } from 'zod';
import { formatNaira, koboSchema } from '@auction-ng/shared';
import template from './prebid-email.generated.json';
const schema = z
  .object({
    lotNumber: z.string().min(1).max(40),
    title: z.string().min(1).max(200),
    reason: z.string().max(500),
    releasedKobo: koboSchema,
  })
  .strict();
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
export function preBidEmail(input: unknown) {
  const value = schema.parse(input),
    values: Record<string, string> = {
      title: value.title,
      lotNumber: value.lotNumber,
      reason: value.reason,
      released: formatNaira(value.releasedKobo),
    };
  const render = (text: string, html: boolean) =>
    text.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
      html ? escape(values[key] ?? '') : (values[key] ?? ''),
    );
  return {
    Subject: `Pre-bid cancelled · ${value.lotNumber} · Auction NG`,
    Text: render(template.text, false),
    HTML: render(template.html, true),
  };
}
