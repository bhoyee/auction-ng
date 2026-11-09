import { tokens } from '../tokens.ts';
export const EMAIL_LOGO_CID = 'lotvanta-brand-logo';
/** Embedded asset only: no remote font, image request or recipient tracking. */
export function emailBrandHeader() {
  const c = tokens.colors;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:${c['indigo-900']};border-bottom:4px solid ${c['danfo-400']};border-radius:${tokens.radius.control}px"><tr><td style="padding:20px 24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${c.surface};padding:8px 12px;border-radius:${tokens.radius.control}px"><img src="cid:${EMAIL_LOGO_CID}" alt="LotVanta" width="176" style="display:block;width:176px;max-width:100%;height:auto;border:0;color:${c['indigo-900']};font-size:22px;font-weight:700"></td></tr></table><p style="margin:14px 0 0;color:${c['danfo-400']};font-size:15px;line-height:22px;font-weight:700">Bid. Win. Save.</p></td></tr></table>`;
}
