import brand from './brand.generated.json';
export const EMAIL_BRAND_HEADER = brand.html;
export function inlineEmailLogo(html: string) {
  return html.replaceAll(
    'cid:' + brand.logo.cid,
    'data:' + brand.logo.contentType + ';base64,' + brand.logo.base64,
  );
}
export function emailLogoAttachments(html: string) {
  return html.includes('cid:' + brand.logo.cid)
    ? [
        {
          filename: brand.logo.filename,
          contentType: brand.logo.contentType,
          cid: brand.logo.cid,
          content: Buffer.from(brand.logo.base64, 'base64'),
        },
      ]
    : [];
}
