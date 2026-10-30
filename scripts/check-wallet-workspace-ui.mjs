import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
/* global localStorage,sessionStorage,window,Event,document,innerWidth,getComputedStyle */
const browser = await chromium.launch();
const dir = 'docs/design/wallet-workspace';
mkdirSync(dir, { recursive: true });
const review = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const id = randomUUID();
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
    const token = randomBytes(32).toString('base64url');
    const walletTokens = new Map();
    let issuedToken = token,
      expiredReads = false,
      rotateNext = false,
      refreshCalls = 0;
    let paymentStatus = 'pending',
      confirmCalls = 0,
      quotedAmount;
    let personalAccountRequests = 0;
    const historyCursors = [];
    let failFunding = false;
    let balance = 975000,
      failRefresh = false,
      holdRefresh = false,
      releaseRefresh,
      heldReady;
    let held = new Promise((resolve) => (heldReady = resolve));
    let acceptedInput;
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/payments/history' || path === '/wallet/history')
        historyCursors.push(
          new URL(route.request().url()).searchParams.get('cursor'),
        );
      if (['/payments/virtual-account', '/payments/banks'].includes(path))
        personalAccountRequests++;
      const json = (value, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
        });
      if (path === '/auth/refresh') {
        refreshCalls++;
        if (expiredReads || rotateNext) {
          issuedToken = randomBytes(32).toString('base64url');
          expiredReads = false;
          rotateNext = false;
        }
        return json({ accessToken: issuedToken, expiresInSeconds: 900, user });
      }
      if (
        ['/wallet', '/wallet/history', '/payments/history'].includes(path) &&
        (expiredReads ||
          route.request().headers().authorization !== 'Bearer ' + issuedToken)
      )
        return json({}, 401);
      if (path === '/wallet') {
        walletTokens.set(
          route.request().frame().page(),
          route.request().headers().authorization,
        );
        if (
          holdRefresh &&
          route.request().headers()['content-type'] === 'application/json'
        ) {
          heldReady();
          await new Promise((resolve) => (releaseRefresh = resolve));
        }
        if (
          failRefresh &&
          route.request().headers()['content-type'] === 'application/json'
        )
          return json({}, 503);
        return json({
          id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: balance,
          heldKobo: 0,
          totalKobo: balance,
        });
      }
      if (path === '/payments/history' && failFunding) return json({}, 503);
      if (
        [
          '/wallet/history',
          '/payments/history',
          '/buyers/notifications',
        ].includes(path)
      )
        return json({
          items:
            path === '/payments/history'
              ? [
                  {
                    id: randomUUID(),
                    fundingMethod: 'bank_transfer',
                    transferKobo: 1000000,
                    feeKobo: 10000,
                    creditKobo: 990000,
                    status: 'credited',
                    createdAt: new Date().toISOString(),
                  },
                ]
              : path === '/wallet/history'
                ? [
                    {
                      id: randomUUID(),
                      operation: 'topup',
                      amountKobo: 990000,
                      availableDeltaKobo: 990000,
                      heldDeltaKobo: 0,
                      holdId: null,
                      sourceTransactionId: null,
                      createdAt: new Date().toISOString(),
                    },
                  ]
                : [],
          nextCursor:
            path === '/payments/history' &&
            !new URL(route.request().url()).searchParams.has('cursor')
              ? 'next-funding'
              : null,
        });
      if (path === '/buyers/watchlist/count') return json({ count: 0 });
      if (path === '/payments/virtual-account')
        return json({ status: 'not_requested' });
      if (path === '/payments/transfer/quote') {
        quotedAmount = route.request().postDataJSON().amountKobo;
        return json({
          amountKobo: quotedAmount,
          feeKobo: 25000,
          creditKobo: quotedAmount - 25000,
          currency: 'NGN',
          feePolicy: 'paystack-transfer-v1',
        });
      }
      if (path === '/payments/banks')
        return json({
          items: [
            { name: 'Transfer network', code: 'C08' },
            { name: 'Microfinance bank', code: 'MFB51116M' },
          ],
          nextCursor: null,
        });
      if (path === '/payments/transfer/initialize') {
        acceptedInput = route.request().postDataJSON();
        return json({
          amountKobo: 1000000,
          feeKobo: 25000,
          creditKobo: 975000,
          currency: 'NGN',
          feePolicy: 'paystack-transfer-v1',
          paymentId: id,
          authorizationUrl: 'https://checkout.paystack.com/synthetic-transfer',
        });
      }
      if (
        path === '/payments/card/confirm' ||
        path === '/payments/transfer/confirm'
      ) {
        confirmCalls++;
        assert.equal(route.request().postDataJSON().paymentId, id);
        return json({ paymentId: id, status: paymentStatus });
      }
      if (path === `/purchases/${id}/confirm`)
        return json({
          id,
          lotId: randomUUID(),
          method: 'local_card',
          status: 'paid',
          priceKobo: 1000000,
          taxKobo: 75000,
          totalKobo: 1075000,
          amountKobo: 1100000,
          processingFeeKobo: 25000,
          expiresAt: new Date().toISOString(),
          invoiceId: randomUUID(),
          authorizationUrl: null,
          fundsCredited: false,
        });
      return json({}, 404);
    });
    await context.route('https://checkout.paystack.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<p>Isolated checkout fixture</p>',
      }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3300/wallet');
    const amount = page.getByRole('textbox', {
      name: 'Amount to pay',
      exact: true,
    });
    await page.getByText(/Personal account transfer/).waitFor();
    assert.equal(
      await page
        .getByRole('button', {
          name: 'Set up personal transfer account',
          exact: true,
        })
        .count(),
      0,
    );
    assert.equal(await page.getByLabel('BVN', { exact: true }).count(), 0);
    assert.equal(personalAccountRequests, 0);
    const selector = page.getByRole('button', { name: /Payment method/ });
    await selector.click();
    assert.equal(await page.getByRole('radio').count(), 3);
    await page
      .getByRole('radio', { name: 'International card', exact: true })
      .check();
    await page.keyboard.press('Escape');
    assert.match(await selector.innerText(), /International card/);
    await selector.click();
    await page
      .getByRole('radio', { name: 'One-time bank transfer', exact: true })
      .check();
    await page.keyboard.press('Escape');
    await page
      .getByRole('tab', { name: 'Wallet activity', exact: true })
      .click();
    await page
      .getByRole('table', { name: 'Wallet activity', exact: true })
      .waitFor();
    await page
      .getByRole('tab', { name: 'Funding history', exact: true })
      .click();
    await page
      .getByRole('table', { name: 'Funding history', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await page
      .getByRole('button', { name: 'Back to newest', exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'Next page', exact: true })
      .waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => document.querySelector('.agn-wallet-table') !== null,
    );
    assert.ok(historyCursors.includes('next-funding'));
    await page
      .getByRole('button', { name: 'Back to newest', exact: true })
      .click();
    await page
      .getByRole('table', { name: 'Funding history', exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'Check pending payment', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Check pending payment',
      exact: true,
    });
    await dialog.waitFor();
    await dialog
      .getByRole('button', { name: 'Check payment status', exact: true })
      .click();
    await dialog.getByText(/No checkout is pending/).waitFor();
    await dialog
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
    await dialog.waitFor({ state: 'hidden' });
    await page.evaluate((paymentId) => {
      sessionStorage.setItem('auction-ng-pending-payment', paymentId);
      sessionStorage.setItem('auction-ng-pending-payment-method', 'transfer');
    }, id);
    await page
      .getByRole('button', { name: 'Check pending payment', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: 'Check payment status', exact: true })
      .click();
    await dialog.getByText(/Payment is still pending/).waitFor();
    paymentStatus = 'credited';
    await dialog
      .getByRole('button', { name: 'Check payment status', exact: true })
      .click();
    await dialog
      .getByText(/Payment confirmed. Your wallet has been credited/)
      .waitFor();
    assert.equal(
      await page.evaluate(() =>
        sessionStorage.getItem('auction-ng-pending-payment'),
      ),
      null,
    );
    await page.keyboard.press('Escape');
    await amount.fill('12345');
    await amount.pressSequentially('abc!@.-+ e');
    assert.equal(await amount.inputValue(), '12345');
    await amount.fill('999abc');
    assert.equal(await amount.inputValue(), '12345');
    await amount.fill('');
    assert.equal(await amount.inputValue(), '');
    await amount.fill('10000');
    assert.equal(await amount.getAttribute('inputmode'), 'numeric');
    await page
      .getByRole('button', { name: 'Show fee and wallet credit', exact: true })
      .click();
    await page.getByText('Your wallet receives', { exact: true }).waitFor();
    assert.equal(quotedAmount, 1000000);
    holdRefresh = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await held;
    assert.equal(await amount.inputValue(), '10000');
    assert.equal(
      await page.getByText(/Personal account transfer/).isVisible(),
      true,
    );
    assert.equal(
      await page
        .getByRole('heading', { name: 'Add funds', exact: true })
        .isVisible(),
      true,
    );
    balance = 999900;
    holdRefresh = false;
    releaseRefresh();
    await page
      .getByRole('main')
      .getByText('₦9,999', { exact: true })
      .first()
      .waitFor();
    assert.equal(await amount.inputValue(), '10000');
    failRefresh = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByText(/Your balance could not be refreshed/).waitFor();
    const retry = page
      .getByRole('alert')
      .filter({ hasText: 'Your balance could not be refreshed' })
      .getByRole('button', { name: 'Retry', exact: true });
    await retry.hover();
    await page.waitForTimeout(180);
    assert.equal(
      await retry.evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(21, 26, 48)',
    );
    assert.equal(
      await page
        .getByRole('alert')
        .filter({ hasText: 'Your balance could not be refreshed' })
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(200, 52, 28)',
    );
    await page
      .getByRole('alert')
      .filter({ hasText: 'Your balance could not be refreshed' })
      .screenshot({ path: dir + '/refresh-error-' + width + '.png' });
    assert.equal(await amount.isVisible(), true);
    failRefresh = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page
      .getByText(/Your balance could not be refreshed/)
      .waitFor({ state: 'detached' });
    if (width === 360) {
      balance = 888800;
      await page
        .getByRole('main')
        .getByText('₦8,888', { exact: true })
        .first()
        .waitFor({ timeout: 22000 });
      assert.equal(await amount.inputValue(), '10000');
    }
    if (width === 1280) {
      const before = refreshCalls;
      expiredReads = true;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect.poll(() => refreshCalls).toBe(before + 1);
      await expect
        .poll(() => walletTokens.get(page))
        .toBe('Bearer ' + issuedToken);
      assert.equal(
        refreshCalls,
        before + 1,
        'Expired concurrent wallet reads share one renewal',
      );
      assert.equal(await amount.inputValue(), '10000');
      rotateNext = true;
      const other = await context.newPage();
      await other.goto('http://localhost:3300/wallet');
      await other
        .getByRole('heading', { name: 'Add funds', exact: true })
        .waitFor();
      await other
        .getByRole('table', { name: 'Funding history', exact: true })
        .waitFor();
      await expect
        .poll(() => walletTokens.get(page))
        .toBe('Bearer ' + issuedToken);
      assert.equal(
        refreshCalls,
        before + 2,
        'The second tab does not force an extra renewal in the first tab',
      );
      const after = refreshCalls;
      walletTokens.delete(page);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect
        .poll(() => walletTokens.get(page))
        .toBe('Bearer ' + issuedToken);
      assert.equal(
        refreshCalls,
        after,
        'Same-device tabs adopt the renewed token without another rotation',
      );
      await other.close();
    }
    failFunding = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByText(/Funding history could not be refreshed/).waitFor();
    assert.equal(
      await page.getByText(/Your balance could not be refreshed/).count(),
      0,
    );
    failFunding = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page
      .getByText(/Funding history could not be refreshed/)
      .waitFor({ state: 'detached' });
    await amount.blur();
    if (width === 1280) {
      balance = 999999999999;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page
        .locator('.agn-portal-balance strong')
        .getByText(/9,999,999,999/)
        .waitFor();
      const fits = await page
        .locator('.agn-fitted-balance')
        .evaluateAll((nodes) =>
          nodes.every((node) => {
            const text = node.firstElementChild.getBoundingClientRect();
            const card = node
              .closest('.agn-portal-balance, .agn-portal-wallet-summary')
              .getBoundingClientRect();
            return (
              text.width <= node.clientWidth + 1 &&
              text.right <= card.right - 15
            );
          }),
        );
      assert.equal(
        fits,
        true,
        'Large balances must fit inside their cards on one line',
      );
      await page
        .locator('.agn-portal-balance')
        .screenshot({ path: dir + '/large-balance-1280.png' });
      balance = 999900;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page
        .getByRole('main')
        .getByText('\u20a69,999', { exact: true })
        .first()
        .waitFor();
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: dir + '/wallet-' + width + '.png',
      fullPage: true,
    });
    await page
      .getByRole('tab', { name: 'Wallet activity', exact: true })
      .click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(180);
    await page.screenshot({
      path: dir + '/activity-' + width + '.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Check pending payment', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .screenshot({ path: dir + '/pending-' + width + '.png' });
    assert.deepEqual(errors, []);
    assert.equal(
      confirmCalls,
      2,
      'Only the stored pending reference is checked',
    );
    assert.equal(
      acceptedInput,
      undefined,
      'This layout review never starts a payment',
    );
    review.push({
      width,
      dropdownFirstOpen: true,
      historyTabs: true,
      pendingDialog: true,
      silentRefresh: true,
      independentErrors: true,
      noPageOverflow: true,
    });
    await context.close();
  }
  writeFileSync(dir + '/review.json', JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify(review));
} finally {
  await browser.close();
}
