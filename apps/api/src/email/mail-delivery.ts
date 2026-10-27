import nodemailer from 'nodemailer';
import { z } from 'zod';

export type EmailMessage = { Subject: string; Text: string; HTML: string };
export interface MailDelivery {
  send(
    to: string,
    message: EmailMessage,
    idempotencyKey?: string,
  ): Promise<void>;
}
export function isReservedRecipient(email: string) {
  return /\.(test|invalid)$/i.test(email);
}

export class MailpitDelivery implements MailDelivery {
  private readonly origin: URL;
  constructor(
    url: string,
    private readonly sender = 'login@auction-ng.test',
  ) {
    this.origin = new URL(url);
    if (
      this.origin.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', 'mailpit'].includes(this.origin.hostname) ||
      this.origin.username ||
      this.origin.password
    )
      throw new Error('The development inbox must be a local Mailpit service.');
  }
  async send(to: string, message: EmailMessage) {
    const response = await fetch(new URL('/api/v1/send', this.origin), {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        From: { Email: this.sender, Name: 'Auction NG' },
        To: [{ Email: z.email().parse(to) }],
        ...message,
      }),
    });
    if (!response.ok) throw new Error('Development email delivery failed.');
  }
}

const smtpSchema = z.object({
  SMTP_HOST: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9.-]+$/)
    .min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_SECURITY: z.enum(['TLS', 'STARTTLS', 'SSL', 'SMTPS']),
  SMTP_AUTH: z.enum(['true', 'false']),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SMTP_FROM_EMAIL: z.email(),
  SMTP_FROM_NAME: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^\r\n\0]+$/),
});

export class SmtpDelivery implements MailDelivery {
  private readonly transport: ReturnType<typeof nodemailer.createTransport>;
  private readonly from: { address: string; name: string };
  constructor(env: NodeJS.ProcessEnv) {
    const parsed = smtpSchema.safeParse(env);
    if (!parsed.success)
      throw new Error('SMTP settings are incomplete or invalid.');
    const config = parsed.data;
    if (isReservedRecipient(config.SMTP_FROM_EMAIL))
      throw new Error('SMTP requires a real sender domain.');
    const secure = ['SSL', 'SMTPS'].includes(config.SMTP_SECURITY);
    const pass =
      config.SMTP_PASSWORD ||
      (config.SMTP_HOST === 'smtp.resend.com'
        ? config.RESEND_API_KEY
        : undefined);
    if (config.SMTP_AUTH === 'true' && (!config.SMTP_USERNAME || !pass))
      throw new Error('SMTP authentication requires a username and password.');
    if (
      (!secure && [465, 2465].includes(config.SMTP_PORT)) ||
      (secure && [587, 2587, 25].includes(config.SMTP_PORT))
    )
      throw new Error('SMTP port and security mode do not match.');
    this.from = {
      address: config.SMTP_FROM_EMAIL,
      name: config.SMTP_FROM_NAME,
    };
    this.transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure,
      requireTLS: !secure,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      ...(config.SMTP_AUTH === 'true'
        ? { auth: { user: config.SMTP_USERNAME, pass } }
        : {}),
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
  async send(to: string, message: EmailMessage, idempotencyKey?: string) {
    try {
      const recipient = z.email().parse(to);
      if (isReservedRecipient(recipient))
        throw new Error('Reserved recipient.');
      const result = await this.transport.sendMail({
        from: this.from,
        to: recipient,
        subject: message.Subject,
        text: message.Text,
        html: message.HTML,
        ...(idempotencyKey
          ? { headers: { 'Resend-Idempotency-Key': idempotencyKey } }
          : {}),
      });
      if (result.rejected?.length || !result.accepted?.length)
        throw new Error('Recipient not accepted.');
    } catch {
      // SMTP errors may contain credentials, recipients or message content.
      throw new Error('Email delivery failed. Check SMTP configuration.');
    }
  }
}

export function createMailDelivery(
  mode = process.env.AUTH_MODE,
  env: NodeJS.ProcessEnv = process.env,
  localSender = 'login@auction-ng.test',
): MailDelivery | undefined {
  if (mode === 'local')
    return new MailpitDelivery(
      env.MAILPIT_URL ?? 'http://localhost:8025',
      localSender,
    );
  if (mode === 'smtp') return new SmtpDelivery(env);
  return undefined;
}
