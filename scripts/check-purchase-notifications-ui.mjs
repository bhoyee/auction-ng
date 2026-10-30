import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { calculateFixedPrice } from '../packages/shared/src/fees.ts';
/* global localStorage,sessionStorage,document,innerWidth,getComputedStyle,setInterval,clearInterval */
const lots = (await (await fetch('http://localhost:4000/lots?limit=50')).json())
  .items;
const lot = lots.find((item) => item.fixedPriceKobo !== null);
assert.ok(lot, 'An active fixed-price demo lot is needed');
const dir = 'docs/design/purchase-notifications';
mkdirSync(dir, { recursive: true });
const review = [];
const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const user = {
      id: randomUUID(),
      name: 'Amina Yusuf',
      email: 'amina@example.test',
      role: 'buyer',
      status: 'active',
      emailVerified: true,
      phoneVerified: false,
      phone: null,
      address: null,
      passwordSet: true,
    };
    const token = randomBytes(32).toString('base64url'),
      purchaseId = randomUUID(),
      invoiceId = randomUUID(),
      noticeId = randomUUID();
    let mode = 'paid',
      unread = 0,
      pickup = 0,
      readAt = null,
      hasNotice = false,
      lastInput,
      starts = 0;
    const quote = calculateFixedPrice(lot.fixedPriceKobo);
    const value = () => ({
      id: purchaseId,
      lotId: lot.id,
      method: lastInput?.method ?? 'wallet',
      status:
        mode === 'paid' ? 'paid' : mode === 'expired' ? 'expired' : 'pending',
      priceKobo: quote.priceKobo,
      taxKobo: quote.taxKobo,
      totalKobo: quote.totalKobo,
      amountKobo: lastInput?.acceptedTotalKobo ?? quote.totalKobo,
      processingFeeKobo: lastInput?.acceptedProcessingFeeKobo ?? 0,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      invoiceId: mode === 'paid' ? invoiceId : null,
      authorizationUrl:
        mode === 'pending' ? 'https://checkout.paystack.com/fixture' : null,
      fundsCredited: mode === 'expired',
    });
    const state = {
      lotId: lot.id,
      currentPriceKobo: null,
      endsAt: lot.endsAt,
      streamId: '1-0',
      serverTime: new Date().toISOString(),
      isLeader: false,
    };
    const peers = new Set();
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.routeWebSocket(
      'ws://localhost:4001/socket.io/**',
      (socket) => {
        peers.add(socket);
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
        const heartbeat = setInterval(
          () =>
            socket.send(
              '42' +
                JSON.stringify([
                  'serverTime',
                  { serverTime: new Date().toISOString() },
                ]),
            ),
          4000,
        );
        socket.onClose(() => {
          clearInterval(heartbeat);
          peers.delete(socket);
        });
        socket.onMessage((raw) => {
          const message = String(raw);
          if (message.startsWith('40')) {
            const ns = message.startsWith('40/public,') ? '/public,' : '';
            socket.send('40' + ns + JSON.stringify({ sid: randomUUID() }));
            return;
          }
          const parsed = message.match(/^42(\/public,)?(\d+)(\[.*\])$/);
          if (!parsed) return;
          const [event, input] = JSON.parse(parsed[3]);
          const value =
            event === 'clock:sync'
              ? { serverTime: new Date().toISOString() }
              : { ok: true, lot: { ...state, lotId: input.lotId } };
          socket.send(
            '43' + (parsed[1] ?? '') + parsed[2] + JSON.stringify([value]),
          );
        });
      },
    );

    await context.route('http://localhost:4000/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      if (path === '/time')
        return json({ serverTime: new Date().toISOString() });
      if (path === '/lots/' + lot.id + '/result')
        return json({
          lotId: lot.id,
          state: mode === 'paid' && hasNotice ? 'sold' : 'open',
          finalPriceKobo: mode === 'paid' && hasNotice ? quote.priceKobo : null,
          serverTime: new Date().toISOString(),
        });
      if (path === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (path === '/wallet')
        return json({
          id: randomUUID(),
          userId: user.id,
          currency: 'NGN',
          availableKobo: 100000000,
          heldKobo: 0,
          totalKobo: 100000000,
        });
      if (path === '/buyers/watchlist/status') return json({ lotIds: [] });
      if (path === '/buyers/watchlist/count') return json({ count: 0 });
      if (path === '/buyers/notifications/summary')
        return json({ unread, awaitingPickup: pickup });
      if (path === '/buyers/notifications')
        return json({
          items: hasNotice
            ? [
                {
                  id: noticeId,
                  title: 'Your Buy Now purchase is confirmed',
                  href: '/awaiting-pickup',
                  createdAt: new Date().toISOString(),
                  readAt,
                },
              ]
            : [],
          nextCursor: null,
        });
      if (path === '/buyers/notifications/read') {
        assert.deepEqual(route.request().postDataJSON(), { ids: [noticeId] });
        unread = 0;
        readAt = new Date().toISOString();
        return json({ updated: 1 });
      }
      if (path === '/lots/' + lot.id + '/purchases') {
        starts++;
        lastInput = route.request().postDataJSON();
        if (mode === 'failure') return json({}, 503);
        if (mode === 'shortfall') return json({}, 422);
        if (mode === 'paid') {
          unread = 1;
          pickup = 1;
          hasNotice = true;
          readAt = null;
        }
        return json(value());
      }
      if (
        path === '/purchases/' + purchaseId ||
        path === '/purchases/' + purchaseId + '/confirm'
      ) {
        if (mode === 'paid') {
          unread = 1;
          pickup = 1;
          hasNotice = true;
          readAt = null;
        }
        return json(value());
      }
      if (path === '/payments/card/confirm')
        return json({
          paymentId: purchaseId,
          status: mode === 'failure' ? 'failed' : 'credited',
        });
      if (path.includes('bid-history') || path.includes('my-bids'))
        return json({ items: [], nextCursor: null });
      if (path.startsWith('/lots') || path.startsWith('/categories'))
        return route.continue();
      return json({}, 404);
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const open = async () => {
      await page.goto('http://localhost:3300/lots/' + lot.id);
      await page
        .getByRole('button', { name: 'Review bid', exact: true })
        .waitFor();
      await page.getByRole('button', { name: 'Buy Now', exact: true }).click();
    };
    const reset = async (nextMode) => {
      mode = nextMode;
      await page.evaluate(
        (key) => sessionStorage.removeItem(key),
        `auction-ng-purchase:${user.id}:${lot.id}`,
      );
      await open();
    };
    await open();
    const purchase = page.getByRole('region', {
      name: 'Instant purchase',
      exact: true,
    });
    await purchase.getByRole('button', { name: /^Buy now / }).click();
    const success = page.locator('.agn-toast--floating.agn-toast--success');
    await success.getByText(/Purchase successful/).waitFor();
    await page
      .getByRole('region', { name: 'Auction result', exact: true })
      .getByText('Sold', { exact: true })
      .waitFor();
    await expect(success).toBeVisible();
    await expect(
      page.getByLabel('Notifications, 1 unread', { exact: true }),
    ).toBeVisible();
    assert.equal(
      await page
        .locator('.agn-notification-count')
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(200, 52, 28)',
    );
    await page.screenshot({
      path: dir + '/purchase-success-' + width + '.png',
    });
    await page.getByLabel('Notifications, 1 unread', { exact: true }).click();
    const menu = page.locator('.agn-notification-menu .agn-account-menu');
    await menu
      .getByRole('link', { name: /Your Buy Now purchase is confirmed/ })
      .waitFor();
    assert.equal(
      await menu.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth;
      }),
      true,
      'Notification menu stays inside the viewport',
    );
    await expect(
      menu.getByRole('link', { name: 'Awaiting pickup 1', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: dir + '/bell-' + width + '.png' });
    await menu
      .getByRole('button', { name: 'Mark these as read', exact: true })
      .click();
    await expect(
      page.getByLabel('Notifications, 0 unread', { exact: true }),
    ).toBeVisible();
    assert.equal(await page.locator('.agn-notification-count').count(), 0);
    await reset('failure');
    await purchase.getByRole('button', { name: /^Buy now / }).click();
    await page
      .locator('.agn-toast--floating.agn-toast--error')
      .getByText(/We could not confirm this request/)
      .waitFor();
    const key = lastInput.idempotencyKey;
    await purchase
      .getByRole('button', {
        name: 'Check existing purchase request',
        exact: true,
      })
      .click();
    assert.equal(
      lastInput.idempotencyKey,
      key,
      'Unknown results retain the same request key',
    );
    await page.screenshot({ path: dir + '/purchase-error-' + width + '.png' });
    await reset('shortfall');
    await purchase.getByRole('button', { name: /^Buy now / }).click();
    await page
      .locator('.agn-toast--floating.agn-toast--error')
      .getByText(/Your available wallet funds are too low/)
      .waitFor();
    await reset('pending');
    await purchase
      .getByRole('radio', { name: 'Nigerian card', exact: true })
      .check();
    await purchase.getByRole('button', { name: /^Reserve and pay / }).click();
    await page
      .locator('.agn-toast--floating.agn-toast--info')
      .getByText(/Payment is still pending/)
      .waitFor();
    assert.equal(
      await success.count(),
      0,
      'Pending reservations never claim purchase success',
    );
    mode = 'paid';
    await success.getByText(/Purchase successful/).waitFor({ timeout: 10000 });
    await expect(
      page.getByLabel('Notifications, 1 unread', { exact: true }),
    ).toBeVisible();
    await reset('expired');
    await purchase.getByRole('button', { name: /^Buy now / }).click();
    await page
      .locator('.agn-toast--floating.agn-toast--info')
      .getByText(/Payment received into your wallet/)
      .waitFor();
    assert.equal(
      await success.count(),
      0,
      'Late payments must not claim that the item was purchased',
    );
    mode = 'paid';
    await page.goto(
      `http://localhost:3300/payments/return?kind=wallet&id=${purchaseId}`,
    );
    await success
      .getByText('Payment successful. Your wallet has been credited.', {
        exact: true,
      })
      .waitFor();
    mode = 'failure';
    await page.reload();
    await page
      .locator('.agn-toast--floating.agn-toast--error')
      .getByText(/payment or reservation was not completed/)
      .waitFor();
    mode = 'expired';
    await page.goto(
      `http://localhost:3300/payments/return?kind=purchase&id=${purchaseId}`,
    );
    await page
      .locator('.agn-toast--floating.agn-toast--info')
      .getByText(/Payment received into your wallet/)
      .waitFor();
    assert.equal(
      await success.count(),
      0,
      'Expired purchase callbacks do not claim that an order was paid',
    );
    assert.deepEqual(errors, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    review.push({
      width,
      purchaseSuccess: true,
      purchaseFailure: true,
      uncertainRetryKeyPreserved: true,
      pendingNotSuccess: true,
      lateFundsNotPurchase: true,
      bellCount: true,
      markRead: true,
      paymentReturnFeedback: true,
      starts,
    });
    await context.close();
  }
  writeFileSync(dir + '/review.json', JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify(review));
} finally {
  await browser.close();
}
