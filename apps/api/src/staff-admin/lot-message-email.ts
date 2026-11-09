import { EMAIL_BRAND_HEADER } from '../email/branding';
import { z } from 'zod';
export const lotMessageSchema = z
  .object({
    lotId: z.uuid(),
    lotNumber: z.string().max(80),
    title: z.string().max(300),
    message: z.string().trim().min(5).max(2000),
  })
  .strict();
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
export function lotMessageEmail(input: unknown) {
  const value = lotMessageSchema.parse(input);
  const origin = new URL(
    process.env.PAYMENT_RETURN_ORIGIN ?? 'http://localhost:3300',
  );
  if (
    origin.username ||
    origin.password ||
    !(
      origin.protocol === 'https:' ||
      (origin.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(origin.hostname))
    )
  )
    throw Error('Configure the buyer website origin.');
  const href = new URL('/lots/' + value.lotId, origin).href;
  return {
    Subject: `Item update · ${value.lotNumber} · LotVanta`,
    Text: `An update from LotVanta\n\n${value.title}\nItem ${value.lotNumber}\n\n${value.message}\n\nView item: ${href}\n\nNever share passwords or verification codes. Confirm payments only inside LotVanta.`,
    HTML: `<!doctype html><html lang="en"><body style="margin:0;background:#f5f6f8;color:#151a30;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;padding:24px 16px"><tr><td align="center"><table role="presentation" style="max-width:560px;width:100%;background:white;border:1px solid #e3e6ec;border-radius:12px"><tr><td>${EMAIL_BRAND_HEADER}</td></tr><tr><td style="padding:32px"><p style="font-size:13px;color:#556074">Item ${escape(value.lotNumber)}</p><h1 style="font-size:24px;line-height:1.3">An update about your auction</h1><h2 style="font-size:17px">${escape(value.title)}</h2><p style="font-size:16px;line-height:1.7;white-space:pre-wrap">${escape(value.message)}</p><p style="margin:28px 0"><a href="${escape(href)}" style="display:inline-block;background:#1c2a6b;color:white;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">View item</a></p><p style="font-size:13px;line-height:1.7;color:#556074">Never share passwords or verification codes. Confirm payments only inside LotVanta.</p></td></tr></table></td></tr></table></body></html>`,
  };
}
