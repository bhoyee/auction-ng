import { chromium, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage, document, window */
const dir = 'docs/design/account-two-factor';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const reviews = [];
const code = 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF';
const otp = (scope, label) =>
  scope
    .getByRole('group', { name: label, exact: true })
    .getByRole('textbox')
    .first()
    .fill('123456');
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
      twoFactorEnabled: true,
    };
    const token = randomBytes(32).toString('base64url'),
      bankId = randomUUID(),
      id = randomUUID(),
      changeId = randomUUID();
    const bank = {
      id: bankId,
      status: 'verified',
      bankName: 'Synthetic bank',
      accountName: 'Amina Yusuf',
      accountLast4: '6789',
    };
    const quote = {
      amountKobo: 100000,
      feeKobo: 1000,
      levyKobo: 0,
      totalKobo: 101000,
    };
    let receipt = null,
      change = null,
      confirmations = 0,
      bankConfirmations = 0;
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
      const body =
        route.request().method() === 'GET'
          ? {}
          : route.request().postDataJSON();
      if (path === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (path === '/wallet')
        return json({
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: 3000000,
          heldKobo: 0,
          totalKobo: 3000000,
        });
      if (path === '/buyers/watchlist/count') return json({ count: 0 });
      if (path === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 0 });
      if (path === '/withdrawals/overview')
        return json({
          enabled: true,
          automaticAvailableKobo: 3000000,
          reviewAvailableKobo: 0,
          minimumKobo: 100000,
          dailyLimitKobo: 50000000,
          bank,
          bankChange: null,
        });
      if (path === '/withdrawals')
        return json({ items: receipt ? [receipt] : [], nextCursor: null });
      if (path === '/withdrawals/quote') return json(quote);
      if (path === '/withdrawals/start') {
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
        confirmations++;
        assert.equal(body.id, id);
        assert.equal(body.code, '123456');
        if (!body.factor) return json({ code: 'TWO_FACTOR_REQUIRED' }, 422);
        if (body.factor.code !== code)
          return json({ code: 'TWO_FACTOR_INVALID' }, 422);
        receipt = { ...receipt, status: 'queued' };
        return json(receipt);
      }
      if (path === '/withdrawals/' + id) return json(receipt);
      if (path === '/payments/banks')
        return json({
          items: [{ name: 'Synthetic bank', code: '058' }],
          nextCursor: null,
        });
      if (path === '/withdrawals/bank-change/start') {
        change = {
          id: changeId,
          status: 'draft',
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          emailSent: true,
          accountName: 'Amina Yusuf',
          bankName: 'Synthetic bank',
          accountLast4: '3210',
        };
        return json(change);
      }
      if (path === '/withdrawals/bank-change/confirm') {
        bankConfirmations++;
        assert.equal(body.id, changeId);
        assert.equal(body.code, '123456');
        if (!body.factor) return json({ code: 'TWO_FACTOR_REQUIRED' }, 422);
        assert.equal(body.factor.code, code);
        change = { ...change, status: 'verifying' };
        return json(change);
      }
      if (path === '/withdrawals/bank-change/' + changeId) return json(change);
      if (path === '/payments/controls')
        return json({ depositsEnabled: true, withdrawalsEnabled: true });
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/wallet');
    await page
      .getByRole('button', { name: 'Withdraw to bank', exact: true })
      .click();
    let dialog = page.getByRole('dialog', {
      name: 'Withdraw to your bank',
      exact: true,
    });
    await dialog
      .getByLabel('Amount your bank receives', { exact: true })
      .fill('1000');
    await dialog
      .getByRole('button', { name: 'Show withdrawal fees', exact: true })
      .click();
    await dialog
      .getByLabel('Confirm your password', { exact: true })
      .fill('Synthetic password 42');
    await dialog
      .getByRole('button', {
        name: 'Send withdrawal verification code',
        exact: true,
      })
      .click();
    await otp(dialog, 'Withdrawal email code');
    const confirm = dialog.getByRole('button', { name: /^Confirm withdrawal/ });
    await confirm.click();
    await expect(
      dialog.getByRole('group', { name: 'Authenticator code', exact: true }),
    ).toBeVisible();
    await expect(dialog).not.toContainText('Insufficient funds');
    await dialog
      .getByRole('button', { name: 'Use a recovery code', exact: true })
      .click();
    await dialog
      .getByLabel('Single-use recovery code', { exact: true })
      .fill('FFFF-FFFF-FFFF-FFFF-FFFF-FFFF');
    await confirm.click();
    await expect(dialog.getByRole('alert')).toContainText(
      'Check your authenticator code',
    );
    await page.screenshot({
      path: `${dir}/withdrawal-${width}.png`,
      mask: [dialog.getByLabel('Single-use recovery code', { exact: true })],
    });
    await dialog
      .getByLabel('Single-use recovery code', { exact: true })
      .fill(code);
    await confirm.click();
    await expect(dialog).toContainText('Your withdrawal is processing');
    assert.equal(confirmations, 3);
    await dialog
      .getByRole('button', { name: 'Back to wallet', exact: true })
      .click();
    // A separate new request is used to open the existing bank-change flow.
    receipt = null;
    await page.reload();
    await page
      .getByRole('button', { name: 'Withdraw to bank', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Withdraw to your bank', exact: true })
      .getByRole('button', { name: 'Change account', exact: true })
      .click();
    dialog = page.getByRole('dialog', {
      name: 'Change withdrawal account',
      exact: true,
    });
    await dialog
      .getByRole('combobox', { name: 'Bank', exact: true })
      .fill('Synthetic');
    await dialog
      .getByRole('option', { name: 'Synthetic bank', exact: true })
      .click();
    await dialog
      .getByLabel('New account number', { exact: true })
      .fill('9876543210');
    await dialog
      .getByLabel('Confirm your password', { exact: true })
      .fill('Synthetic password 42');
    await dialog.getByRole('checkbox').check();
    await dialog
      .getByRole('button', { name: 'Send account-change code', exact: true })
      .click();
    await otp(dialog, 'Bank change email code');
    await dialog
      .getByRole('button', { name: 'Confirm account change', exact: true })
      .click();
    await expect(
      dialog.getByRole('group', { name: 'Authenticator code', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `${dir}/bank-change-${width}.png` });
    await dialog
      .getByRole('button', { name: 'Use a recovery code', exact: true })
      .click();
    await dialog
      .getByLabel('Single-use recovery code', { exact: true })
      .fill(code);
    await dialog
      .getByRole('button', { name: 'Confirm account change', exact: true })
      .click();
    await expect(dialog).toContainText('Your new account is being checked');
    assert.equal(bankConfirmations, 2);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    await context.close();
    const staffContext = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    let staffSignedIn = true;
    await staffContext.route('http://localhost:4000/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/auth/staff/refresh' && !staffSignedIn)
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{}',
        });
      if (path === '/auth/staff/recovery/start')
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            challengeId: randomUUID(),
            expiresInSeconds: 300,
            message: 'Check your email',
          }),
        });
      if (path === '/auth/staff/recovery/verify') {
        const value = route.request().postDataJSON();
        assert.equal(value.code, '123456');
        assert.equal(value.recoveryCode, code);
        staffSignedIn = true;
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            accessToken: token,
            expiresInSeconds: 900,
            user: { ...user, role: 'support' },
          }),
        });
      }
      const body =
        path === '/auth/staff/refresh'
          ? {
              accessToken: token,
              expiresInSeconds: 900,
              user: { ...user, role: 'support' },
            }
          : path === '/auth/security'
            ? { enabled: true, mandatory: true, recoveryCodesRemaining: 10 }
            : { items: [], nextCursor: null };
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
    const staff = await staffContext.newPage();
    await staff.goto('http://localhost:3301');
    await staff
      .getByRole('button', { name: 'Account security', exact: true })
      .click();
    const settings = staff.getByRole('dialog', {
      name: 'Account security',
      exact: true,
    });
    await expect(settings).toContainText('Required for every staff');
    await expect(
      settings.getByRole('button', {
        name: 'Disable two-factor authentication',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      settings.getByRole('button', {
        name: 'Change authenticator',
        exact: true,
      }),
    ).toBeVisible();
    await staff.screenshot({ path: `${dir}/staff-${width}.png` });
    await settings
      .getByRole('button', { name: 'Change authenticator', exact: true })
      .click();
    const nested = staff.getByRole('dialog', {
      name: 'Protect your account',
      exact: true,
    });
    await nested
      .getByRole('button', { name: 'Close dialog', exact: true })
      .focus();
    await staff.keyboard.press('Shift+Tab');
    await expect(
      nested.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeFocused();
    await staff.keyboard.press('Tab');
    await expect(
      nested.getByRole('button', { name: 'Close dialog', exact: true }),
    ).toBeFocused();
    staffSignedIn = false;
    await staff.reload();
    await staff
      .getByRole('button', {
        name: 'Lost access to your authenticator?',
        exact: true,
      })
      .click();
    const recovery = staff.getByRole('dialog', {
      name: 'Use a staff recovery code',
      exact: true,
    });
    await recovery
      .getByLabel('Staff email', { exact: true })
      .fill('staff@example.test');
    await recovery
      .getByLabel('Password', { exact: true })
      .fill('Synthetic staff password 42');
    await recovery
      .getByRole('button', { name: 'Send security code', exact: true })
      .click();
    await expect(
      recovery.getByLabel('Single-use recovery code', { exact: true }),
    ).toBeVisible();
    await staff.screenshot({ path: `${dir}/staff-recovery-${width}.png` });
    await otp(recovery, 'Email security code');
    await recovery
      .getByLabel('Single-use recovery code', { exact: true })
      .fill(code);
    await recovery
      .getByRole('button', { name: 'Verify and sign in', exact: true })
      .click();
    await expect(
      staff.getByRole('button', { name: 'Account security', exact: true }),
    ).toBeVisible();
    await staffContext.close();
    reviews.push({
      width,
      withdrawalEmailThenFactor: true,
      invalidFactorRetry: true,
      bankChangeEmailThenFactor: true,
      staffCannotDisable: true,
      staffRecoveryRequiresEmailAndRecoveryCode: true,
      noOverflow: true,
    });
  }
} finally {
  await browser.close();
}
writeFileSync(
  `${dir}/actions-review.json`,
  JSON.stringify(reviews, null, 2) + '\n',
);
console.log(JSON.stringify(reviews));
