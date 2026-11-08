import { tokens } from '../tokens.ts';
import { emailBrandHeader } from './brand.ts';
export function refundEmailTemplate() {
  const c = tokens.colors;
  return {
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:${c.canvas};color:${c.ink};font-family:'${tokens.fontFamily}',Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 16px"><table role="presentation" width="100%" style="max-width:600px;background:${c.surface};border:1px solid ${c.line};border-radius:${tokens.radius.card}px"><tr><td style="padding:24px">${emailBrandHeader()}<h1 style="font-size:24px;line-height:30px">{{heading}}</h1><p style="line-height:1.7">{{message}}</p><p style="color:${c['slate-600']}">Reference {{reference}}</p><p style="padding:16px;background:${c['indigo-50']};border-radius:${tokens.radius.control}px">{{amountLabel}}: <strong>{{amount}}</strong></p><p><a href="{{walletUrl}}" style="display:inline-block;padding:14px 22px;background:${c['indigo-900']};color:${c.surface};border-radius:${tokens.radius.control}px;text-decoration:none;font-weight:700">View your wallet</a></p><p style="font-size:13px;line-height:1.6;color:${c['slate-600']}">Keep your password and verification codes private.</p></td></tr></table></td></tr></table></body></html>`,
    text: 'LotVanta\n\n{{heading}}\n{{message}}\n\nReference: {{reference}}\n{{amountLabel}}: {{amount}}\n\nView your wallet: {{walletUrl}}\nKeep your password and verification codes private.',
  };
}
