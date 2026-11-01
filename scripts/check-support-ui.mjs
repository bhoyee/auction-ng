import { chromium, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { setInterval, clearInterval } from 'node:timers';
/* global localStorage, document, window */
const requireApi = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const sharp = requireApi('sharp');
const image = await sharp({
  create: { width: 100, height: 60, channels: 3, background: 'white' },
})
  .png()
  .toBuffer();
const dir = 'docs/design/customer-support';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [360, 768, 1280]) {
    const buyer = {
      id: randomUUID(),
      name: 'Amina Yusuf',
      email: 'buyer@example.test',
      role: 'buyer',
      status: 'active',
      emailVerified: true,
      phoneVerified: false,
      phone: null,
      address: null,
      passwordSet: true,
    };
    const agent = {
      ...buyer,
      id: randomUUID(),
      role: 'support',
      name: 'Tunde Ade',
      email: 'agent@example.test',
    };
    const tokens = {
      buyer: randomBytes(32).toString('base64url'),
      staff: randomBytes(32).toString('base64url'),
    };
    const contexts = [],
      sockets = new Map();
    let row = null,
      chat = [],
      accepting = false,
      sent = false,
      failNext = false,
      denyRetryOnce = false,
      sendCalls = 0;
    const replies = new Map();
    function emit(internal = false) {
      for (const [socket, role] of sockets) {
        if (role === 'staff' || !internal)
          socket.send(
            '42' +
              JSON.stringify([
                'support:changed',
                { conversationId: row?.id ?? randomUUID() },
              ]),
          );
      }
    }
    function add(author, text, internal = false, files = []) {
      chat.push({
        id: randomUUID(),
        author,
        authorName:
          author === 'buyer'
            ? buyer.name
            : author === 'staff'
              ? agent.name
              : author === 'assistant'
                ? 'Support assistant'
                : 'Auction NG',
        text,
        internal,
        createdAt: new Date().toISOString(),
        attachments: files,
      });
    }
    for (const role of ['buyer', 'staff']) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      contexts.push(context);
      await context.addInitScript(() =>
        localStorage.setItem(
          'auction-ng-cookie-notice',
          JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
        ),
      );
      await context.routeWebSocket(/localhost:4001\/socket.io\//, (socket) => {
        let timer;
        socket.send(
          '0' +
            JSON.stringify({
              sid: randomUUID(),
              upgrades: [],
              pingInterval: 25000,
              pingTimeout: 20000,
              maxPayload: 1000000,
            }),
        );
        socket.onMessage((raw) => {
          const message = String(raw);
          if (message.startsWith('40')) {
            sockets.set(socket, role);
            socket.send('40' + JSON.stringify({ sid: randomUUID() }));
            timer = setInterval(() => socket.send('2'), 15000);
          }
        });
        socket.onClose(() => {
          sockets.delete(socket);
          clearInterval(timer);
        });
      });
      await context.route('http://localhost:4000/**', async (route) => {
        const url = new URL(route.request().url()),
          path = url.pathname;
        const json = (body, status = 200) =>
          route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(body),
          });
        const body =
          route.request().method() === 'GET'
            ? {}
            : route.request().postDataJSON();
        const present = () => ({
          ...row,
          assignedToMe: role === 'staff' && !!row.assigneeName,
        });
        if (path === '/auth/refresh' || path === '/auth/staff/refresh')
          return json({
            accessToken: tokens[role],
            expiresInSeconds: 900,
            user: role === 'buyer' ? buyer : agent,
          });
        if (path === '/wallet')
          return json({
            id: buyer.id,
            userId: buyer.id,
            currency: 'NGN',
            availableKobo: 0,
            heldKobo: 0,
            totalKobo: 0,
          });
        if (path === '/buyers/watchlist/count') return json({ count: 0 });
        if (path === '/buyers/notifications/summary')
          return json({ unread: sent ? 1 : 0, awaitingPickup: 0 });
        if (path === '/support/availability')
          return json({ available: accepting, attachmentsEnabled: true });
        if (path === '/support/presence') {
          accepting = body.accepting;
          emit();
          return json({ available: accepting });
        }
        if (
          path === '/support/conversations' &&
          route.request().method() === 'GET'
        ) {
          const status = url.searchParams.get('status');
          return json({
            items:
              row && (status === 'all' || row.status === status)
                ? [present()]
                : [],
            nextCursor: null,
          });
        }
        if (
          (path === '/support/conversations' ||
            path === '/support/staff/conversations') &&
          route.request().method() === 'POST'
        ) {
          row = {
            id: randomUUID(),
            number: 'SUP-ABCD2345',
            subject: body.subject,
            reference: body.reference ?? '',
            topic: body.topic,
            status: 'open',
            mode: body.human ? 'human' : 'assistant',
            version: 0,
            buyerName: buyer.name,
            assigneeName: null,
            assignedToMe: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          chat = [];
          add('buyer', body.text);
          add(
            'assistant',
            'I am Auction NG’s guided support assistant. Choose an approved help topic or talk to a person.',
          );
          emit();
          return json(present());
        }
        if (path === '/support/conversations/' + row?.id)
          return json(present());
        if (
          path === '/support/conversations/' + row?.id + '/messages' &&
          route.request().method() === 'GET'
        )
          return json({
            items: chat.filter(
              (message) => role === 'staff' || !message.internal,
            ),
            nextCursor: null,
          });
        if (
          path === '/support/conversations/' + row?.id + '/messages' &&
          route.request().method() === 'POST'
        ) {
          sendCalls++;
          if (replies.has(body.idempotencyKey)) {
            if (denyRetryOnce) {
              denyRetryOnce = false;
              return json({}, 429);
            }
            return json(present());
          }
          const files = (body.images ?? []).map(() => ({
            id: randomUUID(),
            mime: 'image/webp',
            bytes: image.length,
          }));
          add(
            role === 'staff' ? 'staff' : 'buyer',
            body.faqId ? 'Understand my wallet' : body.text,
            body.internal,
            files,
          );
          if (
            row.mode === 'assistant' &&
            role === 'buyer' &&
            body.text === 'need to talk to a human'
          ) {
            row.mode = 'human';
            add(
              'system',
              'Human support requested. Your messages are saved for the team.',
            );
          } else if (row.mode === 'assistant' && role === 'buyer')
            add(
              'assistant',
              'Available funds can be used for new bids. Reserved funds cover existing commitments and cannot be spent twice.',
            );
          row.version++;
          replies.set(body.idempotencyKey, true);
          if (role === 'staff' && !body.internal) sent = true;
          emit(body.internal);
          if (failNext) {
            failNext = false;
            denyRetryOnce = true;
            return json({}, 503);
          }
          return json(present());
        }
        if (path === '/support/conversations/' + row?.id + '/actions') {
          if (body.action === 'handoff') {
            row.mode = 'human';
            add(
              'system',
              'Human support requested. Your messages stay with the conversation.',
            );
          }
          if (body.action === 'claim') {
            row.mode = 'human';
            row.assigneeName = agent.name;
            row.status = 'in_progress';
            add('system', 'Tunde Ade has joined the conversation.');
          }
          if (body.action === 'resolve') {
            row.status = 'resolved';
            add('system', 'This conversation has been marked resolved.');
          }
          if (body.action === 'reopen') {
            row.status = 'open';
            row.assigneeName = null;
            add('system', 'This conversation has been reopened.');
          }
          row.version++;
          emit();
          return json(present());
        }
        if (path.startsWith('/support/attachments/'))
          return route.fulfill({ contentType: 'image/png', body: image });
        return json({ items: [], nextCursor: null });
      });
    }
    const [buyerContext, staffContext] = contexts;
    const page = await buyerContext.newPage(),
      staff = await staffContext.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    staff.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/customer-service');
    const history = page.getByRole('region', {
      name: 'Support conversations',
      exact: true,
    });
    await expect(
      history.getByText('No conversations here yet', { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `${dir}/empty-${width}.png`,
      fullPage: true,
    });
    await history
      .getByRole('button', { name: 'Start a conversation', exact: true })
      .click();
    const popup = page.getByRole('dialog', {
      name: 'Auction NG support chat',
      exact: true,
    });
    await expect(popup).toBeVisible();
    const workspace = popup.getByRole('region', {
      name: 'Support conversations',
      exact: true,
    });
    const dialog = popup;
    await dialog
      .getByLabel('How can we help?', { exact: true })
      .fill('Payment needs checking');
    await dialog
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(workspace.getByText(/I am Auction NG’s guided/)).toBeVisible();
    await expect(
      workspace.getByRole('button', { name: 'Mark resolved', exact: true }),
    ).toHaveCount(0);
    for (const name of ['Minimise chat', 'Close chat']) {
      const control = popup.getByRole('button', { name, exact: true });
      await control.hover();
      await expect(control).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(control).toHaveCSS('color', 'rgb(21, 26, 48)');
      await expect(control.locator('svg')).toHaveCSS(
        'color',
        'rgb(21, 26, 48)',
      );
    }
    await popup.screenshot({ path: `${dir}/controls-hover-${width}.png` });
    await workspace
      .getByLabel('Your message', { exact: true })
      .fill('Keep this draft');
    await popup
      .getByRole('button', { name: 'Minimise chat', exact: true })
      .click();
    await expect(popup).toBeHidden();
    await page
      .getByRole('button', { name: 'Open support chat', exact: true })
      .click();
    await expect(
      workspace.getByLabel('Your message', { exact: true }),
    ).toHaveValue('Keep this draft');
    await workspace.getByLabel('Your message', { exact: true }).fill('');
    await workspace
      .getByRole('button', { name: 'Understand my wallet', exact: true })
      .click();
    await expect(
      workspace.getByText(/Available funds can be used/),
    ).toBeVisible();
    await workspace.getByLabel('Attach image', { exact: true }).setInputFiles({
      name: 'synthetic-receipt.png',
      mimeType: 'image/png',
      buffer: image,
    });
    await expect(
      workspace.getByRole('img', { name: 'Attachment 1', exact: true }),
    ).toBeVisible();
    await workspace
      .getByLabel('Your message', { exact: true })
      .fill('Here is my receipt screenshot.');
    failNext = true;
    await workspace
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(
      workspace.getByRole('button', {
        name: 'Retry the same request',
        exact: true,
      }),
    ).toBeVisible();
    await workspace
      .getByRole('button', { name: 'Retry the same request', exact: true })
      .click();
    await expect(
      workspace.getByRole('button', {
        name: 'Retry the same request',
        exact: true,
      }),
    ).toBeVisible();
    await workspace
      .getByRole('button', { name: 'Retry the same request', exact: true })
      .click();
    await expect(
      workspace.getByLabel('Your message', { exact: true }),
    ).toHaveValue('');
    assert.equal(
      chat.filter(
        (message) => message.text === 'Here is my receipt screenshot.',
      ).length,
      1,
    );
    await expect(
      workspace.getByRole('img', {
        name: 'Conversation attachment. Open full image.',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      workspace.getByText('Your conversation has been saved.', { exact: true }),
    ).toHaveCount(0, { timeout: 6000 });
    await page.screenshot({
      path: `${dir}/assistant-${width}.png`,
      fullPage: true,
    });
    await workspace
      .getByLabel('Your message', { exact: true })
      .fill('need to talk to a human');
    await workspace
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(
      workspace.getByText(
        'Human support requested. Your messages are saved for the team.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      workspace.getByRole('button', {
        name: 'Understand my wallet',
        exact: true,
      }),
    ).toHaveCount(0);
    await staff.goto('http://localhost:3301');
    const desk = staff.getByRole('region', {
      name: 'Staff support desk',
      exact: true,
    });
    await desk.getByLabel('Accept live conversations', { exact: true }).check();
    await desk.getByRole('button', { name: /Payment needs checking/ }).click();
    await desk
      .getByRole('button', { name: 'Take over conversation', exact: true })
      .click();
    await expect(
      workspace.getByText('Tunde Ade has joined the conversation.', {
        exact: true,
      }),
    ).toBeVisible({ timeout: 10000 });
    await desk
      .getByLabel('Private staff note · hidden from the buyer', { exact: true })
      .check();
    await desk
      .getByLabel('Private note', { exact: true })
      .fill('Internal: checking the payment reference.');
    await desk
      .getByLabel('Private staff note · hidden from the buyer', { exact: true })
      .uncheck();
    await expect(desk.getByLabel('Your message', { exact: true })).toHaveValue(
      '',
    );
    await desk
      .getByLabel('Private staff note · hidden from the buyer', { exact: true })
      .check();
    await expect(desk.getByLabel('Private note', { exact: true })).toHaveValue(
      'Internal: checking the payment reference.',
    );
    await desk
      .getByRole('button', { name: 'Save private note', exact: true })
      .click();
    await expect(
      desk.getByText('Internal: checking the payment reference.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      workspace.getByText('Internal: checking the payment reference.', {
        exact: true,
      }),
    ).toHaveCount(0);
    await desk
      .getByLabel('Private staff note · hidden from the buyer', { exact: true })
      .uncheck();
    await desk
      .getByLabel('Your message', { exact: true })
      .fill('Hello Amina, I am checking this for you.');
    await desk
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(
      workspace.getByText('Hello Amina, I am checking this for you.', {
        exact: true,
      }),
    ).toBeVisible({ timeout: 10000 });
    await page.screenshot({
      path: `${dir}/human-${width}.png`,
      fullPage: true,
    });
    await staff.screenshot({
      path: `${dir}/staff-${width}.png`,
      fullPage: true,
    });
    await desk
      .getByRole('button', { name: 'Mark resolved', exact: true })
      .click();
    await expect(
      workspace.getByRole('button', {
        name: 'Reopen conversation',
        exact: true,
      }),
    ).toBeVisible({ timeout: 10000 });
    await page.screenshot({
      path: `${dir}/resolved-${width}.png`,
      fullPage: true,
    });
    await workspace
      .getByRole('button', { name: 'Reopen conversation', exact: true })
      .click();
    await expect(
      workspace.getByText('This conversation has been reopened.', {
        exact: true,
      }),
    ).toBeVisible();
    await workspace
      .getByRole('button', { name: 'Back to conversations', exact: true })
      .click();
    for (const name of ['Resolved', 'In Progress', 'Open', 'All'])
      await workspace.getByRole('button', { name, exact: true }).click();
    await popup
      .getByRole('button', { name: 'Close chat', exact: true })
      .click();
    await page.goto(
      'http://localhost:3300/customer-service?conversation=' + row.id,
    );
    await expect(popup).toBeVisible();
    await expect(
      workspace.getByRole('button', {
        name: 'Back to conversations',
        exact: true,
      }),
    ).toBeVisible();
    await popup.press('Escape');
    await expect(popup).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Open support chat', exact: true }),
    ).toBeFocused();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    assert.equal(
      await staff.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    assert.ok(sendCalls >= 4);
    results.push({
      width,
      createAndFaq: true,
      compressedAttachment: true,
      uncertainRetryExactlyOnce: true,
      humanHandoffLive: true,
      privateNotesHidden: true,
      resolveReopen: true,
      filters: true,
      floatingPopup: true,
      buyerResolveHidden: true,
      hoverIconsVisible: true,
      minimisePreservesDraft: true,
      autoDismissFeedback: true,
      typedHandoff: true,
      deepLinkAndEscape: true,
      noOverflow: true,
    });
    for (const context of contexts) await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
