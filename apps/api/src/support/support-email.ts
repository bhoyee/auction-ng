import { EMAIL_BRAND_HEADER } from '../email/branding';
import { z } from 'zod';
export const supportMailSchema = z
  .object({
    heading: z.string().max(120),
    number: z.string().regex(/^SUP-[A-Z2-9]{8}$/),
    conversationId: z.uuid(),
  })
  .strict();
export function supportEmail(input: unknown) {
  const value = supportMailSchema.parse(input);
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
  const href = new URL(
    '/customer-service?conversation=' + value.conversationId,
    origin,
  ).href;
  const escape = (s: string) =>
    s.replace(
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
  const title = escape(value.heading),
    reference = escape(value.number);
  return {
    Subject: `${value.heading} · ${value.number} · LotVanta`,
    Text: `${value.heading}\n\nConversation ${value.number}\n\nOpen your secure conversation to read the update and reply:\n${href}\n\nNever share passwords, verification codes, BVN or full card details with support.\nLotVanta`,
    HTML: `<!doctype html><html lang="en"><body style="margin:0;background:#f5f6f8;color:#151a30;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;padding:32px 16px"><tr><td align="center"><table role="presentation" style="max-width:560px;width:100%;background:white;border:1px solid #e3e6ec;border-radius:12px"><tr><td>${EMAIL_BRAND_HEADER}</td></tr><tr><td style="padding:32px"><p style="color:#556074">Customer support · ${reference}</p><h1 style="font-size:26px;line-height:1.3">${title}</h1><p style="line-height:1.7">There is an update in your support conversation. Open it securely to read the message and reply to our team.</p><p style="margin:28px 0"><a href="${escape(href)}" style="display:inline-block;background:#1c2a6b;color:white;padding:14px 22px;border-radius:8px;font-weight:bold;text-decoration:none">Open conversation</a></p><p style="color:#556074;font-size:14px;line-height:1.7">Never share your password, verification codes, BVN or full card details with support. Your conversation remains available in Customer service.</p></td></tr></table></td></tr></table></body></html>`,
  };
}
