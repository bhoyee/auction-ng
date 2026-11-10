import { createHash, randomInt } from 'node:crypto';
import { ConflictException, HttpException } from '@nestjs/common';
import { z } from 'zod';
import type { ContactMessageInput } from '@auction-ng/shared';
import type { LedgerService } from '../ledger/ledger-service';
import { createMailDelivery, type MailDelivery } from '../email/mail-delivery';
import { decryptPii, encryptPii } from '../security/pii';
import {
  contactAckEmail,
  contactInboxEmail,
  type ContactPayload,
} from './contact-email';

const MAX_ATTEMPTS = 8;

type Verifier = (token: string | undefined, ip: string) => Promise<boolean>;

// Cloudflare Turnstile, checked only when a secret key is configured.
export const verifyTurnstile: Verifier = async (token, ip) => {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (!token) return false;
  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(5000),
      },
    );
    const result = z
      .object({ success: z.boolean() })
      .safeParse(await response.json());
    return result.success && result.data.success;
  } catch {
    return false;
  }
};

export class ContactService {
  constructor(
    private readonly db: LedgerService['db'],
    private readonly mail: MailDelivery | undefined = createMailDelivery(
      process.env.AUTH_MODE,
      process.env,
      'support@auction-ng.test',
    ),
    private readonly verify: Verifier = verifyTurnstile,
    private readonly inbox = (
      process.env.CONTACT_INBOX_EMAIL ??
      process.env.SUPPORT_EMAIL ??
      ''
    ).trim(),
  ) {}

  // Stores the message once per request key and tries to email it straight
  // away; the worker's delivery loop retries anything still pending.
  async submit(
    input: ContactMessageInput,
    ip: string,
  ): Promise<{ reference: string }> {
    if (!(await this.verify(input.turnstileToken, ip)))
      throw new HttpException(
        'Please complete the security check and try again.',
        400,
      );
    const payload: ContactPayload = {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      topic: input.topic,
      ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
      message: input.message.trim(),
    };
    const requestHash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    const existing = await this.db.contactMessage.findUnique({
      where: { requestKey: input.requestKey },
      select: { reference: true, requestHash: true },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ConflictException(
          'This request was already used for a different message.',
        );
      return { reference: existing.reference };
    }
    const ciphertext = encryptPii(JSON.stringify(payload), 'contact');
    let row: { id: string; reference: string } | undefined;
    for (let attempt = 0; !row && attempt < 5; attempt++) {
      const reference = `CS-${randomInt(100000, 1000000)}`;
      const created = await this.db.contactMessage.createMany({
        data: [
          {
            reference,
            requestKey: input.requestKey,
            requestHash,
            payloadCiphertext: ciphertext,
          },
        ],
        skipDuplicates: true,
      });
      if (created.count === 1)
        row = await this.db.contactMessage.findUniqueOrThrow({
          where: { reference },
          select: { id: true, reference: true },
        });
      else {
        // A concurrent retry with the same key won the insert.
        const raced = await this.db.contactMessage.findUnique({
          where: { requestKey: input.requestKey },
          select: { id: true, reference: true, requestHash: true },
        });
        if (raced) {
          if (raced.requestHash !== requestHash)
            throw new ConflictException(
              'This request was already used for a different message.',
            );
          return { reference: raced.reference };
        }
      }
    }
    if (!row) throw new HttpException('Please try again.', 503);
    await this.deliver([row.id]).catch(() => {
      // Delivery is retried by the worker; the sender already has a reference.
    });
    return { reference: row.reference };
  }

  // Sends pending messages: the inbox copy first, then the acknowledgement.
  // Rows stay locked while sending, so the immediate attempt and the worker's
  // retry can never email the same message twice.
  async deliver(ids?: string[]) {
    if (!this.mail || !this.inbox) return;
    const mail = this.mail;
    await this.db.$transaction(
      async (tx) => {
        const locked = ids
          ? await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM contact_messages
              WHERE status = 'pending' AND id = ANY(${ids}::uuid[])
              FOR UPDATE SKIP LOCKED`
          : await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM contact_messages
              WHERE status = 'pending'
              ORDER BY created_at, id
              LIMIT 5
              FOR UPDATE SKIP LOCKED`;
        if (!locked.length) return;
        const rows = await tx.contactMessage.findMany({
          where: { id: { in: locked.map((row) => row.id) } },
        });
        for (const row of rows) {
          const payload = JSON.parse(
            decryptPii(Buffer.from(row.payloadCiphertext), 'contact'),
          ) as ContactPayload;
          try {
            if (!row.inboxSentAt) {
              await mail.send(
                this.inbox,
                contactInboxEmail(row.reference, payload),
                `contact-inbox:${row.id}`,
              );
              await tx.contactMessage.update({
                where: { id: row.id },
                data: { inboxSentAt: new Date() },
              });
            }
            if (!row.ackSentAt) {
              await mail.send(
                payload.email,
                contactAckEmail(row.reference, payload),
                `contact-ack:${row.id}`,
              );
              await tx.contactMessage.update({
                where: { id: row.id },
                data: { ackSentAt: new Date() },
              });
            }
            await tx.contactMessage.update({
              where: { id: row.id },
              data: { status: 'sent' },
            });
          } catch {
            await tx.contactMessage.update({
              where: { id: row.id },
              data: {
                attempts: { increment: 1 },
                ...(row.attempts + 1 >= MAX_ATTEMPTS
                  ? { status: 'failed' }
                  : {}),
              },
            });
          }
        }
      },
      { timeout: 60000 },
    );
  }
}
