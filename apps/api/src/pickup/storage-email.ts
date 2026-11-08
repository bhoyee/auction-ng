import { EMAIL_BRAND_HEADER } from '../email/branding';
import { z } from 'zod';
import { formatNaira, koboSchema } from '@auction-ng/shared';
import { paymentReturnUrl } from '../payments/payment-return-url';
import type { Prisma } from '../generated/prisma/client';
export const storageMailSchema = z
  .object({
    caseId: z.uuid(),
    revision: z.number().int().positive(),
    phase: z.enum(['ready', 'reminder1', 'reminder2', 'extend', 'waive']),
    title: z.string(),
    lotNumber: z.string(),
    dueAt: z.iso.datetime(),
    dailyKobo: koboSchema,
    capKobo: koboSchema,
    waived: z.boolean().default(false),
  })
  .strict();
export async function storageNoticeRelevant(
  tx: Prisma.TransactionClient,
  reference: string | null,
) {
  const [prefix, phase, id, revision] = (reference ?? '').split(':');
  if (prefix !== 'storage' || !id || !z.uuid().safeParse(id).success)
    return false;
  const row = await tx.pickupStorageCase.findUnique({ where: { id } });
  return (
    !!row &&
    !row.collectedAt &&
    row.termsRevision === Number(revision) &&
    (!phase?.startsWith('reminder') || row.dueAt > new Date())
  );
}
export function storageEmail(input: unknown) {
  const v = storageMailSchema.parse(input);
  const heading =
    v.phase === 'ready'
      ? 'Your collection window is ready'
      : v.phase === 'extend'
        ? 'Your collection deadline has changed'
        : v.phase === 'waive'
          ? 'Your storage charge has been waived'
          : 'A reminder to collect your item';
  const due =
    new Date(v.dueAt).toLocaleString('en-NG', {
      timeZone: 'Africa/Lagos',
      dateStyle: 'full',
      timeStyle: 'short',
    }) + ' WAT';
  const link = new URL(
    '/awaiting-pickup',
    paymentReturnUrl('purchase', v.caseId),
  ).href;
  const policy =
    v.waived || v.phase === 'waive'
      ? 'Unpaid and future storage charges for this item are waived. Previously paid charges are not automatically refunded.'
      : `Five centre working days are free. Late storage is ${formatNaira(v.dailyKobo)} per working day, capped at ${formatNaira(v.capKobo)} per item.`;
  const text = `${heading}\n\n${v.title}\nItem ${v.lotNumber}\nCollect by ${due}.\n${policy} Storage is paid explicitly at collection; your wallet is never automatically charged. Contact support if you need help.\n\nView pickup details: ${link}`;
  const escape = (value: string) =>
    value.replace(
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
    Subject: `${heading} · ${v.lotNumber} · LotVanta`,
    Text: text,
    HTML: `<!doctype html><html><body style="margin:0;background:#F5F6F8;font-family:Arial,sans-serif;color:#151A30"><table role="presentation" width="100%"><tr><td style="padding:32px 16px"><table role="presentation" style="max-width:600px;width:100%;margin:auto;background:#fff;border:1px solid #E3E6EC;border-radius:12px"><tr><td>${EMAIL_BRAND_HEADER}</td></tr><tr><td style="padding:28px"><h1 style="font-size:24px;line-height:1.3">${escape(heading)}</h1><p>${escape(v.title)}</p><p style="color:#556074">Item ${escape(v.lotNumber)}</p><p style="padding:18px;background:#EEF0FA;border-radius:8px"><strong>Collect by ${escape(due)}</strong></p><p style="line-height:1.7">${escape(policy)}</p><p style="line-height:1.7">Storage is paid explicitly at collection. Your wallet is never automatically charged. Contact support if you need help.</p><p style="margin-top:24px"><a href="${escape(link)}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#1C2A6B;color:#fff;text-decoration:none;font-weight:700">View pickup details</a></p></td></tr></table></td></tr></table></body></html>`,
  };
}
