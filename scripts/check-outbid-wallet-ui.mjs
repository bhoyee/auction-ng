import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
/* global localStorage,document,innerWidth,getComputedStyle */
const dir = 'docs/design/outbid-wallet';
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
      email: 'amina@example.test',
      role: 'buyer',
      status: 'active',
      emailVerified: true,
      phoneVerified: false,
      phone: null,
      address: null,
      passwordSet: true,
    };
    const lotId = randomUUID();
    const noticeId = randomUUID();
    const token = randomBytes(32).toString('base64url');
    let outbid = false;
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      if (path === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (path === '/wallet')
        return json({
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: 100000000,
          heldKobo: 2500000,
          totalKobo: 102500000,
        });
      if (path === '/payments/transfer/confirm')
        return json({ paymentId: noticeId, status: 'credited' });
      if (path === '/buyers/watchlist/count') return json({ count: 1 });
      if (path === '/buyers/notifications/summary')
        return json({ unread: outbid ? 1 : 0, awaitingPickup: 0 });
      if (path === '/buyers/notifications')
        return json({
          items: outbid
            ? [
                {
                  id: noticeId,
                  title: 'You were outbid. View item to bid again',
                  href: '/lots/' + lotId,
                  createdAt: new Date().toISOString(),
                  readAt: null,
                },
              ]
            : [],
          nextCursor: null,
        });
      if (['/payments/history', '/wallet/history'].includes(path))
        return json({ items: [], nextCursor: null });
      return route.fulfill({ status: 404, body: '{}' });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/wallet');
    await expect(
      page.getByRole('heading', { name: 'Wallet', exact: true }),
    ).toBeVisible();
    await page.locator('.agn-portal-hold-note').waitFor();
    assert.equal(
      await page
        .locator('.agn-portal-hold-note')
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(255, 198, 41)',
    );
    assert.equal(
      await page.getByRole('link', { name: 'Balance', exact: true }).count(),
      0,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `${dir}/wallet-${width}.png`,
      fullPage: true,
    });
    outbid = true;
    await page
      .getByLabel('Notifications, 1 unread', { exact: true })
      .waitFor({ timeout: 25000 });
    await page.getByLabel('Notifications, 1 unread', { exact: true }).click();
    const link = page.getByRole('link', { name: /You were outbid/ });
    await expect(link).toHaveAttribute('href', '/lots/' + lotId);
    await page.screenshot({
      path: `${dir}/outbid-${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await page.goto(
      `http://localhost:3300/payments/return?kind=wallet_transfer&id=${noticeId}`,
    );
    await expect(
      page.getByRole('link', { name: 'Back to wallet', exact: true }),
    ).toHaveAttribute('href', '/wallet');
    await context.close();
    const email = await browser.newPage({ viewport: { width, height: 1000 } });
    const template = JSON.parse(
      readFileSync('apps/api/src/closing/outbid-email.generated.json', 'utf8'),
    );
    await email.setContent(
      template.html
        .replaceAll('{{title}}', 'Wireless headphones')
        .replaceAll('{{lotNumber}}', 'Q7M9AB2X')
        .replaceAll('{{price}}', '&#8358;12,500')
        .replaceAll('{{itemUrl}}', 'http://localhost:3300/lots/' + lotId),
    );
    assert.equal(
      await email.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await email.screenshot({
      path: `${dir}/email-${width}.png`,
      fullPage: true,
    });
    await email.close();
    results.push({
      width,
      walletHeading: true,
      yellowReservedFunds: true,
      outbidBellAndLink: true,
      noOverflow: true,
    });
  }
  writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
