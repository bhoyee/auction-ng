import { EMAIL_BRAND_HEADER } from '../email/branding';
import { staffNoticeMessageSchema } from './staff-activity-service';
export function staffActivityEmail(input: unknown) {
  const v = staffNoticeMessageSchema.parse(input),
    origin = new URL(
      (process.env.STAFF_WEB_ORIGINS ?? 'http://localhost:3301')
        .split(',')[0]
        ?.trim() ?? '',
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
    throw Error('Configure the staff website origin.');
  const href = new URL(v.href, origin).href;
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
  return {
    Subject: v.title + ' · LotVanta staff',
    Text: `${v.title}\n\n${v.description}\n\nOpen your secure staff workspace:\n${href}\n\nThis alert does not approve a request or change any funds. Sign in to review the latest status.\nLotVanta`,
    HTML: `<!doctype html><html lang="en"><body style="margin:0;background:#f5f6f8;color:#151a30;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;padding:32px 16px"><tr><td align="center"><table role="presentation" style="max-width:560px;width:100%;background:white;border:1px solid #e3e6ec;border-radius:12px"><tr><td>${EMAIL_BRAND_HEADER.replace('Bid. Win. Save.', 'Staff workspace')}</td></tr><tr><td style="padding:32px"><h1 style="font-size:26px;line-height:1.3;margin-top:0">${escape(v.title)}</h1><p style="font-size:16px;line-height:1.7">${escape(v.description)}</p><p style="margin:28px 0"><a href="${escape(href)}" style="display:inline-block;background:#1c2a6b;color:white;text-decoration:none;border-radius:8px;padding:15px 24px;font-weight:bold">Open staff workspace</a></p><p style="font-size:13px;line-height:1.7;color:#556074">This alert does not approve a request or change any funds. Sign in to review the latest status.</p></td></tr><tr><td style="padding:20px 32px;border-top:1px solid #e3e6ec;color:#556074;font-size:12px;line-height:1.6">Keep passwords and verification codes private.<br>LotVanta · Operations notifications</td></tr></table></td></tr></table></body></html>`,
  };
}
