import { tokens } from '../tokens.ts';

export function watchLostEmailTemplate(
  kind: 'watch-lost' | 'outbid' = 'watch-lost',
) {
  const outbid = kind === 'outbid';
  const heading = outbid ? 'You were outbid' : 'Another buyer won this item';
  const intro = outbid
    ? 'Another bid moved ahead of yours. Open the item to check the latest price and decide whether to bid again.'
    : 'The auction has ended and this item was sold to another buyer.';
  const priceLabel = outbid ? 'Price at the time' : 'Final price';
  const note = outbid
    ? 'Your private bidding limit stays private. Check the current price, closing time and total cost before confirming another bid.'
    : 'No payment is due from you for this item. It remains in the Lost tab of your watchlist for reference.';
  const action = outbid ? 'View item and bid again' : 'View auction result';
  const reason = outbid
    ? 'You received this update because you placed a bid on this item.'
    : 'You received this update because you saved this item to your watchlist.';
  const { colors: c, spacing: s, radius: r, typography: t } = tokens;
  const font = `'${tokens.fontFamily}', Arial, sans-serif`;
  return {
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auction update — Auction NG</title><style>@media only screen and (max-width:600px){.outer{padding:${s.xl}px ${s.lg}px!important}.content{padding:${s.xl}px!important}}</style></head>
<body style="margin:0;background:${c.canvas};color:${c.ink};font-family:${font};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${outbid ? 'Your bid was overtaken. Check the latest price.' : 'An update on an item you watched.'}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="outer" align="center" style="padding:${s['3xl']}px ${s.lg}px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${tokens.measure.body}px;background:${c.surface};border:1px solid ${c.line};border-radius:${r.card}px;"><tr><td class="content" style="padding:${s['2xl']}px;">
<p style="margin:0 0 ${s['2xl']}px;color:${c['indigo-900']};font-size:${t.section.fontSize}px;font-weight:700;">Auction NG</p>
<h1 style="margin:0 0 ${s.md}px;font-size:${t.section.fontSize}px;line-height:${t.section.lineHeight}px;">${heading}</h1>
<p style="margin:0 0 ${s.xl}px;font-size:${t.body.fontSize}px;line-height:${t.body.lineHeight}px;">${intro}</p>
<p style="margin:0;color:${c['slate-600']};font-size:${t.secondary.fontSize}px;">Item {{lotNumber}}</p>
<h2 style="margin:${s.sm}px 0 ${s.xl}px;font-size:${t.detail.fontSize}px;line-height:${t.detail.lineHeight}px;overflow-wrap:anywhere;">{{title}}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${c.line};border-bottom:1px solid ${c.line};"><tr><td style="padding:${s.lg}px 0;color:${c['slate-600']};">${priceLabel}</td><td align="right" style="padding:${s.lg}px 0;font-size:${t.detail.fontSize}px;font-weight:700;white-space:nowrap;">{{price}}</td></tr></table>
<p style="margin:${s.xl}px 0;font-size:${t.body.fontSize}px;line-height:${t.body.lineHeight}px;">${note}</p>
<a href="{{itemUrl}}" style="display:inline-block;padding:${s.lg}px ${s.xl}px;border-radius:${r.control}px;background:${c['indigo-900']};color:${c.surface};font-weight:600;text-decoration:none;">${action}</a>
<p style="margin:${s['2xl']}px 0 0;padding-top:${s.lg}px;border-top:1px solid ${c.line};color:${c['slate-600']};font-size:${t.fine.fontSize}px;line-height:${t.fine.lineHeight}px;">${reason} Auction NG staff will never ask for your sign-in code.</p>
</td></tr></table><p style="margin:${s.xl}px 0 0;color:${c['slate-600']};font-size:${t.fine.fontSize}px;">Auction NG · ${outbid ? 'Your bid update' : 'Your watched auction update'}</p></td></tr></table></body></html>`,
    text: `Auction NG\n\n${heading}\n${intro}\n\n{{title}}\nItem {{lotNumber}}\n${priceLabel}: {{price}}\n\n${note}\n${action}: {{itemUrl}}\n\n${reason} Auction NG staff will never ask for your sign-in code.`,
  };
}
