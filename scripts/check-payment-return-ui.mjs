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
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (value, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
        });
      if (path === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (path === '/wallet')
        return json({
          id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: 975000,
          heldKobo: 0,
          totalKobo: 975000,
        });
      if (
        [
          '/wallet/history',
          '/payments/history',
          '/buyers/notifications',
        ].includes(path)
      )
        return json({ items: [], nextCursor: null });
      if (path === '/buyers/watchlist/count') return json({ count: 0 });
      if (path === '/payments/virtual-account')
        return json({ status: 'not_requested' });
      if (path === '/payments/quote') {
        quotedAmount = route.request().postDataJSON().transferKobo;
        return json({
          transferKobo: quotedAmount,
          feeKobo: 10000,
          creditKobo: quotedAmount - 10000,
          currency: 'NGN',
          feePolicy: 'paystack-dva-v1',
        });
      }
      if (path === '/payments/card/confirm') {
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
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3300/wallet');
    const amount = page.getByRole('textbox', {
      name: 'Amount to pay',
      exact: true,
    });
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
    await amount.blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${dir}/wallet-${width}.png`,
      fullPage: true,
    });
    await page.goto(
      `http://localhost:3300/payments/return?kind=wallet&id=${id}&reference=fake&status=success`,
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
    await page.getByText('Payment needs attention', { exact: true }).waitFor();
    paymentStatus = 'credited';
    await page
      .getByRole('button', { name: 'Check payment again', exact: true })
      .click();
    await page.getByText('Payment confirmed', { exact: true }).waitFor();
    await page
      .getByRole('link', { name: 'Back to balance', exact: true })
      .waitFor();
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
/* global localStorage,window,document,innerWidth */
