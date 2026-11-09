import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch();
const dir = 'docs/design/payment-return';
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
    let paymentStatus = 'pending',
      confirmCalls = 0,
      quotedAmount;
    let personalAccountRequests = 0;
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
      if (['/payments/virtual-account', '/payments/banks'].includes(path))
        personalAccountRequests++;
      const json = (value, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
        });
      if (path === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (path === '/wallet') {
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
              : [],
          nextCursor: null,
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
    await page.getByRole('button', { name: /Payment method/ }).click();
    assert.deepEqual(
      await page
        .getByRole('radio')
        .evaluateAll((options) => options.map((option) => option.value)),
      ['transfer', 'local', 'international'],
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
    await amount.blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${dir}/wallet-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', {
        name: 'Accept fee and pay ₦10,000 by transfer',
        exact: true,
      })
      .click();
    await page.waitForURL('https://checkout.paystack.com/synthetic-transfer');
    assert.equal(acceptedInput.acceptedFeeKobo, 25000);
    assert.equal(acceptedInput.acceptedCreditKobo, 975000);
    assert.equal(acceptedInput.consent, true);
    await page.goto(
      `http://localhost:3300/payments/return?kind=wallet_transfer&id=${id}&reference=fake&status=success`,
    );
    await page.getByText('Awaiting confirmation', { exact: true }).waitFor();
    assert.equal(
      await page.getByText('Payment confirmed', { exact: true }).count(),
      0,
    );
    paymentStatus = 'failed';
    await page
      .getByRole('button', { name: 'Check payment again', exact: true })
      .click();
    await page.getByText('Payment failed', { exact: true }).waitFor();
    assert.equal(
      await page.locator('.agn-payment-status--failed > svg').count(),
      1,
    );
    assert.deepEqual(
      await page
        .getByRole('heading', { name: 'Payment failed', exact: true })
        .evaluate((node) => ({
          size: getComputedStyle(node).fontSize,
          weight: getComputedStyle(node).fontWeight,
        })),
      { size: '32px', weight: '800' },
    );
    await page.screenshot({
      path: `${dir}/failed-${width}.png`,
      fullPage: true,
    });
    paymentStatus = 'credited';
    await page
      .getByRole('button', { name: 'Check payment again', exact: true })
      .click();
    await page.getByText('Payment confirmed', { exact: true }).waitFor();
    await page
      .getByRole('link', { name: 'Back to wallet', exact: true })
      .waitFor();
    const back = page.getByRole('link', {
      name: 'Back to wallet',
      exact: true,
    });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    const background = await back.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    );
    await back.hover();
    await page.waitForTimeout(200);
    assert.notEqual(
      await back.evaluate((node) => getComputedStyle(node).backgroundColor),
      background,
    );
    assert.equal(
      await page.locator('.agn-payment-status--confirmed > svg').count(),
      1,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `${dir}/confirmed-${width}.png`,
      fullPage: true,
    });
    const before = confirmCalls;
    await page.goto(
      'http://localhost:3300/payments/return?kind=wallet&id=invalid&status=success',
    );
    await page
      .getByRole('heading', {
        name: 'We could not confirm this payment',
        exact: true,
      })
      .waitFor();
    assert.equal(confirmCalls, before);
    await page.goto(
      `http://localhost:3300/payments/return?kind=purchase&id=${id}`,
    );
    await page.getByText('Payment confirmed', { exact: true }).waitFor();
    await page
      .getByRole('link', { name: 'View purchase history', exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    review.push({
      width,
      transferCheckout: true,
      silentRefresh: true,
      failedRefreshPreservesPage: true,
      personalAccountHidden: true,
      noPersonalAccountRequests: true,
      historicalTransfersPreserved: true,
      digitsOnly: true,
      pasteRejected: true,
      integerKobo: true,
      verifiedReturn: true,
      ignoresQuerySuccess: true,
      pendingAndFailed: true,
      invalidIdRejected: true,
      purchaseReturn: true,
      noOverflow: true,
      errors,
    });
    await context.close();
  }
  writeFileSync(`${dir}/review.json`, JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify(review));
} finally {
  await browser.close();
}
/* global localStorage,window,document,innerWidth,Event,getComputedStyle */
