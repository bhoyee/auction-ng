import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import nodemailer from '../apps/api/node_modules/nodemailer';
import {
  createMailDelivery,
  SmtpDelivery,
} from '../apps/api/src/email/mail-delivery';
import { signInEmail } from '../apps/api/src/auth/email-provider';

const sendMail = vi.fn();
vi.mock('../apps/api/node_modules/nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));
const config = {
  SMTP_HOST: 'smtp.resend.com',
  SMTP_PORT: '587',
  SMTP_SECURITY: 'TLS',
  SMTP_AUTH: 'true',
  SMTP_USERNAME: 'resend',
  SMTP_PASSWORD: 'synthetic-test-credential',
  SMTP_FROM_EMAIL: 'sender@example.com',
  SMTP_FROM_NAME: 'Temporary sender',
};
beforeEach(() => {
  vi.clearAllMocks();
  sendMail.mockResolvedValue({ accepted: ['buyer@example.com'], rejected: [] });
});
afterEach(() => vi.unstubAllGlobals());

it('requires STARTTLS, certificate verification and bounded timeouts on port 587', async () => {
  const delivery = createMailDelivery('smtp', config);
  await delivery?.send('buyer@example.com', signInEmail('123456'));
  expect(nodemailer.createTransport).toHaveBeenCalledWith(
    expect.objectContaining({
      host: 'smtp.resend.com',
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      auth: { user: 'resend', pass: 'synthetic-test-credential' },
      logger: false,
      debug: false,
      connectionTimeout: 5000,
      socketTimeout: 10000,
      disableFileAccess: true,
      disableUrlAccess: true,
    }),
  );
  expect(sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      from: { address: 'sender@example.com', name: 'Temporary sender' },
      to: 'buyer@example.com',
      subject: 'Your Auction NG sign-in code',
      text: expect.stringContaining('123456'),
      html: expect.stringContaining('123456'),
    }),
  );
});
it('supports Resend API keys as the password fallback only for Resend', () => {
  new SmtpDelivery({
    ...config,
    SMTP_PASSWORD: '',
    RESEND_API_KEY: 'synthetic-fallback',
  });
  expect(nodemailer.createTransport).toHaveBeenLastCalledWith(
    expect.objectContaining({
      auth: { user: 'resend', pass: 'synthetic-fallback' },
    }),
  );
  expect(
    () =>
      new SmtpDelivery({
        ...config,
        SMTP_HOST: 'smtp.example.com',
        SMTP_PASSWORD: '',
        RESEND_API_KEY: 'synthetic-fallback',
      }),
  ).toThrow('authentication');
});
it('supports implicit TLS and explicitly unauthenticated TLS relays', () => {
  new SmtpDelivery({
    ...config,
    SMTP_PORT: '465',
    SMTP_SECURITY: 'SSL',
    SMTP_AUTH: 'false',
  });
  const options = vi.mocked(nodemailer.createTransport).mock.calls.at(-1)?.[0];
  expect(options).toMatchObject({ secure: true, requireTLS: false });
  expect(options).not.toHaveProperty('auth');
});
it.each([
  { SMTP_PASSWORD: '' },
  { SMTP_PORT: '0' },
  { SMTP_PORT: '587', SMTP_SECURITY: 'SSL' },
  { SMTP_PORT: '465', SMTP_SECURITY: 'TLS' },
  { SMTP_SECURITY: 'NONE' },
  { SMTP_HOST: 'https://smtp.resend.com' },
  { SMTP_AUTH: 'maybe' },
  { SMTP_FROM_EMAIL: 'not-an-email' },
  { SMTP_FROM_NAME: 'Brand\r\nBcc: victim@example.com' },
])('rejects incomplete or insecure SMTP configuration: %j', (patch) => {
  expect(() => new SmtpDelivery({ ...config, ...patch })).toThrow();
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});
it('adds a stable receipt idempotency header without changing message content', async () => {
  const delivery = new SmtpDelivery(config);
  const message = {
    Subject: 'Your invoice',
    Text: 'Paid',
    HTML: '<p>Paid</p>',
  };
  await delivery.send(
    'buyer@example.com',
    message,
    'auction-ng/notification/test-id',
  );
  expect(sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      headers: { 'Resend-Idempotency-Key': 'auction-ng/notification/test-id' },
      subject: 'Your invoice',
      text: 'Paid',
      html: '<p>Paid</p>',
    }),
  );
});
it('redacts transport failures and rejected recipients without reporting success', async () => {
  const delivery = new SmtpDelivery(config);
  sendMail.mockRejectedValueOnce(
    new Error('synthetic-test-credential 123456 buyer@example.com'),
  );
  await expect(
    delivery.send('buyer@example.com', signInEmail('123456')),
  ).rejects.toThrow(/^Email delivery failed\. Check SMTP configuration\.$/);
  sendMail.mockResolvedValueOnce({
    accepted: [],
    rejected: ['buyer@example.com'],
  });
  await expect(
    delivery.send('buyer@example.com', signInEmail('123456')),
  ).rejects.toThrow('Email delivery failed');
});
it('never sends synthetic demo addresses through external SMTP', async () => {
  const delivery = new SmtpDelivery(config);
  await expect(
    delivery.send('demo-buyer@example.test', signInEmail('123456')),
  ).rejects.toThrow('Email delivery failed');
  expect(sendMail).not.toHaveBeenCalled();
  expect(
    () =>
      new SmtpDelivery({
        ...config,
        SMTP_FROM_EMAIL: 'sender@example.invalid',
      }),
  ).toThrow('real sender');
});
it('fails closed for missing/unknown modes and never falls back to SMTP in local mode', async () => {
  expect(createMailDelivery('disabled', config)).toBeUndefined();
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetch);
  const delivery = createMailDelivery('local', config);
  await delivery?.send('buyer@example.com', signInEmail('123456'));
  expect(fetch.mock.calls[0]?.[0]).toEqual(
    new URL('http://localhost:8025/api/v1/send'),
  );
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
  expect(() =>
    createMailDelivery('local', {
      MAILPIT_URL: 'https://external.example.com',
    }),
  ).toThrow();
});
