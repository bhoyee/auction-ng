import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage,sessionStorage */
const dir = 'docs/design/funding-history-status';
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
    let latePaid = false,
      failOnce = true;
    const attempts = [];
    await context.addInitScript(() => {
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      );
      sessionStorage.setItem('auction-ng-pending-payment', 'unrelated-payment');
      sessionStorage.setItem('auction-ng-pending-payment-method', 'card');
    });
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
          availableKobo: latePaid ? 1960000 : 0,
          heldKobo: 0,
          totalKobo: latePaid ? 1960000 : 0,
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
              status: 'pending',
              createdAt: new Date().toISOString(),
            },
            {
              id: transfer,
              fundingMethod: 'checkout_transfer',
              transferKobo: 2000000,
              feeKobo: 40000,
              creditKobo: 1960000,
              status: latePaid ? 'credited' : 'pending',
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
      if (
        path === '/payments/card/confirm' ||
        path === '/payments/transfer/confirm'
      ) {
        const body = route.request().postDataJSON();
        attempts.push({ path, id: body.paymentId });
        assert.equal(body.paymentId, path.includes('/card/') ? card : transfer);
        if (failOnce) {
          failOnce = false;
          return json({}, 503);
        }
        if (path.includes('/transfer/')) latePaid = true;
        return json({
          paymentId: body.paymentId,
          status: latePaid ? 'credited' : 'pending',
        });
      }
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3300/wallet');
    const history = page.getByRole('region', {
      name: 'Funding history',
      exact: true,
    });
    await expect(
      history.getByRole('button', { name: 'Check status', exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: 'Check pending payment', exact: true }),
    ).toHaveCount(0);
    await expect(
      history.locator('tbody tr').nth(2).getByRole('button'),
    ).toHaveCount(0);
    const cardRow = history.locator('tbody tr').first();
    await page.screenshot({
      path: dir + '/wallet-' + width + '.png',
      fullPage: true,
    });
    await cardRow
      .getByRole('button', { name: 'Check status', exact: true })
      .click();
    await expect(
      page.getByText(/Payment could not be checked. Retry this payment/),
    ).toBeVisible();
    await page.screenshot({ path: dir + '/error-' + width + '.png' });
    await cardRow
      .getByRole('button', { name: 'Check status', exact: true })
      .click();
    await expect(page.getByText(/Payment is still pending/)).toBeVisible();
    await history
      .locator('tbody tr')
      .nth(1)
      .getByRole('button', { name: 'Check status', exact: true })
      .click();
    await expect(
      page.getByText(/Payment confirmed. Your wallet has been credited/),
    ).toBeVisible();
    await expect(history.locator('tbody tr').nth(1)).toContainText('Credited');
    await expect(cardRow).toContainText('Pending');
    await expect(
      history.locator('tbody tr').nth(1).getByRole('button'),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Wallet balance', exact: true }),
    ).toContainText('\u20a619,600');
    assert.equal(
      await page.evaluate(() =>
        sessionStorage.getItem('auction-ng-pending-payment'),
      ),
      'unrelated-payment',
    );
    assert.deepEqual(attempts, [
      { path: '/payments/card/confirm', id: card },
      { path: '/payments/card/confirm', id: card },
      { path: '/payments/transfer/confirm', id: transfer },
    ]);
    await page.screenshot({
      path: dir + '/confirmed-' + width + '.png',
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    results.push({
      width,
      selectedRowRouting: true,
      unrelatedStorageIgnored: true,
      errorRetry: true,
      pendingFeedback: true,
      successFeedback: true,
      silentBalanceUpdate: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(dir + '/review.json', JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
