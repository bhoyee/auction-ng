import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage,window,Event,document */

const dir = 'docs/design/awaiting-pickup';
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
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/awaiting-pickup');
    const list = page.getByRole('region', {
      name: 'Orders awaiting pickup',
      exact: true,
    });
    await expect(list.locator('li')).toHaveCount(10);
    const first = list.locator('li').first();
    if (width >= 768) {
      const badge = await first.locator('.agn-pickup-payment').boundingBox();
      const amount = await first
        .locator('.agn-pickup-order-amount')
        .boundingBox();
      assert.ok(badge && amount);
      assert.ok(
        Math.abs(badge.y + badge.height / 2 - amount.y - amount.height / 2) < 2,
      );
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await expect(list.getByText('Paid', { exact: true })).toHaveCount(10);
    await expect(list.locator('.agn-pickup-payment').first()).toHaveCSS(
      'background-color',
      'rgb(18, 122, 85)',
    );
    await expect(list.locator('.agn-pickup-order-amount').first()).toHaveCSS(
      'font-weight',
      '700',
    );
    await expect(
      list.getByRole('link', {
        name: `View pickup pass for ${orders[0].number}`,
        exact: true,
      }),
    ).toHaveAttribute('href', `/invoices/${orders[0].id}/pickup-pass`);
    await expect(
      list.getByRole('button', { name: 'Previous', exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: `${dir}/orders-${width}.png`,
      fullPage: true,
    });
    await list.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(list.locator('li')).toHaveCount(1);
    await expect(list).toContainText('Page 2');
    await expect(
      list.getByRole('button', { name: 'Next', exact: true }),
    ).toBeDisabled();
    await list.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(list.locator('li')).toHaveCount(10);
    assert.ok(requests.includes('older-orders'));
    fail = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Pickup orders could not be refreshed' }),
    ).toContainText('Pickup orders could not be refreshed');
    await expect(list.locator('li')).toHaveCount(10);
    await page.screenshot({ path: `${dir}/error-${width}.png` });
    fail = false;
    empty = true;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Nothing awaiting pickup',
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({ path: `${dir}/empty-${width}.png` });
    assert.deepEqual(errors, []);
    results.push({
      width,
      alignedOrders: true,
      paidBadge: true,
      boldAmount: true,
      tenRowCursorPagination: true,
      correctPrivatePassLink: true,
      retainedRowsOnRefreshError: true,
      emptyState: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
