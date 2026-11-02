import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createApi } from '../src/app';
import { AuthService, type AuthIdentity } from '../src/auth/auth-service';
import { SupportService } from '../src/support/support-service';
import { encryptPii, hashPii } from '../src/security/pii';
import {
  hashStaffPassword,
  newTotpSecret,
  totpCode,
} from '../src/auth/staff-crypto';
import { NotificationService } from '../src/closing/notification-service';
import { LedgerService } from '../src/ledger/ledger-service';
import { BuyerService } from '../src/buyers/buyer-service';
import { supportMailSchema, supportEmail } from '../src/support/support-email';
import { requestsSupportHuman } from '@auction-ng/shared';
it('recognises explicit human requests without treating ordinary or negated questions as handoffs', () => {
  for (const text of [
    'need to talk to a human',
    'Can I speak with an agent?',
    'human please',
    'Connect me to customer care',
    'I want a real person',
    'I have not received my payment, need to talk to a human',
  ])
    expect(requestsSupportHuman(text)).toBe(true);
  for (const text of [
    'How do I pay?',
    'The human agent helped yesterday',
    "I don't want to talk to a human",
    'I do not need an agent',
  ])
    expect(requestsSupportHuman(text)).toBe(false);
});
let app: Awaited<ReturnType<typeof createApi>>,
  auth: AuthService,
  service: SupportService,
  url: string;
