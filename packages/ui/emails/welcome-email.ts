import { emailBrandHeader } from './brand.ts';
import { tokens } from '../tokens.ts';

// Sent once after a buyer verifies their email and the account is created.
// Only describes what is live today: no delivery or app-store claims.
const steps = [
  {
    title: 'Add money to your wallet',
    body: 'Top up by bank transfer to your own LotVanta account number, or by card. Your money stays in your wallet until you use it.',
  },
  {
    title: 'Bid on what you want',
    body: 'When you bid, we hold the full amount, fees included, in your wallet. You’re only charged if you win. If someone outbids you, the money goes straight back to your wallet.',
  },
  {
    title: 'Win and collect',
    body: 'When you win, payment comes from your wallet automatically. Collect your item from the pickup centre within 5 working days, using the QR pickup pass in your account.',
  },
];

export function welcomeEmailTemplate() {
  const { colors: c, spacing: s, radius: r, typography: t } = tokens;
  const font = `'${tokens.fontFamily}', Arial, sans-serif`;
  const heading = 'Welcome to LotVanta';
  const intro =
    'New items go up for auction every day, often far below shop prices. Here’s how to get started:';
  const repeat = 'Then do it again: new auctions start every day.';
  const action = 'Browse today’s auctions';
  const safety =
    'We’ll never ask for your password or a sign-in code. If anyone does, it isn’t us.';
  const stepRows = steps
    .map(
      (step, index) =>
        `<tr><td valign="top" style="padding:0 ${s.lg}px ${s.xl}px 0;width:36px;"><div style="width:32px;height:32px;line-height:32px;border-radius:50%;background:${c['indigo-900']};color:${c.surface};font-weight:700;text-align:center;font-size:${t.secondary.fontSize}px;">${index + 1}</div></td><td valign="top" style="padding:0 0 ${s.xl}px;"><p style="margin:0 0 ${s.xs}px;font-size:${t.detail.fontSize}px;line-height:${t.detail.lineHeight}px;font-weight:700;">${step.title}</p><p style="margin:0;font-size:${t.body.fontSize}px;line-height:${t.body.lineHeight}px;color:${c.ink};">${step.body}</p></td></tr>`,
    )
    .join('');
  return {
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to LotVanta</title><style>@media only screen and (max-width:600px){.outer{padding:${s.xl}px ${s.lg}px!important}.content{padding:${s.xl}px!important}}</style></head>
<body style="margin:0;background:${c.canvas};color:${c.ink};font-family:${font};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Add money, bid, win and collect. Here’s how LotVanta works.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="outer" align="center" style="padding:${s['3xl']}px ${s.lg}px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${tokens.measure.body}px;background:${c.surface};border:1px solid ${c.line};border-radius:${r.card}px;"><tr><td class="content" style="padding:${s['2xl']}px;">
${emailBrandHeader()}
<h1 style="margin:0 0 ${s.md}px;font-size:${t.section.fontSize}px;line-height:${t.section.lineHeight}px;">${heading}</h1>
<p style="margin:0 0 ${s.sm}px;font-size:${t.body.fontSize}px;line-height:${t.body.lineHeight}px;">Hi {{name}},</p>
<p style="margin:0 0 ${s.xl}px;font-size:${t.body.fontSize}px;line-height:${t.body.lineHeight}px;">${intro}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stepRows}</table>
<p style="margin:0 0 ${s.xl}px;font-size:${t.body.fontSize}px;line-height:${t.body.lineHeight}px;font-weight:700;">${repeat}</p>
<a href="{{browseUrl}}" style="display:inline-block;padding:${s.lg}px ${s.xl}px;border-radius:${r.control}px;background:${c['indigo-900']};color:${c.surface};font-weight:600;text-decoration:none;">${action}</a>
<p style="margin:${s.lg}px 0 0;font-size:${t.secondary.fontSize}px;line-height:${t.secondary.lineHeight}px;"><a href="{{walletUrl}}" style="color:${c['indigo-900']};font-weight:600;">Add money to your wallet</a></p>
<p style="margin:${s['2xl']}px 0 0;padding-top:${s.lg}px;border-top:1px solid ${c.line};color:${c['slate-600']};font-size:${t.fine.fontSize}px;line-height:${t.fine.lineHeight}px;">${safety} You received this email because you created a LotVanta account.</p>
</td></tr></table><p style="margin:${s.xl}px 0 0;color:${c['slate-600']};font-size:${t.fine.fontSize}px;">LotVanta · Welcome</p></td></tr></table></body></html>`,
    text: `LotVanta\n\n${heading}\n\nHi {{name}},\n\n${intro}\n\n${steps
      .map((step, i) => `${i + 1}. ${step.title}\n${step.body}`)
      .join(
        '\n\n',
      )}\n\n${repeat}\n\n${action}: {{browseUrl}}\nAdd money to your wallet: {{walletUrl}}\n\n${safety} You received this email because you created a LotVanta account.`,
  };
}
