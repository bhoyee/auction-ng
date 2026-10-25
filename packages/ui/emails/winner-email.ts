import { tokens } from '../tokens.ts';

export function winnerEmailTemplate() {
  const { colors: c, spacing: s, radius: r, typography: t } = tokens;
  const font = `'${tokens.fontFamily}', Arial, sans-serif`;
  const row = (label: string, key: string) =>
    `<tr><th align="left" style="padding:${s.md}px 0;font-weight:400;color:${c['slate-600']};">${label}</th><td align="right" style="padding:${s.md}px 0;font-variant-numeric:tabular-nums;white-space:nowrap;">{{${key}}}</td></tr>`;
  return {
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Your auction result — Auction NG</title><style>@media only screen and (max-width:600px){.outer{padding:${s.xl}px ${s.lg}px!important}.content{padding:${s.xl}px!important}}</style></head>
<body style="margin:0;background:${c.canvas};color:${c.ink};font-family:${font};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{{summary}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" class="outer" style="padding:${s['3xl']}px ${s.lg}px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${tokens.measure.body}px;background:${c.surface};border:1px solid ${c.line};border-radius:${r.card}px;"><tr><td class="content" style="padding:${s['2xl']}px;">
<p style="margin:0 0 ${s['2xl']}px;color:${c['indigo-900']};font-size:${t.section.fontSize}px;line-height:${t.section.lineHeight}px;font-weight:700;">Auction NG</p>
<h1 style="margin:0 0 ${s.md}px;font-size:${t.section.fontSize}px;line-height:${t.section.lineHeight}px;">{{heading}}</h1>
<p style="margin:0 0 ${s.xl}px;font-size:${t.body.fontSize}px;line-height:${t.body.lineHeight}px;">{{summary}}</p>
<p style="margin:0;color:${c['slate-600']};font-size:${t.secondary.fontSize}px;line-height:${t.secondary.lineHeight}px;">Lot {{lotNumber}}</p>
<h2 style="margin:${s.xs}px 0 ${s.xl}px;font-size:${t.detail.fontSize}px;line-height:${t.detail.lineHeight}px;overflow-wrap:anywhere;">{{title}}</h2>
<table aria-label="Invoice breakdown" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${c.line};border-bottom:1px solid ${c.line};font-size:${t.secondary.fontSize}px;line-height:${t.secondary.lineHeight}px;">
${row('Winning bid', 'hammer')}${row('Buyer premium', 'premium')}${row('Lot fee', 'lotFee')}${row('VAT on fees', 'vat')}
<tr><th align="left" style="padding:${s.lg}px 0;border-top:1px solid ${c.line};font-size:${t.body.fontSize}px;">Total</th><td align="right" style="padding:${s.lg}px 0;border-top:1px solid ${c.line};font-size:${t.detail.fontSize}px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;">{{total}}</td></tr></table>
<p style="margin:${s.lg}px 0 ${s.xl}px;color:${c['indigo-900']};font-size:${t.secondary.fontSize}px;line-height:${t.secondary.lineHeight}px;font-weight:600;">{{payment}}</p>
<h2 style="margin:0 0 ${s.sm}px;font-size:${t.body.fontSize}px;line-height:${t.body.lineHeight}px;">{{nextHeading}}</h2>
<p style="margin:0 0 ${s.lg}px;font-size:${t.secondary.fontSize}px;line-height:${t.secondary.lineHeight}px;">{{next}}</p>
<p style="margin:0 0 ${s.xl}px;font-size:${t.secondary.fontSize}px;line-height:${t.secondary.lineHeight}px;"><strong>{{location}}</strong><br>{{address}}</p>
<p style="margin:0;padding-top:${s.lg}px;border-top:1px solid ${c.line};color:${c['slate-600']};font-size:${t.fine.fontSize}px;line-height:${t.fine.lineHeight}px;overflow-wrap:anywhere;">Invoice {{invoiceNumber}}<br>Keep your pickup pass private. Auction NG staff will never ask for your sign-in code.</p>
</td></tr></table><!--[if mso]></td></tr></table><![endif]-->
<p style="margin:${s.xl}px ${s.lg}px 0;color:${c['slate-600']};font-size:${t.fine.fontSize}px;line-height:${t.fine.lineHeight}px;">Auction NG · Your auction receipt<br>This is an automated message. Please do not reply.</p>
</td></tr></table></body></html>`,
    text: 'Auction NG\n\n{{heading}}\n{{summary}}\n\nLot {{lotNumber}}\n{{title}}\nInvoice {{invoiceNumber}}\n\nWinning bid: {{hammer}}\nBuyer premium: {{premium}}\nLot fee: {{lotFee}}\nVAT on fees: {{vat}}\nTotal: {{total}}\n\n{{payment}}\n\n{{nextHeading}}\n{{next}}\n{{location}}\n{{address}}\n\nKeep your pickup pass private. Auction NG staff will never ask for your sign-in code.\nThis is an automated message. Please do not reply.',
  };
}
