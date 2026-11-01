import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage, document, window */
const dir = 'docs/design/buyer-navigation';
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
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', (route) => {
      const url = new URL(route.request().url());
      const json = (value) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(value),
        });
      if (url.pathname === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (url.pathname === '/buyers/bids')
        return json({
          items: [
            {
              id: randomUUID(),
              lot: {
                id: randomUUID(),
                lotNumber: 'Q7M2P8AX',
                title: 'Wireless headphones',
                status: 'closed',
                thumbnailUrl: null,
              },
              amountKobo: 1250000,
              automatic: false,
              outcome: 'won',
              createdAt: '2026-11-01T09:00:00.000Z',
            },
          ],
          nextCursor: null,
        });
      if (url.pathname === '/wallet')
        return json({
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: 0,
          heldKobo: 0,
          totalKobo: 0,
        });
      if (url.pathname === '/buyers/watchlist/count') return json({ count: 2 });
      if (url.pathname === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 0 });
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/my-bids');
    for (const name of ['All', 'Winning', 'Outbid', 'Won', 'Lost', 'Cancelled'])
      await expect(page.getByRole('tab', { name, exact: true })).toHaveCSS(
        'font-weight',
        '700',
      );
    const shop = page.getByRole('navigation', {
      name: 'Shop auctions',
      exact: true,
    });
    for (const name of ['All deals', 'Top deals', 'Ending soon'])
      await expect(shop.getByRole('link', { name, exact: true })).toHaveCSS(
        'font-weight',
        '700',
      );
    await expect(shop.locator('summary')).toHaveCSS('font-weight', '700');
    const trigger = page.getByLabel('Account menu', { exact: true });
    await trigger.click();
    const menu = page
      .locator('details')
      .filter({ has: trigger })
      .locator('.agn-account-menu');
    await expect(menu).toBeVisible();
    for (const href of [
      '/watchlist',
      '/wallet',
      '/my-bids',
      '/invoices',
      '/pickup-passes',
      '/account',
    ]) {
      const link = menu.locator(`a[href="${href}"]`);
      await expect(link.locator('svg')).toHaveCount(1);
      await expect(link.locator('svg')).toHaveAttribute('aria-hidden', 'true');
      assert.ok((await link.boundingBox()).height >= 44);
    }
    await expect(
      menu
        .getByRole('button', { name: 'Sign out', exact: true })
        .locator('svg'),
    ).toHaveCount(1);
    const box = await menu.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width);
    await page.screenshot({ path: `${dir}/menu-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      boldTabs: true,
      boldShoppingLinks: true,
      accountIcons: true,
      touchTargets: true,
      escapeFocusReturn: true,
      noOverflow: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
