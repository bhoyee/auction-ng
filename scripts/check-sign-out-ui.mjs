import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage */
const dir = 'docs/design/buyer-sign-out';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
      hasTouch: false,
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
    let signedIn = true,
      fail = true,
      calls = 0;
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
        return signedIn
          ? json({ accessToken: token, expiresInSeconds: 900, user })
          : json({}, 401);
      if (path === '/auth/logout') {
        calls++;
        if (fail) return json({}, 503);
        await new Promise((resolve) => setTimeout(resolve, 500));
        signedIn = false;
        return route.fulfill({ status: 204, body: '' });
      }
      if (path === '/auth/security')
        return json({
          enabled: false,
          mandatory: false,
          recoveryCodesRemaining: 0,
        });
      if (path === '/wallet')
        return json({
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: 0,
          heldKobo: 0,
          totalKobo: 0,
        });
      if (path === '/buyers/watchlist/count') return json({ count: 0 });
      if (path === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 0 });
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage(),
      documents = [],
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        documents.push(new URL(request.url()).pathname);
    });
    await page.goto('http://localhost:3300/account');
    await expect(page.getByLabel('Full name', { exact: true })).toHaveValue(
      'Amina Yusuf',
    );
    const menu = page.getByLabel('Account menu', { exact: true }).locator('..');
    await expect(menu).toBeVisible();
    await menu.locator('summary').click();
    await expect(menu).toHaveAttribute('open', '');
    const signOut = menu.getByRole('button', { name: 'Sign out', exact: true });
    await signOut.hover();
    await expect(signOut).toHaveCSS('cursor', 'pointer');
    await expect(signOut).toHaveCSS('background-color', 'rgb(238, 240, 250)');
    await expect(signOut).toHaveCSS('border-top-width', '0px');
    await page.screenshot({ path: `${dir}/hover-${width}.png` });
    await signOut.click();
    await expect(page.locator('.agn-toast--error')).toContainText(
      'Sign out could not be completed',
    );
    await expect(signOut).toBeEnabled();
    assert.equal(new URL(page.url()).pathname, '/account');
    fail = false;
    await signOut.click();
    await expect(signOut).toBeDisabled();
    await expect(signOut).toHaveCSS('cursor', 'wait');
    await page.waitForURL('http://localhost:3300/');
    await expect(
      page.getByRole('link', { name: 'Sign in', exact: true }).first(),
    ).toBeVisible();
    assert.equal(calls, 2);
    assert.ok(!documents.includes('/sign-in'));
    assert.equal(
      await page.getByLabel('Account menu', { exact: true }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      pointerAndHover: true,
      failureKeepsSession: true,
      disabledWhilePending: true,
      homepageAfterSuccess: true,
      noLoginRedirect: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
