import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage,window,Event */

const dir = 'docs/design/account-refresh';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
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
    const token = randomBytes(32).toString('base64url');
    const orders = Array.from({ length: 11 }, (_, index) => ({
      id: randomUUID(),
      number: `ANG-${index === 0 ? 'X7Q9M2K4' : `Q8M2K4P${index}`}`,
      status: 'paid',
      saleType: index % 2 ? 'fixed_price' : 'auction',
      hammerTotalKobo: 1000000,
      premiumKobo: 150000,
      lotFeeKobo: 30000,
      vatKobo: 13500,
      totalKobo: 1193500,
      createdAt: '2026-10-31T12:00:00.000Z',
    }));
    let denied = false,
      status = 'paid',
      reads = 0;
    let balance = 0;
    let paymentStatus = 'pending',
      confirmations = 0;
    let fail = false,
      empty = false;
    const requests = [];
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const url = new URL(route.request().url());
      const json = (value, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
        });
      if (url.pathname === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (url.pathname === '/payments/transfer/confirm') {
        confirmations++;
        assert.equal(route.request().postDataJSON().paymentId, orders[0].id);
        return json({ paymentId: orders[0].id, status: paymentStatus });
      }
      if (url.pathname === '/buyers/invoices/' + orders[0].id) {
        reads++;
        if (denied) return json({}, 403);
        if (fail) return json({}, 503);
        return json({
          ...orders[0],
          status,
          saleType: empty ? 'fixed_price' : 'auction',
          premiumKobo: empty ? 0 : 150000,
          lotFeeKobo: empty ? 0 : 30000,
          vatKobo: empty ? 75000 : 13500,
          totalKobo: empty ? 1075000 : 1193500,
          pickup: { location: 'Lekki collection centre', status: 'ready' },
          lines: [
            {
              lot: {
                id: orders[1].id,
                lotNumber: 'Y8P4Q2M7',
                title: 'Sony wireless noise-cancelling headphones',
                status: 'closed',
              },
              totalKobo: empty ? 1075000 : 1193500,
            },
          ],
        });
      }
      if (url.pathname === '/buyers/collections') {
        assert.equal(url.searchParams.get('limit'), '10');
        const cursor = url.searchParams.get('cursor');
        requests.push(cursor);
        if (fail) return json({}, 503);
        return json({
          items: empty ? [] : cursor ? orders.slice(10) : orders.slice(0, 10),
          nextCursor: !empty && !cursor ? 'older-orders' : null,
        });
      }
      if (url.pathname === '/wallet')
        return json({
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: balance,
          heldKobo: 0,
          totalKobo: balance,
        });
      if (url.pathname === '/buyers/watchlist/count') return json({ count: 0 });
      if (url.pathname === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 11 });
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/invoices/' + orders[0].id);
    const invoice = page.getByRole('article', {
      name: 'Invoice ' + orders[0].number,
      exact: true,
    });
    await expect(invoice).toBeVisible();
    await expect(invoice.locator('.agn-invoice-status')).toHaveText('Paid');
    const before = reads;
    status = 'refunded';
    balance = 1234500;
    await expect(invoice.locator('.agn-invoice-status')).toHaveText(
      'refunded',
      { timeout: 20000 },
    );
    assert.ok(reads > before, 'updates by timer, without user refresh');
    await expect(page.locator('.agn-portal-sidebar')).toContainText('12,345', {
      timeout: 20000,
    });
    fail = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Invoice could not be refreshed' }),
    ).toBeVisible();
    await expect(invoice).toBeVisible();
    await page.screenshot({
      path: dir + '/retained-' + width + '.png',
      fullPage: true,
    });
    fail = false;
    denied = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(invoice).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Invoice unavailable', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: dir + '/denied-' + width + '.png' });
    denied = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(invoice).toBeVisible();
    assert.deepEqual(errors, []);
    await page.goto(
      `http://localhost:3300/payments/return?kind=wallet_transfer&id=${orders[0].id}&status=success`,
    );
    await expect(
      page.getByRole('heading', { name: 'Awaiting confirmation', exact: true }),
    ).toBeVisible();
    const pendingCalls = confirmations;
    paymentStatus = 'credited';
    await expect(
      page.getByRole('heading', { name: 'Payment confirmed', exact: true }),
    ).toBeVisible({ timeout: 20000 });
    assert.ok(confirmations > pendingCalls);
    results.push({
      width,
      timerRefreshWithoutNavigation: true,
      retainOn503: true,
      discardOn403: true,
      retryRecovery: true,
      pendingPaymentRefresh: true,
      sidebarBalanceRefresh: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(dir + '/review.json', JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
