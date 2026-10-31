import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage */

const dir = 'docs/design/check-in-availability';
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
          availableKobo: 0,
          heldKobo: 0,
          totalKobo: 0,
        });
      if (url.pathname === '/buyers/watchlist/count') return json({ count: 0 });
      if (url.pathname === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 11 });
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3300/check-in');
    await expect(
      page.getByRole('heading', {
        name: 'Online check-in is not available yet',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('a[href="/check-in"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/invoices/"]')).toHaveCount(0);
    assert.equal(requests.length, 0);
    await page.screenshot({
      path: dir + '/check-in-' + width + '.png',
      fullPage: true,
    });
    await page
      .getByRole('link', { name: 'View awaiting pickup', exact: true })
      .click();
    await expect(
      page
        .getByRole('region', { name: 'Orders awaiting pickup', exact: true })
        .locator('li'),
    ).toHaveCount(10);
    await expect(page.locator('a[href="/check-in"]')).toHaveCount(0);
    await page.screenshot({
      path: dir + '/account-menu-' + width + '.png',
      fullPage: true,
    });
    if (width === 1280) {
      await page
        .getByRole('button', { name: 'Collapse account sidebar', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Expand account sidebar', exact: true })
        .click();
    }
    assert.deepEqual(errors, []);
    results.push({
      width,
      checkInHidden: true,
      noDuplicateInvoices: true,
      noArrivalClaim: true,
      noCollectionFetchOnCheckIn: true,
      pickupNavigation: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(dir + '/review.json', JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
