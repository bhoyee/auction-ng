import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
/* global localStorage,window,Event,document,innerWidth */
const pickerOnly = process.argv.includes('--bank-picker');
const dir = pickerOnly
  ? 'docs/design/wallet-bank-picker'
  : 'docs/design/wallet-withdrawals';
mkdirSync(dir, { recursive: true });
const results = [];
const browser = await chromium.launch();
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
    const token = randomBytes(32).toString('base64url'),
      bankId = randomUUID(),
      id = randomUUID();
    let bank = null,
      receipt = null,
      badCode = true,
      notice = false;
    let bankRefresh = false,
      bankPages = 0,
      bankPageUnavailable = pickerOnly,
      verificationUnavailable = pickerOnly;
    const quote = {
      amountKobo: 100000,
      feeKobo: 1000,
      levyKobo: 0,
      totalKobo: 101000,
    };
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
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo:
            receipt && receipt.status !== 'draft' ? 2899000 : 3000000,
          heldKobo:
            receipt && ['queued', 'pending'].includes(receipt.status)
              ? 101000
              : 0,
          totalKobo: receipt?.status === 'success' ? 2899000 : 3000000,
        });
      if (path === '/buyers/watchlist/count') return json({ count: 0 });
      if (path === '/buyers/notifications/summary')
        return json({ unread: notice ? 1 : 0, awaitingPickup: 0 });
      if (path === '/buyers/notifications')
        return json({
          items: notice
            ? [
                {
                  id,
                  title: 'Your withdrawal was sent',
                  href: '/wallet',
                  createdAt: new Date().toISOString(),
                  readAt: null,
                },
              ]
            : [],
          nextCursor: null,
        });
      if (path === '/payments/banks') {
        bankPages++;
        const next = new URL(route.request().url()).searchParams.get('cursor');
        if (next && bankPageUnavailable) {
          bankPageUnavailable = false;
          return json({}, 503);
        }
        return json({
          items: next
            ? [
                { name: 'Synthetic bank', code: '058' },
                ...(bankRefresh
                  ? [{ name: 'Newly listed bank', code: '044' }]
                  : []),
              ]
            : [{ name: 'Example bank', code: '000' }],
          nextCursor: next ? null : 'bank-page-two',
        });
      }
      if (['/payments/history', '/wallet/history'].includes(path))
        return json({ items: [], nextCursor: null });
      if (path === '/withdrawals/overview')
        return json({
          enabled: true,
          automaticAvailableKobo: 3000000,
          reviewAvailableKobo: 0,
          minimumKobo: 100000,
          dailyLimitKobo: 50000000,
          bank,
        });
      if (path === '/withdrawals')
        return json({ items: receipt ? [receipt] : [], nextCursor: null });
      if (path === '/withdrawals/bank') {
        const body = route.request().postDataJSON();
        assert.equal(body.consent, true);
        assert.equal(body.bvn.length, 11);
        assert.equal(body.bankCode, '058');
        if (verificationUnavailable) {
          verificationUnavailable = false;
          return json({}, 503);
        }
        bank = {
          id: bankId,
          status: 'pending',
          bankName: 'Synthetic bank',
          accountName: 'Amina Yusuf',
          accountLast4: '6789',
        };
        return json(bank);
      }
      if (path === '/withdrawals/quote') {
        assert.equal(route.request().postDataJSON().amountKobo, 100000);
        return json(quote);
      }
      if (path === '/withdrawals/start') {
        const body = route.request().postDataJSON();
        assert.equal(body.bankId, bankId);
        assert.equal(body.acceptedTotalKobo, 101000);
        assert.match(body.idempotencyKey, /^[a-f0-9-]{36}$/);
        receipt = {
          ...quote,
          id,
          status: 'draft',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          reviewRequired: false,
          settledFeeKobo: null,
          returnedKobo: null,
        };
        return json(receipt);
      }
      if (path === '/withdrawals/confirm') {
        assert.equal(route.request().postDataJSON().id, id);
        if (badCode) return json({}, 400);
        receipt = { ...receipt, status: 'queued' };
        return json(receipt);
      }
      if (path === '/withdrawals/' + id) return json(receipt);
      return json({}, 404);
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/wallet');
    const panel = page.getByRole('region', {
      name: 'Withdrawals',
      exact: true,
    });
    await page
      .getByRole('button', { name: 'Withdraw to bank', exact: true })
      .click();
    await page.getByLabel('First name on your BVN').fill('Amina');
    await page.getByLabel('Last name on your BVN').fill('Yusuf');
    const picker = page.getByRole('combobox', { name: 'Bank', exact: true });
    if (pickerOnly) {
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: 'Banks could not be refreshed' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
    }
    await picker.fill('not-a-bank');
    await expect(
      page.getByText('No matching banks. Try another name.'),
    ).toBeVisible();
    await picker.fill('synthetic');
    await expect(
      page.getByRole('option', { name: 'Synthetic bank', exact: true }),
    ).toBeVisible();
    assert.ok(bankPages >= 2, 'Fetch all bank pages automatically');
    await expect(
      page.getByRole('button', { name: 'Load more banks' }),
    ).toHaveCount(0);
    if (pickerOnly) {
      bankRefresh = true;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await picker.fill('newly');
      await expect(
        page.getByRole('option', { name: 'Newly listed bank' }),
      ).toBeVisible();
      await picker.fill('synthetic');
      await page.screenshot({ path: `${dir}/search-${width}.png` });
    }
    await picker.press('ArrowDown');
    await picker.press('Enter');
    await expect(picker).toHaveValue('Synthetic bank');
    await page.getByLabel('Account number', { exact: true }).fill('0123456789');
    await page.getByLabel('BVN', { exact: true }).fill('22222222222');
    await page.getByRole('checkbox').check();
    await page.screenshot({ path: `${dir}/verification-${width}.png` });
    await page
      .getByRole('button', { name: 'Verify BVN and bank account', exact: true })
      .click();
    if (pickerOnly) {
      const error = page
        .getByRole('alert')
        .filter({ hasText: 'The request could not be confirmed.' });
      await expect(error).toBeVisible();
      await expect(error).toHaveClass(/agn-toast--emphasis/);
      assert.equal(
        await error.evaluate(
          (element) => window.getComputedStyle(element).backgroundColor,
        ),
        'rgb(200, 52, 28)',
      );
      await page.screenshot({ path: `${dir}/error-${width}.png` });
      await page
        .getByRole('button', { name: 'Dismiss message', exact: true })
        .click();
      await expect(error).toHaveCount(0);
      await page
        .getByRole('button', {
          name: 'Verify BVN and bank account',
          exact: true,
        })
        .click();
    }
    await page.getByText(/Your BVN and bank verification is pending/).waitFor();
    if (pickerOnly) {
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.deepEqual(errors, []);
      results.push({
        width,
        automaticPagination: true,
        search: true,
        keyboardSelection: true,
        focusRefresh: true,
        bankLoadRetry: true,
        redErrorRetry: true,
        noOverflow: true,
      });
      await context.close();
      continue;
    }
    bank = { ...bank, status: 'verified' };
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page
      .getByRole('button', { name: 'Continue to withdrawal', exact: true })
      .click();
    await page
      .getByLabel('Amount your bank receives', { exact: true })
      .fill('1000');
    await page
      .getByRole('button', { name: 'Show withdrawal fees', exact: true })
      .click();
    await expect(
      page.getByRole('dialog').getByText('₦1,010', { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('Confirm your password', { exact: true })
      .fill('Synthetic-password-384!');
    await page.screenshot({ path: `${dir}/quote-${width}.png` });
    await page
      .getByRole('button', {
        name: 'Send withdrawal verification code',
        exact: true,
      })
      .click();
    const digits = page.getByRole('dialog').locator('.agn-otp-digits input');
    await expect(digits).toHaveCount(6);
    for (let index = 0; index < 6; index++)
      await digits.nth(index).fill(String(index + 1));
    const confirm = page.getByRole('button', { name: /^Confirm withdrawal/ });
    await confirm.click();
    await page.getByRole('dialog').locator('.agn-toast--error').waitFor();
    badCode = false;
    await confirm.click();
    await page.getByText(/Your withdrawal is processing/).waitFor();
    await page.screenshot({ path: `${dir}/pending-${width}.png` });
    receipt = {
      ...receipt,
      status: 'success',
      settledFeeKobo: 1000,
      returnedKobo: 0,
    };
    notice = true;
    await page
      .getByRole('dialog')
      .getByText(/Your withdrawal was sent/)
      .waitFor({ timeout: 15000 });
    await page.screenshot({ path: `${dir}/success-${width}.png` });
    await page
      .getByRole('button', { name: 'Back to wallet', exact: true })
      .click();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByLabel('Notifications, 1 unread', { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await expect(panel).toBeVisible();
    assert.deepEqual(errors, []);
    await context.close();
    const email = await browser.newPage({ viewport: { width, height: 1000 } });
    const template = JSON.parse(
      readFileSync(
        'apps/api/src/withdrawals/withdrawal-email.generated.json',
        'utf8',
      ),
    );
    const values = {
      heading: 'Your withdrawal was sent',
      message:
        'Your withdrawal has been sent to your verified bank account. Your bank may take longer to display the credit.',
      reference: 'A7D93BC2',
      last4: '6789',
      amountLabel: 'Sent to your bank',
      amount: '&#8358;1,000',
      feeLabel: 'Fees and levy',
      fees: '&#8358;10',
      walletUrl: 'http://localhost:3300/wallet',
    };
    await email.setContent(
      template.html.replace(
        /\{\{(\w+)\}\}/g,
        (_match, key) => values[key] ?? '',
      ),
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
      verification: true,
      feeDisclosure: true,
      otpFailureRetry: true,
      pendingToSuccess: true,
      bellUpdate: true,
      noOverflow: true,
    });
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
