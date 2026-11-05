import { z } from 'zod';
import { watchLostMailSchema } from './watch-lost-email';
export const watchLaunchMailSchema = watchLostMailSchema
  .omit({ finalPriceKobo: true })
  .extend({ phase: z.enum(['soon', 'live']), startsAt: z.iso.datetime() })
  .strict();
export function watchLaunchEmail(input: unknown) {
  const v = watchLaunchMailSchema.parse(input);
  const heading =
    v.phase === 'live'
      ? 'Your watched auction is live'
      : 'Your watched auction starts soon';
  const time =
    new Intl.DateTimeFormat('en-NG', {
      timeZone: 'Africa/Lagos',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(v.startsAt)) + ' WAT';
  const copy =
    v.phase === 'live'
      ? 'Bidding is now open. View the current price and fees before placing your bid.'
      : `Bidding is scheduled to open on ${time}. Open the item to check the latest launch time.`;
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
    Subject: heading + ' — LotVanta',
    Text: `${heading}\n\n${v.title}\nItem ${v.lotNumber}\n\n${copy}\n${v.itemUrl}\n\nWatching an item does not place a bid. Keep your password and verification codes private.`,
    HTML: `<!doctype html><html lang="en"><body style="margin:0;background:#F5F6F8;color:#151A30;font-family:'Schibsted Grotesk',Arial,sans-serif"><table role="presentation" width="100%" style="padding:24px 16px"><tr><td align="center"><table role="presentation" style="width:100%;max-width:560px;background:#fff;border:1px solid #E3E6EC;border-radius:12px"><tr><td style="padding:24px;background:#1C2A6B;color:#fff;font-size:24px;font-weight:700">LotVanta</td></tr><tr><td style="padding:28px"><h1 style="font-size:26px;line-height:1.3">${heading}</h1><p style="font-size:18px;font-weight:700">${escape(v.title)}</p><p style="color:#556074">Item ${escape(v.lotNumber)}</p><p style="font-size:16px;line-height:1.7">${escape(copy)}</p><p style="margin:28px 0"><a href="${escape(v.itemUrl)}" style="display:inline-block;background:#1C2A6B;color:white;border-radius:8px;padding:15px 24px;text-decoration:none;font-weight:700">View auction</a></p><p style="font-size:13px;line-height:1.6;color:#556074">Watching an item does not place a bid. Keep your password and verification codes private.</p></td></tr></table></td></tr></table></body></html>`,
  };
}
