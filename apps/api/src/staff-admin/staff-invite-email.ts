import { z } from 'zod';
import { EMAIL_BRAND_HEADER } from '../email/branding';
import { hashPii } from '../security/pii';
import type { LedgerService } from '../ledger/ledger-service';

type Tx = Parameters<Parameters<LedgerService['db']['$transaction']>[0]>[0];

export const STAFF_INVITE_TEMPLATE = 'staff-invite-v1';

export const staffInviteMailSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    role: z.string().trim().min(1).max(120),
    invitedBy: z.string().trim().min(1).max(120),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type StaffInviteMail = z.infer<typeof staffInviteMailSchema>;

/** Only send while the invitation is still usable. */
export async function staffInviteStillValid(tx: Tx, mail: StaffInviteMail) {
  const row = await tx.staffInvitation.findUnique({
    where: { tokenHash: hashPii(mail.token, 'staff-invite') },
    select: { usedAt: true, expiresAt: true, attempts: true },
  });
  return !!row && !row.usedAt && row.expiresAt > new Date() && row.attempts < 5;
}

function staffOrigin() {
  const origin = new URL(
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
  return origin;
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );

/** The invitation email: who invited them, the role and a one-time link. */
export function staffInviteEmail(input: unknown) {
  const v = staffInviteMailSchema.parse(input);
  const link = new URL('/enroll#' + v.token, staffOrigin()).href;
  const first = v.name.split(/\s+/)[0] ?? v.name;
  const expires =
    new Date(v.expiresAt).toLocaleString('en-NG', {
      timeZone: 'Africa/Lagos',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' WAT';
  const intro = `${v.invitedBy} has invited you to join the GiddyDeal staff workspace as ${v.role}.`;
  const note = `This link works once and expires on ${expires}. If it expires, ask your administrator to invite you again.`;
  const safety =
    'If you weren’t expecting this invitation, you can ignore this email: no account is active until a password is set. GiddyDeal staff will never ask for your password or verification codes.';
  return {
    Subject: 'You’re invited to the GiddyDeal staff workspace',
    Text: `Hello ${first},\n\n${intro}\n\nSet up your account (choose your password):\n${link}\n\n${note}\n\n${safety}\n\nGiddyDeal`,
    HTML: `<!doctype html><html lang="en"><body style="margin:0;background:#f5f6f8;color:#151a30;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;padding:32px 16px"><tr><td align="center"><table role="presentation" style="max-width:560px;width:100%;background:white;border:1px solid #e3e6ec;border-radius:12px"><tr><td>${EMAIL_BRAND_HEADER.replace('Bid. Win. Save.', 'Staff workspace')}</td></tr><tr><td style="padding:32px"><h1 style="font-size:26px;line-height:1.3;margin-top:0">You’re invited to the staff workspace</h1><p style="font-size:16px;line-height:1.7;margin:0 0 12px">Hello ${escape(first)},</p><p style="font-size:16px;line-height:1.7;margin:0">${escape(intro)}</p><p style="margin:28px 0"><a href="${escape(link)}" style="display:inline-block;background:#1c2a6b;color:white;text-decoration:none;border-radius:8px;padding:15px 24px;font-weight:bold">Set up your account</a></p><p style="font-size:14px;line-height:1.7;color:#556074;margin:0 0 12px">${escape(note)}</p><p style="font-size:13px;line-height:1.7;color:#556074;margin:0;overflow-wrap:anywhere">If the button doesn’t work, copy this address into your browser:<br><a href="${escape(link)}" style="color:#1c2a6b">${escape(link)}</a></p></td></tr><tr><td style="padding:20px 32px;border-top:1px solid #e3e6ec;color:#556074;font-size:12px;line-height:1.6">${escape(safety)}<br>GiddyDeal · Staff workspace</td></tr></table></td></tr></table></body></html>`,
  };
}
