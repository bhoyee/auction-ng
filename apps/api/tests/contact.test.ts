import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApi } from '../src/app';
import { ContactService } from '../src/contact/contact-service';
import type { EmailMessage, MailDelivery } from '../src/email/mail-delivery';
import { LedgerService } from '../src/ledger/ledger-service';
import { decryptPii } from '../src/security/pii';
import { createContactClient } from '../../../packages/api-client/src/contact';
import { ApiError } from '../../../packages/api-client/src/auth';

let app: Awaited<ReturnType<typeof createApi>>;
let ledger: LedgerService;
let url: string;

class FakeMail implements MailDelivery {
  sent: { to: string; message: EmailMessage; key?: string }[] = [];
  failNext = 0;
  async send(to: string, message: EmailMessage, key?: string) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('SMTP unavailable');
    }
    this.sent.push({ to, message, key });
  }
}

const message = (overrides: Record<string, unknown> = {}) => ({
  requestKey: randomUUID(),
  name: 'Chiamaka Okafor',
  email: `${randomUUID()}@example.test`,
  topic: 'pickup' as const,
  reference: 'INV-20418',
  message: 'My pickup pass does not open on my phone.',
  ...overrides,
});

beforeAll(async () => {
  const databaseUrl = process.env.LEDGER_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !databaseUrl ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname)
  )
    throw new Error('Isolated contact database required.');
  app = await createApi({ databaseUrl, mode: 'local' });
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  ledger = new LedgerService(databaseUrl);
});
afterAll(async () => {
  await app?.close();
  await ledger?.db.$disconnect();
});

it('emails the inbox with Reply-To set to the sender, then acknowledges without echoing their name', async () => {
  const mail = new FakeMail();
  const service = new ContactService(
    ledger.db,
    mail,
    async () => true,
    'hello@lotvanta.ng',
  );
  const input = message({ name: 'Ada <script>' });
  const { reference } = await service.submit(input, '203.0.113.10');
  expect(reference).toMatch(/^CS-\d{6}$/);
  expect(mail.sent.map((item) => item.to)).toEqual([
    'hello@lotvanta.ng',
    input.email,
  ]);
  const [inbox, ack] = mail.sent;
  expect(inbox?.message.ReplyTo).toBe(input.email);
  expect(inbox?.message.Subject).toContain(reference);
  expect(inbox?.message.HTML).toContain('Ada &lt;script&gt;');
  expect(inbox?.message.HTML).not.toContain('<script>');
  expect(ack?.message.Text).toContain(reference);
  expect(ack?.message.Text).toContain('Hi there,');
  expect(ack?.message.Text).not.toContain('Ada');
  expect(ack?.message.ReplyTo).toBeUndefined();
  const row = await ledger.db.contactMessage.findUniqueOrThrow({
    where: { reference },
  });
  expect(row.status).toBe('sent');
  expect(Buffer.from(row.payloadCiphertext).toString('utf8')).not.toContain(
    input.email,
  );
  expect(
    JSON.parse(decryptPii(Buffer.from(row.payloadCiphertext), 'contact')),
  ).toMatchObject({ email: input.email, topic: 'pickup' });
});

it('returns the original reference for a retried request and rejects a reused key with a different message', async () => {
  const mail = new FakeMail();
  const service = new ContactService(
    ledger.db,
    mail,
    async () => true,
    'hello@lotvanta.ng',
  );
  const input = message();
  const [first, second] = await Promise.all([
    service.submit(input, '203.0.113.11'),
    service.submit(input, '203.0.113.11'),
  ]);
  expect(second.reference).toBe(first.reference);
  expect(
    await ledger.db.contactMessage.count({
      where: { requestKey: input.requestKey },
    }),
  ).toBe(1);
  // Concurrent attempts must still email each address only once.
  expect(mail.sent).toHaveLength(2);
  await expect(
    service.submit({ ...input, message: 'A different message entirely.' }, ''),
  ).rejects.toMatchObject({ status: 409 });
});

it('keeps failed sends pending, retries without resending the inbox copy, and gives up after eight attempts', async () => {
  const mail = new FakeMail();
  const service = new ContactService(
    ledger.db,
    mail,
    async () => true,
    'hello@lotvanta.ng',
  );
  const input = message();
  mail.failNext = 1;
  const { reference } = await service.submit(input, '203.0.113.12');
  let row = await ledger.db.contactMessage.findUniqueOrThrow({
    where: { reference },
  });
  expect(row).toMatchObject({ status: 'pending', attempts: 1 });
  expect(mail.sent).toHaveLength(0);
  await service.deliver([row.id]);
  row = await ledger.db.contactMessage.findUniqueOrThrow({
    where: { reference },
  });
  expect(row.status).toBe('sent');
  expect(mail.sent.map((item) => item.key)).toEqual([
    `contact-inbox:${row.id}`,
    `contact-ack:${row.id}`,
  ]);

  const stuck = message();
  mail.failNext = 100;
  const failed = await service.submit(stuck, '203.0.113.12');
  const id = (
    await ledger.db.contactMessage.findUniqueOrThrow({
      where: { reference: failed.reference },
    })
  ).id;
  for (let attempt = 0; attempt < 10; attempt++) await service.deliver([id]);
  expect(
    await ledger.db.contactMessage.findUniqueOrThrow({ where: { id } }),
  ).toMatchObject({ status: 'failed', attempts: 8 });
});

it('rejects a failed security check before storing anything', async () => {
  const service = new ContactService(
    ledger.db,
    new FakeMail(),
    async () => false,
    'hello@lotvanta.ng',
  );
  const input = message();
  await expect(service.submit(input, '203.0.113.13')).rejects.toMatchObject({
    status: 400,
  });
  expect(
    await ledger.db.contactMessage.count({
      where: { requestKey: input.requestKey },
    }),
  ).toBe(0);
});

it('accepts public messages over HTTP, rejects bots, bad or unknown fields, and rate-limits each address', async () => {
  const client = createContactClient(url);
  const post = (body: unknown) =>
    fetch(`${url}/contact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  for (const body of [
    message({ website: 'https://spam.example' }),
    message({ name: 'Ada\r\nBcc: x@example.test' }),
    message({ message: 'short' }),
    message({ topic: 'jobs' }),
    { ...message(), admin: true },
  ])
    expect((await post(body)).status).toBe(400);

  const email = `${randomUUID()}@example.test`;
  const response = await post(message({ email }));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const result = (await response.json()) as { reference: string };
  expect(result.reference).toMatch(/^CS-\d{6}$/);
  await client.send(message({ email }));
  await client.send(message({ email: email.toUpperCase() }));
  await expect(client.send(message({ email }))).rejects.toEqual(
    new ApiError(429),
  );
});
