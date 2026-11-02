import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setInterval, clearInterval } from 'node:timers';
import assert from 'node:assert/strict';
/* global localStorage, document, innerWidth, window, Event */
const dir = 'docs/design/bid-cancellation-requests';
mkdirSync(dir, { recursive: true });
const catalogue = await (
  await fetch('http://localhost:4000/lots?limit=50')
).json();
const lot = catalogue.items.find(
  (item) => item.status === 'open' && item.startPriceKobo <= 1250000,
);
assert.ok(lot, 'An open demo lot is required.');
const browser = await chromium.launch(),
  results = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    context.setDefaultTimeout(15000);
    const user = {
      id: randomUUID(),
      name: 'Amina Yusuf',
      email: 'buyer@example.test',
      role: 'buyer',
      status: 'active',
      emailVerified: true,
      phone: null,
      phoneVerified: false,
      address: null,
      passwordSet: true,
    };
    const token = randomBytes(32).toString('base64url'),
      endsAt = new Date(Date.now() + 3600000).toISOString();
    let conversation = null,
      fail = true,
      prior,
      writes = 0;
    const posts = [];
    const state = () => ({
      commitment: {
        maxKobo: 1500000,
        automatic: true,
        createdAt: new Date().toISOString(),
      },
      canRequest: true,
      conversation,
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      if (path === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (
        route.request().method() !== 'GET' &&
        /^\/(?:lots\/[^/]+\/(?:bids|bid-preparations)|bid-preparations|wallet|payments|withdrawals)(?:\/|$)/.test(
          path,
        )
      )
        writes++;
      if (path === `/support/lots/${lot.id}/bid-cancellation`) {
        if (route.request().method() === 'POST') {
          const input = route.request().postDataJSON();
          posts.push(input);
          assert.equal(input.acknowledged, true);
          if (prior) assert.deepEqual(input, prior);
          prior = input;
          conversation ??= {
            id: randomUUID(),
            number: 'SUP-A7X9K3M2',
            subject: 'Bid cancellation request',
            topic: 'bidding',
            reference: lot.lotNumber,
            status: 'open',
            mode: 'human',
            version: 0,
            buyerName: user.name,
            assigneeName: null,
            assignedToMe: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          if (fail) {
            fail = false;
            return json({}, 503);
          }
        }
        return json(state());
      }
      if (path === '/buyers/bids')
        return json({
          items: [
            {
              id: randomUUID(),
              lot: {
                id: lot.id,
                lotNumber: lot.lotNumber,
                title: lot.title,
                status: 'open',
                thumbnailUrl: lot.thumbnail?.thumbnailUrl,
              },
              amountKobo: 1500000,
              automatic: true,
              outcome: 'pending',
              createdAt: new Date().toISOString(),
            },
          ],
          nextCursor: null,
        });
      if (path.endsWith('/auction-fees'))
        return json({
          policy: {
            version: 'auction-fees-v1',
            serviceChargeEnabled: true,
            premiumBps: 1500,
            lotFeeEnabled: true,
            lotFeeKobo: 30000,
            vatEnabled: true,
            vatBps: 750,
          },
          locked: true,
        });
      if (path === '/wallet')
        return json({
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: 100000000,
          heldKobo: 0,
          totalKobo: 100000000,
        });
      if (path === '/buyers/watchlist/count') return json({ count: 0 });
      if (path === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 0 });
      if (path.endsWith('/result'))
        return json({
          lotId: lot.id,
          state: 'open',
          finalPriceKobo: null,
          serverTime: new Date().toISOString(),
        });
      if (path === '/time')
        return json({ serverTime: new Date().toISOString() });
      if (path.endsWith('/bid-history'))
        return json({ items: [], nextCursor: null });
      return json({ items: [], nextCursor: null, lotIds: [] });
    });
    await context.routeWebSocket(/localhost:4001\/socket.io\//, (socket) => {
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
      const timer = setInterval(
        () =>
          socket.send(
            '42' +
              JSON.stringify([
                'serverTime',
                { serverTime: new Date().toISOString() },
              ]),
          ),
        3000,
      );
      socket.onClose(() => clearInterval(timer));
      socket.onMessage((raw) => {
        const text = String(raw);
        if (text.startsWith('40'))
          return socket.send(
            '40' +
              (text.startsWith('40/public,') ? '/public,' : '') +
              JSON.stringify({ sid: randomUUID() }),
          );
        const match = text.match(/^42(\/public,)?(\d+)(\[.*\])$/);
        if (!match) return;
        const [event, input] = JSON.parse(match[3]);
        const value =
          event === 'clock:sync'
            ? { serverTime: new Date().toISOString() }
            : {
                ok: true,
                lot: {
                  lotId: input.lotId,
                  currentPriceKobo: 1250000,
                  endsAt,
                  streamId: '1-0',
                  serverTime: new Date().toISOString(),
                  isLeader: true,
                },
              };
        socket.send(
          '43' + (match[1] ?? '') + match[2] + JSON.stringify([value]),
        );
      });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    async function capture(name) {
      await page.evaluate(() => document.fonts.ready);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        'No horizontal overflow',
      );
      await page.screenshot({
        path: `${dir}/${name}-${width}.png`,
        fullPage: true,
      });
    }
    await page.goto(`http://localhost:3300/lots/${lot.id}`);
    const panel = page.getByRole('region', {
      name: 'Bid commitment and review',
      exact: true,
    });
    await expect(
      panel.getByText('Your latest private limit:', { exact: false }),
    ).toContainText('15,000');
    await expect(
      panel.getByText('Accepted bids cannot be cancelled.', { exact: false }),
    ).toBeVisible();
    const bidding = page.getByRole('region', {
      name: 'Auction bidding',
      exact: true,
    });
    await bidding.getByLabel('Your bid amount', { exact: true }).fill('20000');
    await expect(
      bidding.getByRole('button', { name: 'Bid now', exact: true }),
    ).toBeEnabled();
    await capture('commitment');
    await panel
      .getByRole('button', { name: 'Request bid cancellation', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Request bid cancellation',
      exact: true,
    });
    const send = dialog.getByRole('button', {
      name: 'Send request to support',
      exact: true,
    });
    await expect(send).toBeDisabled();
    await dialog
      .getByLabel('Reason for your request')
      .fill('I selected the wrong product by mistake.');
    await expect(send).toBeDisabled();
    await dialog.getByRole('checkbox').check();
    await capture('confirmation');
    await send.click();
    await expect(
      dialog.getByText('The result could not be confirmed.', { exact: false }),
    ).toBeVisible();
    await expect(dialog.getByLabel('Reason for your request')).toBeDisabled();
    await dialog.getByRole('button', { name: 'Retry same request' }).click();
    assert.equal(posts.length, 2);
    await expect(dialog).toHaveCount(0);
    await expect(
      panel.getByText('Awaiting staff review', { exact: true }),
    ).toBeVisible();
    await expect(
      bidding.getByRole('button', { name: 'Bid now', exact: true }),
    ).toBeEnabled();
    await capture('request-sent');
    await page.goto('http://localhost:3300/my-bids');
    await expect(
      page.getByText('Awaiting staff review', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'View request', exact: true }),
    ).toHaveAttribute(
      'href',
      '/customer-service?conversation=' + conversation.id,
    );
    await capture('history');
    conversation.status = 'in_progress';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page.getByText('Staff reviewing', { exact: true }),
    ).toBeVisible();
    conversation.status = 'resolved';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page.getByText('Support conversation resolved', { exact: true }),
    ).toBeVisible();
    assert.equal(
      writes,
      0,
      'Support requests cannot call bid/payment/cancel-preparation endpoints',
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      passed: true,
      checks: [
        'commitment and binding notice',
        'Bid now retained',
        'reason and acknowledgement',
        'exact retry after lost response',
        'request status on item and history',
        'silent status refresh',
        'no money or bid writes',
      ],
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/checks.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
