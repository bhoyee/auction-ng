import { emailBrandHeader } from './brand.ts';
import { tokens } from '../tokens.ts';

/**
 * Saved-search alert email (2026-11-28): sent straight away or as the daily
 * digest. The API repeats `group` once per saved search and `item` once per
 * deal, escaping every value, then places them at {{{groups}}} / {{{items}}}.
 * Item photos sit between markers the API removes when there is no photo.
 */
export function savedSearchEmailTemplate() {
  const { colors: c, spacing: s, radius: r, typography: t } = tokens;
  const font = `'${tokens.fontFamily}', Arial, sans-serif`;
  const item = `<tr><td width="88" valign="top" style="padding:${s.md}px ${s.lg}px ${s.md}px 0;"><!--item-image--><a href="{{itemUrl}}"><img src="{{imageUrl}}" alt="" width="72" height="72" style="display:block;width:72px;height:72px;object-fit:cover;border:1px solid ${c.line};border-radius:${r.control}px;"></a><!--/item-image--></td><td valign="top" style="padding:${s.md}px 0;"><a href="{{itemUrl}}" style="color:${c.ink};font-weight:600;text-decoration:none;overflow-wrap:anywhere;">{{title}}</a><p style="margin:${s.xs}px 0 0;color:${c['slate-600']};font-size:${t.secondary.fontSize}px;line-height:${t.secondary.lineHeight}px;">Starting price {{price}} · Closes {{closes}}</p></td></tr>`;
  const group = `<h2 style="margin:${s.xl}px 0 ${s.sm}px;font-size:${t.detail.fontSize}px;line-height:${t.detail.lineHeight}px;overflow-wrap:anywhere;">{{label}}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${c.line};">{{{items}}}</table>
<p style="margin:${s.sm}px 0 0;"><a href="{{searchUrl}}" style="color:${c['indigo-900']};font-weight:600;">{{more}}</a></p>`;
  return {
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saved search — GiddyDeal</title><style>@media only screen and (max-width:600px){.outer{padding:${s.xl}px ${s.lg}px!important}.content{padding:${s.xl}px!important}}</style></head>
<body style="margin:0;background:${c.canvas};color:${c.ink};font-family:${font};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{{heading}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="outer" align="center" style="padding:${s['3xl']}px ${s.lg}px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${tokens.measure.body}px;background:${c.surface};border:1px solid ${c.line};border-radius:${r.card}px;"><tr><td class="content" style="padding:${s['2xl']}px;">
${emailBrandHeader()}
<h1 style="margin:0 0 ${s.md}px;font-size:${t.section.fontSize}px;line-height:${t.section.lineHeight}px;">{{heading}}</h1>
<p style="margin:0;font-size:${t.body.fontSize}px;line-height:${t.body.lineHeight}px;">{{intro}}</p>
{{{groups}}}
<p style="margin:${s['2xl']}px 0 0;padding-top:${s.lg}px;border-top:1px solid ${c.line};color:${c['slate-600']};font-size:${t.fine.fontSize}px;line-height:${t.fine.lineHeight}px;">You received this email because you saved a search on GiddyDeal. Prices can change once bidding starts. <a href="{{manageUrl}}" style="color:${c['slate-600']};">Manage saved-search emails</a></p>
</td></tr></table><p style="margin:${s.xl}px 0 0;color:${c['slate-600']};font-size:${t.fine.fontSize}px;">GiddyDeal · Your saved searches</p></td></tr></table></body></html>`,
    text: `GiddyDeal\n\n{{heading}}\n{{intro}}\n{{{groups}}}\n\nYou received this email because you saved a search on GiddyDeal. Prices can change once bidding starts.\nManage saved-search emails: {{manageUrl}}`,
    group,
    groupText: `\n{{label}}\n{{{items}}}{{more}}: {{searchUrl}}\n`,
    item,
    itemText: `- {{title}}. Starting price {{price}}, closes {{closes}}. {{itemUrl}}\n`,
  };
}