const inbox = new Map<string, string>();
beforeAll(async () => {
  const databaseUrl =
    process.env.SUPPORT_TEST_DATABASE_URL ?? process.env.AUTH_TEST_DATABASE_URL;
  if (
    !databaseUrl ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname)
  )
    throw Error('Isolated support database required');
  app = await createApi({
    databaseUrl,
    mode: 'local',
    emailProvider: {
      async sendCode(email, code) {
        inbox.set(email, code);
      },
    },
  });
  auth = app.get(AuthService);
  service = app.get(SupportService);
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
});
afterAll(async () => app?.close());
async function account(
  role: 'buyer' | 'support' | 'admin' | 'finance' = 'buyer',
) {
  const email = randomUUID() + '@example.test',
    deviceId = randomUUID(),
    password = 'Synthetic support password 42';
  let tokens;
  if (role === 'buyer') {
    const request = await auth.requestCode(
      {
        email,
        deviceId,
        password,
        purpose: 'signup',
        name: 'Synthetic buyer',
        client: 'mobile',
      },
      randomUUID(),
    );
    const code = inbox.get(email);
    if (!code) throw Error('Missing fixture');
    tokens = await auth.verifyCode(
      { challengeId: request.challengeId, code, deviceId, client: 'mobile' },
      randomUUID(),
    );
  } else {
    const secret = newTotpSecret();
    await auth.db.user.create({
      data: {
        name: 'Synthetic staff',
        role,
        emailHash: hashPii(email, 'email'),
        emailCiphertext: encryptPii(email, 'email'),
        emailVerifiedAt: new Date(),
        staffCredential: {
          create: {
            passwordHash: await hashStaffPassword(password),
            totpSecretCiphertext: encryptPii(secret, 'staff-totp'),
          },
        },
      },
    });
    tokens = await auth.staffSignIn(
      {
        email,
        password,
        deviceId,
        client: 'web',
        code: totpCode(secret, Math.floor(Date.now() / 30000)),
      },
      randomUUID(),
    );
  }
  return {
    email,
    deviceId,
    tokens,
    identity: await auth.authenticate(tokens.accessToken, deviceId),
  };
}
const request = () => ({
  subject: 'A payment needs checking',
  topic: 'payments' as const,
  text: 'Please help me find the recorded payment status.',
  idempotencyKey: randomUUID(),
});
async function bidFixture(userId: string) {
  const category = await auth.db.category.create({
    data: { name: 'Test phones', slug: randomUUID() },
  });
  const location = await auth.db.location.create({
    data: {
      name: 'Test collection',
      code: randomUUID().slice(0, 8),
      address: 'Synthetic address',
      hours: {},
      capacityPerSlot: 10,
    },
  });
  const lot = await auth.db.lot.create({
    data: {
      title: 'Synthetic bid request item',
      description: 'Test only',
      categoryId: category.id,
      locationId: location.id,
      condition: 'like_new',
      retailPriceKobo: 2000000,
      startPriceKobo: 50000,
      status: 'open',
      startAt: new Date(Date.now() - 3600000),
      endAt: new Date(Date.now() + 3600000),
    },
  });
  const bid = await auth.db.bid.create({
    data: {
      lotId: lot.id,
      userId,
      amountKobo: 500000,
      maxKobo: 900000,
      isProxy: true,
      idempotencyKey: randomUUID(),
    },
  });
  return { lot, bid };
}
it('routes an owned live bid cancellation request to one human conversation without changing bids or money', async () => {
  const buyer = await account(),
    other = await account(),
    f = await bidFixture(buyer.identity.user.id);
  const input = {
    reason: 'I selected the wrong product by mistake.',
    acknowledged: true as const,
    feeAcknowledged: true as const,
    idempotencyKey: randomUUID(),
  };
  const before = await auth.db.ledgerEntry.count();
  expect(
    (await service.bidCancellation(buyer.identity, f.lot.id)).commitment
      ?.maxKobo,
  ).toBe(900000);
  const rows = await Promise.all(
    Array.from({ length: 5 }, () =>
      service.requestBidCancellation(buyer.identity, f.lot.id, input),
    ),
  );
  expect(new Set(rows.map((row) => row.conversation?.id)).size).toBe(1);
  const row = rows[0]?.conversation;
  if (!row) throw Error('Missing support request');
  expect(row.mode).toBe('human');
  expect(row.reference).toBe(f.lot.lotNumber);
  expect(row.status).toBe('open');
  expect(
    (await service.bidCancellation(other.identity, f.lot.id)).conversation,
  ).toBeNull();
  await expect(
    service.requestBidCancellation(other.identity, f.lot.id, input),
  ).rejects.toMatchObject({ status: 409 });
  expect(await auth.db.bid.findUnique({ where: { id: f.bid.id } })).toEqual(
    f.bid,
  );
  expect(await auth.db.ledgerEntry.count()).toBe(before);
  expect(
    (
      await service.requestBidCancellation(buyer.identity, f.lot.id, {
        ...input,
        idempotencyKey: randomUUID(),
      })
    ).conversation?.id,
  ).toBe(row.id);
  await service.action((await account('admin')).identity, row.id, {
    action: 'resolve',
    expectedVersion: row.version,
    idempotencyKey: randomUUID(),
  });
  expect(
    (await service.bidCancellation(buyer.identity, f.lot.id)).conversation
      ?.status,
  ).toBe('resolved');
});
it('protects bid request routes, rejects closed lots and requires an explicit acknowledgement', async () => {
  const buyer = await account(),
    f = await bidFixture(buyer.identity.user.id);
  const headers = {
    Authorization: 'Bearer ' + buyer.tokens.accessToken,
    'X-Device-Id': buyer.deviceId,
    'Content-Type': 'application/json',
  };
  const path = `${url}/support/lots/${f.lot.id}/bid-cancellation`;
  expect((await fetch(path)).status).toBe(401);
  expect((await fetch(path, { headers })).status).toBe(200);
  const staff = await account('support');
  expect(
    (
      await fetch(path, {
        headers: {
          Authorization: 'Bearer ' + staff.tokens.accessToken,
          'X-Device-Id': staff.deviceId,
        },
      })
    ).status,
  ).toBe(403);
  const input = {
    reason: 'Please review my mistaken bid.',
    acknowledged: true,
    feeAcknowledged: true,
    idempotencyKey: randomUUID(),
  };
  expect(
    (
      await fetch(path, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...input, acknowledged: false }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(path, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...input, buyerId: randomUUID() }),
      })
    ).status,
  ).toBe(400);
  await auth.db.lot.update({
    where: { id: f.lot.id },
    data: { endAt: new Date(Date.now() - 1000) },
  });
  expect(
    (
      await fetch(path, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      })
    ).status,
  ).toBe(409);
  const live = await bidFixture(buyer.identity.user.id);
  const response = await fetch(
    `${url}/support/lots/${live.lot.id}/bid-cancellation`,
    { method: 'POST', headers, body: JSON.stringify(input) },
  );
  expect(response.status).toBe(200);
  expect((await response.json()).conversation.mode).toBe('human');
});
async function create(identity: AuthIdentity) {
  return service.create(identity, request());
}
const action = (
  row: { version: number },
  kind: 'handoff' | 'claim' | 'release' | 'resolve' | 'reopen',
) => ({
  action: kind,
  expectedVersion: row.version,
  idempotencyKey: randomUUID(),
});
it('creates one durable encrypted conversation across concurrent exact retries and rejects changed-key content', async () => {
  const f = await account(),
    input = request();
  const rows = await Promise.all(
    Array.from({ length: 5 }, () => service.create(f.identity, input)),
  );
  expect(new Set(rows.map((row) => row.id)).size).toBe(1);
  const row = rows[0];
  if (!row) throw Error('No conversation');
  expect(row.number).toMatch(/^SUP-[A-Z2-9]{8}$/);
  const stored = await auth.db.supportConversation.findUniqueOrThrow({
    where: { id: row.id },
  });
  expect(Buffer.from(stored.subjectCiphertext).toString()).not.toContain(
    input.subject,
  );
  expect(
    await auth.db.supportMessage.count({ where: { conversationId: row.id } }),
  ).toBe(2);
  await expect(
    service.create(f.identity, { ...input, subject: 'Different content' }),
  ).rejects.toMatchObject({ status: 409 });
});
it('keeps buyer conversations, internal notes and internal attachments private', async () => {
  const buyer = await account(),
    other = await account(),
    agent = await account('support'),
    row = await create(buyer.identity);
  await expect(service.get(other.identity, row.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    service.messages(other.identity, row.id, 10),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    service.send(buyer.identity, row.id, {
      text: 'Private?',
      internal: true,
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 403 });
  const bytes = await sharp({
    create: { width: 20, height: 20, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  await service.send(agent.identity, row.id, {
    text: 'Private staff investigation note',
    internal: true,
    images: [{ mime: 'image/png', data: bytes.toString('base64') }],
    idempotencyKey: randomUUID(),
  });
  const messages = await service.messages(agent.identity, row.id, 50),
    privateNote = messages.items.find((message) => message.internal),
    id = privateNote?.attachments[0]?.id;
  if (!id) throw Error('Missing private file');
  expect(
    JSON.stringify(await service.messages(buyer.identity, row.id, 50)),
  ).not.toContain('Private staff investigation');
  await expect(service.attachment(buyer.identity, id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(service.attachment(other.identity, id)).rejects.toMatchObject({
    status: 404,
  });
  expect((await service.attachment(agent.identity, id)).length).toBeGreaterThan(
    0,
  );
});
it('offers guided approved answers, preserves messages at handoff and stops assistant replies after takeover', async () => {
  const buyer = await account(),
    agent = await account('support');
  let row = await create(buyer.identity);
  const input = {
    text: '',
    faqId: 'wallet' as const,
    idempotencyKey: randomUUID(),
  };
  await service.send(buyer.identity, row.id, input);
  await service.send(buyer.identity, row.id, input);
  let messages = await service.messages(buyer.identity, row.id, 50);
  expect(
    messages.items.filter((message) => message.author === 'assistant'),
  ).toHaveLength(2);
  row = await service.get(buyer.identity, row.id);
  row = await service.action(buyer.identity, row.id, action(row, 'handoff'));
  row = await service.action(agent.identity, row.id, action(row, 'claim'));
  await service.send(buyer.identity, row.id, {
    text: 'Here is more context',
    faqId: 'payments',
    idempotencyKey: randomUUID(),
  });
  messages = await service.messages(buyer.identity, row.id, 50);
  expect(
    messages.items.filter((message) => message.author === 'assistant'),
  ).toHaveLength(2);
  expect(row.status).toBe('in_progress');
});
it('hands off typed requests on creation and messages atomically, with exact retries', async () => {
  const buyer = await account();
  const created = await service.create(buyer.identity, {
    subject: 'Need help',
    topic: 'other',
    text: 'Need to talk to a human',
    idempotencyKey: randomUUID(),
  });
  expect(created.mode).toBe('human');
  const row = await create(buyer.identity);
  const input = {
    text: 'Can I speak to a human please?',
    idempotencyKey: randomUUID(),
  };
  expect((await service.send(buyer.identity, row.id, input)).mode).toBe(
    'human',
  );
  await service.send(buyer.identity, row.id, input);
  const messages = await service.messages(buyer.identity, row.id, 50);
  expect(
    messages.items.filter((message) => message.text === input.text),
  ).toHaveLength(1);
  expect(
    messages.items.filter((message) =>
      message.text.startsWith('Human support requested.'),
    ),
  ).toHaveLength(1);
});
it('allows exactly one agent to take over and requires assignment for public staff replies', async () => {
  const buyer = await account(),
    agent = await account('support'),
    second = await account('support'),
    row = await create(buyer.identity);
  await expect(
    service.send(agent.identity, row.id, {
      text: 'Reply before claim',
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  const results = await Promise.allSettled([
    service.action(agent.identity, row.id, action(row, 'claim')),
    service.action(second.identity, row.id, action(row, 'claim')),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(
    (
      await auth.db.supportConversation.findUniqueOrThrow({
        where: { id: row.id },
      })
    ).assigneeId,
  ).not.toBeNull();
});
it('resolves, rejects replies while resolved and reopens with the original history', async () => {
  const buyer = await account();
  let row = await create(buyer.identity);
  const input = action(row, 'resolve');
  row = await service.action(buyer.identity, row.id, input);
  await service.action(buyer.identity, row.id, input);
  await expect(
    service.send(buyer.identity, row.id, {
      text: 'Not reopened yet',
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await service.list(buyer.identity, { status: 'resolved' })).items,
  ).toHaveLength(1);
  row = await service.action(buyer.identity, row.id, action(row, 'reopen'));
  expect(row.status).toBe('open');
  expect(row.mode).toBe('human');
  expect(
    (await service.messages(buyer.identity, row.id, 50)).items,
  ).toHaveLength(4);
});
it('delivers public replies through the existing notification outbox without emailing chat contents', async () => {
  const buyer = await account(),
    agent = await account('support');
  let row = await create(buyer.identity);
  row = await service.action(agent.identity, row.id, action(row, 'claim'));
  const input = {
    text: 'Sensitive public reply remains in the authenticated conversation',
    idempotencyKey: randomUUID(),
  };
  await service.send(agent.identity, row.id, input);
  await service.send(agent.identity, row.id, input);
  expect(
    await auth.db.notification.count({
      where: { userId: buyer.identity.user.id, template: 'support-v1' },
    }),
  ).toBe(1);
  const notifications = await app
    .get(BuyerService)
    .notifications(buyer.identity.user.id, 10);
  expect(notifications.items[0]?.href).toBe(
    '/customer-service?conversation=' + row.id,
  );
  const delivered: string[] = [];
  const ledger = app.get(LedgerService);
  await new NotificationService(ledger, {
    async send(_to, message) {
      delivered.push(message.HTML);
    },
  }).deliver();
  expect(delivered.some((html) => html.includes('Open conversation'))).toBe(
    true,
  );
  expect(delivered.join()).not.toContain(input.text);
});
it('supports staff-created conversations, validates buyer ownership and audits actions', async () => {
  const buyer = await account(),
    agent = await account('support');
  const row = await service.create(agent.identity, {
    ...request(),
    buyerEmail: buyer.email,
  });
  expect((await service.get(buyer.identity, row.id)).mode).toBe('human');
  expect(
    await auth.db.auditLog.count({
      where: { actorId: agent.identity.user.id, action: 'support.created' },
    }),
  ).toBe(1);
  await expect(
    service.create(buyer.identity, { ...request(), buyerEmail: agent.email }),
  ).rejects.toThrow();
});
it('paginates conversations and messages with owner-bound signed cursors', async () => {
  const buyer = await account(),
    other = await account();
  await create(buyer.identity);
  await create(buyer.identity);
  const first = await service.list(buyer.identity, { limit: 1 });
  expect(first.nextCursor).toBeTruthy();
  const second = await service.list(buyer.identity, {
    limit: 1,
    cursor: first.nextCursor ?? '',
  });
  expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  await expect(
    service.list(other.identity, { limit: 1, cursor: first.nextCursor ?? '' }),
  ).rejects.toMatchObject({ status: 400 });
  const row = first.items[0];
  if (!row) throw Error('No row');
  const messages = await service.messages(buyer.identity, row.id, 1);
  expect(messages.items).toHaveLength(1);
  expect(messages.nextCursor).toBeTruthy();
});
it('checks image contents, strips metadata and serves public attachments only to authorised readers', async () => {
  const buyer = await account(),
    other = await account(),
    row = await create(buyer.identity);
  await expect(
    service.send(buyer.identity, row.id, {
      text: 'Bad file',
      images: [
        {
          mime: 'image/png',
          data: Buffer.from('<svg></svg>').toString('base64'),
        },
      ],
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 400 });
  const image = await sharp({
    create: { width: 20, height: 20, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  await service.send(buyer.identity, row.id, {
    text: 'Receipt screenshot',
    images: [{ mime: 'image/png', data: image.toString('base64') }],
    idempotencyKey: randomUUID(),
  });
  const file = (
    await service.messages(buyer.identity, row.id, 50)
  ).items.flatMap((message) => message.attachments)[0];
  if (!file) throw Error('No image');
  expect(
    (await sharp(await service.attachment(buyer.identity, file.id)).metadata())
      .format,
  ).toBe('webp');
  await expect(
    service.attachment(other.identity, file.id),
  ).rejects.toMatchObject({ status: 404 });
});
it('expires availability and rejects buyers, unauthenticated requests and unrelated staff roles', async () => {
  const buyer = await account(),
    agent = await account('support'),
    finance = await account('finance');
  await service.presence(agent.identity, true);
  expect((await service.availability()).available).toBe(true);
  await auth.db.supportPresence.update({
    where: { userId: agent.identity.user.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  expect((await service.availability()).available).toBe(false);
  await expect(service.presence(buyer.identity, true)).rejects.toMatchObject({
    status: 403,
  });
  expect((await fetch(url + '/support/conversations')).status).toBe(401);
  const headers = {
    Authorization: 'Bearer ' + finance.tokens.accessToken,
    'X-Device-Id': finance.deviceId,
  };
  expect(
    (await fetch(url + '/support/conversations', { headers })).status,
  ).toBe(403);
  const ownHeaders = {
    Authorization: 'Bearer ' + buyer.tokens.accessToken,
    'X-Device-Id': buyer.deviceId,
    'Content-Type': 'application/json',
  };
  expect(
    (
      await fetch(url + '/support/conversations?status=all&unknown=1', {
        headers: ownHeaders,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(url + '/support/presence', {
        method: 'POST',
        headers: ownHeaders,
        body: '{"accepting":true}',
      })
    ).status,
  ).toBe(403);
});
it('keeps mail HTML escaped and validates support mail payloads', () => {
  expect(
    supportMailSchema.safeParse({
      heading: 'Update',
      number: 'bad',
      conversationId: randomUUID(),
    }).success,
  ).toBe(false);
  expect(
    supportEmail({
      heading: '<script>alert(1)</script>',
      number: 'SUP-ABCDEFGH',
      conversationId: randomUUID(),
    }).HTML,
  ).not.toContain('<script>');
});
it('protects the independent support delivery endpoint with a dedicated token and strict empty input', async () => {
  const old = process.env.SUPPORT_DELIVERY_TOKEN;
  const token = randomUUID() + randomUUID();
  process.env.SUPPORT_DELIVERY_TOKEN = token;
  const deliver = vi
    .spyOn(app.get(NotificationService), 'deliver')
    .mockResolvedValue(undefined);
  try {
    const post = (authorization: string, body = '{}') =>
      fetch(url + '/internal/support/deliver', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + authorization,
          'Content-Type': 'application/json',
        },
        body,
      });
    expect((await post('invalid')).status).toBe(401);
    expect((await post(token, '{"unknown":true}')).status).toBe(400);
    expect((await post(token)).status).toBe(200);
    expect(deliver).toHaveBeenCalledExactlyOnceWith(true);
  } finally {
    deliver.mockRestore();
    if (old === undefined) delete process.env.SUPPORT_DELIVERY_TOKEN;
    else process.env.SUPPORT_DELIVERY_TOKEN = old;
  }
});
it('keeps exact message retries successful after the conversation is resolved', async () => {
  const f = await account();
  let row = await create(f.identity);
  const input = {
    text: 'One message, even after resolution',
    idempotencyKey: randomUUID(),
  };
  await service.send(f.identity, row.id, input);
  row = await service.get(f.identity, row.id);
  await service.action(f.identity, row.id, action(row, 'resolve'));
  expect((await service.send(f.identity, row.id, input)).status).toBe(
    'resolved',
  );
  expect(
    (await service.messages(f.identity, row.id, 50)).items.filter(
      (message) => message.text === input.text,
    ),
  ).toHaveLength(1);
});
it('uses encrypted private R2 objects when storage is configured and never writes chat images to the public bucket', async () => {
  const f = await account(),
    objects = new Map<string, Buffer>();
  const storage = {
    async presign() {
      throw Error('Unexpected public upload');
    },
    async write() {
      throw Error('Unexpected public write');
    },
    async writePrivate(key: string, bytes: Buffer) {
      objects.set(key, bytes);
    },
    async read(key: string) {
      const value = objects.get(key);
      if (!value) throw Error('Missing file');
      return value;
    },
  };
  const support = new SupportService(auth, storage),
    row = await create(f.identity);
  const bytes = await sharp({
    create: { width: 20, height: 20, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  await support.send(f.identity, row.id, {
    text: 'Private screenshot',
    images: [{ mime: 'image/png', data: bytes.toString('base64') }],
    idempotencyKey: randomUUID(),
  });
  let attachment = await auth.db.supportAttachment.findFirstOrThrow({
    where: { message: { conversationId: row.id } },
  });
  expect(attachment.objectKey).toBeNull();
  expect(objects.size).toBe(0);
  await support.flushAttachments(attachment.id);
  attachment = await auth.db.supportAttachment.findUniqueOrThrow({
    where: { id: attachment.id },
  });
  expect(attachment.objectKey).toMatch(/^support\//);
  expect(attachment.contentCiphertext).toBeNull();
  expect(
    (
      await sharp(
        await support.attachment(f.identity, attachment.id),
      ).metadata()
    ).format,
  ).toBe('webp');
  expect(objects.size).toBe(1);
});
it('allows bounded support image payloads while preserving the smaller JSON limit on other endpoints', async () => {
  const f = await account(),
    row = await create(f.identity);
  const headers = {
    Authorization: 'Bearer ' + f.tokens.accessToken,
    'X-Device-Id': f.deviceId,
    'Content-Type': 'application/json',
  };
  const support = await fetch(
    url + '/support/conversations/' + row.id + '/messages',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text: 'Invalid image still passes the bounded support body parser',
        images: [
          { mime: 'image/png', data: Buffer.alloc(100000).toString('base64') },
        ],
        idempotencyKey: randomUUID(),
      }),
    },
  );
  expect(support.status).toBe(400);
  const other = await fetch(url + '/auth/request-code', {
    method: 'POST',
    headers,
    body: JSON.stringify({ unknown: 'x'.repeat(150000) }),
  });
  expect(other.status).toBe(413);
  const invalid = await fetch(url + '/support/conversations', {
    method: 'POST',
    headers,
    body: '{invalid',
  });
  expect(invalid.status).toBe(400);
});
