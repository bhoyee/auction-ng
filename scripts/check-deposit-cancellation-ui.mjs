import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage,sessionStorage */
const dir = 'docs/design/deposit-cancellation';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch(),
  results = [];
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
      },
      token = randomBytes(32).toString('base64url');
    const card = randomUUID(),
      transfer = randomUUID(),
      paid = randomUUID();
    let cancelled = false,
      latePaid = false,
      failOnce = true;
    const attempts = [];
    await context.addInitScript(
      ({ card }) => {
        localStorage.setItem(
          'auction-ng-cookie-notice',
          JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
        );
        sessionStorage.setItem('auction-ng-pending-payment', card);
        sessionStorage.setItem('auction-ng-pending-payment-method', 'card');
      },
      { card },
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const path = new URL(route.request().url()).pathname,
        json = (data, status = 200) =>
          route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(data),
          });
      if (path === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (path === '/wallet/controls')
        return json({
          depositsEnabled: true,
          withdrawalsEnabled: true,
          revision: 0,
          updatedAt: new Date().toISOString(),
        });
      if (path === '/wallet')
        return json({
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: latePaid ? 975000 : 0,
          heldKobo: 0,
          totalKobo: latePaid ? 975000 : 0,
        });
      if (path === '/buyers/watchlist/count') return json({ count: 0 });
      if (path === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 0 });
      if (path === '/withdrawals/overview')
        return json({
          enabled: true,
          automaticAvailableKobo: 0,
          reviewAvailableKobo: 0,
          minimumKobo: 100000,
          dailyLimitKobo: 50000000,
          bank: null,
          bankChange: null,
        });
      if (path === '/payments/history')
        return json({
          items: [
            {
              id: card,
              fundingMethod: 'card',
              transferKobo: 1000000,
              feeKobo: 25000,
              creditKobo: 975000,
              status: latePaid
                ? 'credited'
                : cancelled
                  ? 'cancelled'
                  : 'pending',
              createdAt: new Date().toISOString(),
            },
            {
              id: transfer,
              fundingMethod: 'checkout_transfer',
              transferKobo: 2000000,
              feeKobo: 40000,
              creditKobo: 1960000,
              status: 'pending',
              createdAt: new Date().toISOString(),
            },
            {
              id: paid,
              fundingMethod: 'card',
              transferKobo: 3000000,
              feeKobo: 55000,
              creditKobo: 2945000,
              status: 'credited',
              createdAt: new Date().toISOString(),
            },
          ],
          nextCursor: null,
        });
      if (path === '/payments/checkout/cancel') {
        const body = route.request().postDataJSON();
        attempts.push(body.paymentId);
        assert.equal(body.paymentId, card);
        if (failOnce) {
          failOnce = false;
          return json({}, 503);
        }
        cancelled = true;
        return json({ paymentId: card, status: 'cancelled' });
      }
      if (path === '/payments/card/confirm')
        return json({
          paymentId: card,
          status: latePaid ? 'credited' : cancelled ? 'cancelled' : 'pending',
        });
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3300/wallet');
    let history = page.getByRole('region', {
      name: 'Funding history',
      exact: true,
    });
    await expect(
      history.getByRole('button', { name: 'Cancel checkout', exact: true }),
    ).toHaveCount(2);
    await expect(
      history.locator('tbody tr').nth(2).getByRole('button'),
    ).toHaveCount(0);
    await history
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Cancel checkout', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Cancel deposit checkout?',
      exact: true,
    });
    await expect(dialog).toContainText('does not reverse');
    await expect(dialog).toContainText('confirmed later');
    await dialog
      .getByRole('button', { name: 'Keep checkout', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    assert.equal(attempts.length, 0);
    await history
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Cancel checkout', exact: true })
      .click();
    await page.screenshot({ path: `${dir}/confirmation-${width}.png` });
    await dialog
      .getByRole('button', { name: 'Cancel checkout', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toContainText(
      'retry this same checkout',
    );
    await page.screenshot({ path: `${dir}/error-${width}.png` });
    await dialog
      .getByRole('button', { name: 'Cancel checkout', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(history.locator('tbody tr').first()).toContainText(
      'Cancelled',
    );
    await expect(
      history.locator('tbody tr').first().locator('.agn-wallet-tag'),
    ).toHaveCSS('background-color', 'rgb(200, 52, 28)');
    await expect(
      history.getByRole('button', { name: 'Cancel checkout', exact: true }),
    ).toHaveCount(1);
    assert.deepEqual(attempts, [card, card]);
    assert.equal(
      await page.evaluate(() =>
        sessionStorage.getItem('auction-ng-pending-payment'),
      ),
      null,
    );
    await expect(
      page.getByRole('region', { name: 'Wallet balance', exact: true }),
    ).toContainText('₦0');
    await page.screenshot({
      path: `${dir}/cancelled-${width}.png`,
      fullPage: true,
    });
    await page.goto(
      `http://localhost:3300/payments/return?kind=wallet&id=${card}`,
    );
    await expect(
      page.getByRole('heading', { name: 'Checkout cancelled', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `${dir}/return-${width}.png` });
    await page
      .getByRole('link', { name: 'Back to wallet', exact: true })
      .click();
    history = page.getByRole('region', {
      name: 'Funding history',
      exact: true,
    });
    await expect(history.locator('tbody tr').first()).toContainText(
      'Cancelled',
    );
    latePaid = true;
    await expect(history.locator('tbody tr').first()).toContainText(
      'Credited',
      { timeout: 22000 },
    );
    await expect(
      page.getByRole('region', { name: 'Wallet balance', exact: true }),
    ).toContainText('₦9,750', { timeout: 22000 });
    await page.screenshot({
      path: `${dir}/late-credit-${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    results.push({
      width,
      ownedPendingActions: true,
      confirmation: true,
      errorRetrySameId: true,
      cancelledBadge: true,
      noCancellationCredit: true,
      localTrackingCleared: true,
      returnState: true,
      lateCreditRefresh: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
