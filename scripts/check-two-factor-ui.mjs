import { chromium, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage, document, window */
const dir = 'docs/design/account-two-factor';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const reviews = [];
const recoveryCodes = Array.from({ length: 10 }, () =>
  randomBytes(12).toString('hex').toUpperCase().match(/.{4}/g).join('-'),
);
const fillOtp = async (scope, label, code = '123456') => {
  const fields = scope
    .getByRole('group', { name: label, exact: true })
    .getByRole('textbox');
  await fields.first().fill(code);
};
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
      twoFactorEnabled: false,
    };
    const token = randomBytes(32).toString('base64url');
    let signedIn = true,
      enabled = false,
      purpose = '',
      verified = false,
      finishCalls = 0,
      loginCalls = 0,
      changed = false;
    const securityId = randomUUID(),
      challengeId = randomUUID();
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname;
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
        return signedIn
          ? json({
              accessToken: token,
              expiresInSeconds: 900,
              user: { ...user, twoFactorEnabled: enabled },
            })
          : json({}, 401);
      if (path === '/auth/security')
        return json({
          enabled,
          mandatory: false,
          recoveryCodesRemaining: enabled ? 10 : 0,
        });
      if (path === '/auth/security/start') {
        purpose = body.purpose;
        assert.ok(body.password.length > 0);
        verified = false;
        return json({
          id: securityId,
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        });
      }
      if (path === '/auth/security/email') {
        assert.equal(body.id, securityId);
        verified = true;
        return json({
          verified: true,
          ...(purpose === 'enable'
            ? {
                secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                uri: 'otpauth://totp/Auction%20NG:test?secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&issuer=Auction%20NG',
              }
            : {}),
        });
      }
      if (path === '/auth/security/finish') {
        finishCalls++;
        assert.ok(verified);
        assert.equal(body.id, securityId);
        if (purpose === 'enable') {
          assert.equal(body.newCode, '123456');
          enabled = true;
          return json({ enabled, recoveryCodes });
        }
        assert.equal(body.factor.method, 'recovery');
        assert.equal(body.factor.code, recoveryCodes[0]);
        enabled = false;
        return json({ enabled });
      }
      if (path === '/auth/request-code')
        return json({
          challengeId,
          expiresInSeconds: 300,
          message: 'Check your email',
        });
      if (path === '/auth/verify-code' || path === '/auth/reset-password') {
        loginCalls++;
        assert.equal(body.code, '123456');
        if (!body.factor) return json({ code: 'TWO_FACTOR_REQUIRED' }, 422);
        assert.equal(body.factor.method, 'recovery');
        assert.equal(body.factor.code, recoveryCodes[0]);
        if (path === '/auth/reset-password')
          return route.fulfill({ status: 204, body: '' });
        signedIn = true;
        return json({ accessToken: token, expiresInSeconds: 900, user });
      }
      if (path === '/auth/change-password') {
        if (!enabled) {
          assert.equal(body.securityChallengeId, undefined);
          signedIn = false;
          return route.fulfill({ status: 204, body: '' });
        }
        assert.equal(purpose, 'change-password');
        assert.ok(verified);
        assert.equal(body.securityChallengeId, securityId);
        assert.equal(body.factor.method, 'recovery');
        changed = true;
        signedIn = false;
        return route.fulfill({ status: 204, body: '' });
      }
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
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/account');
    await expect(
      page.getByText('Add another layer of protection', { exact: true }),
    ).toBeVisible();
    await page
      .getByText('Add another layer of protection', { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${dir}/settings-${width}.png`,
      fullPage: false,
    });
    await page
      .getByRole('button', {
        name: 'Enable two-factor authentication',
        exact: true,
      })
      .click();
    let dialog = page.getByRole('dialog', {
      name: 'Protect your account',
      exact: true,
    });
    await dialog
      .getByLabel('Current password', { exact: true })
      .fill('Synthetic buyer password 42');
    await dialog.getByRole('button', { name: 'Continue securely' }).click();
    await fillOtp(dialog, 'Email security code');
    await dialog.getByRole('button', { name: 'Continue securely' }).click();
    await expect(dialog.locator('.agn-mfa-key')).toBeVisible();
    await expect(dialog.locator('.agn-mfa-qr')).toBeVisible();
    await page.screenshot({
      path: `${dir}/setup-${width}.png`,
      fullPage: false,
      mask: [dialog.locator('.agn-mfa-key'), dialog.locator('.agn-mfa-qr')],
    });
    await fillOtp(dialog, 'Code from the new authenticator');
    await dialog.getByRole('button', { name: 'Continue securely' }).click();
    dialog = page.getByRole('dialog', {
      name: 'Security settings updated',
      exact: true,
    });
    await expect(dialog.locator('.agn-mfa-codes code')).toHaveCount(10);
    await expect(
      dialog.getByRole('button', { name: 'Done', exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: `${dir}/recovery-${width}.png`,
      fullPage: false,
      mask: [dialog.locator('.agn-mfa-codes')],
    });
    await dialog.getByLabel('I have saved my recovery codes securely').check();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByText('Authenticator protection is on', { exact: true }),
    ).toBeVisible();
    const password = page.getByRole('form', {
      name: 'Change password',
      exact: true,
    });
    await password
      .getByLabel('Current password', { exact: true })
      .fill('Synthetic buyer password 42');
    await password
      .getByLabel('New password', { exact: true })
      .fill('Synthetic new password 44');
    await password
      .getByLabel('Confirm new password', { exact: true })
      .fill('Synthetic new password 44');
    await password
      .getByRole('button', { name: 'Change password', exact: true })
      .click();
    dialog = page.getByRole('dialog', {
      name: 'Verify your password change',
      exact: true,
    });
    await fillOtp(dialog, 'Email security code');
    await dialog
      .getByRole('button', { name: 'Verify email code', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: 'Use a recovery code', exact: true })
      .click();
    await dialog
      .getByLabel('Single-use recovery code', { exact: true })
      .fill(recoveryCodes[0]);
    await dialog
      .getByRole('button', { name: 'Save new password', exact: true })
      .click();
    await page.waitForURL('**/sign-in?passwordChanged=1');
    assert.ok(changed);
    await page.getByLabel('Email address', { exact: true }).fill(user.email);
    await page
      .getByLabel('Password', { exact: true })
      .fill('Synthetic new password 44');
    await page
      .getByRole('button', { name: 'Continue securely', exact: true })
      .click();
    await fillOtp(page, 'Six-digit code');
    await page
      .getByRole('button', { name: 'Verify and sign in', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Authenticator verification',
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: `${dir}/login-${width}.png`,
      fullPage: false,
    });
    await page
      .getByRole('button', { name: 'Use a recovery code', exact: true })
      .click();
    await page
      .getByLabel('Single-use recovery code', { exact: true })
      .fill(recoveryCodes[0]);
    await page
      .getByRole('button', { name: 'Verify and sign in', exact: true })
      .click();
    await page.waitForURL('**/account');
    assert.equal(loginCalls, 2);
    assert.equal(finishCalls, 1);
    await page
      .getByRole('button', {
        name: 'Disable two-factor authentication',
        exact: true,
      })
      .click();
    dialog = page.getByRole('dialog', {
      name: 'Disable authenticator protection',
      exact: true,
    });
    await dialog
      .getByLabel('Current password', { exact: true })
      .fill('Synthetic new password 44');
    await dialog
      .getByRole('button', { name: 'Continue securely', exact: true })
      .click();
    await fillOtp(dialog, 'Email security code');
    await dialog
      .getByRole('button', { name: 'Continue securely', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: 'Use a recovery code', exact: true })
      .click();
    await dialog
      .getByLabel('Single-use recovery code', { exact: true })
      .fill(recoveryCodes[0]);
    await dialog
      .getByRole('button', { name: 'Continue securely', exact: true })
      .click();
    dialog = page.getByRole('dialog', {
      name: 'Security settings updated',
      exact: true,
    });
    await expect(dialog).toContainText('has been disabled');
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    assert.equal(finishCalls, 2);
    await password
      .getByLabel('Current password', { exact: true })
      .fill('Synthetic new password 44');
    await password
      .getByLabel('New password', { exact: true })
      .fill('Synthetic password without MFA 46');
    await password
      .getByLabel('Confirm new password', { exact: true })
      .fill('Synthetic password without MFA 46');
    await password
      .getByRole('button', { name: 'Change password', exact: true })
      .click();
    await page.waitForURL('**/sign-in?passwordChanged=1');
    signedIn = false;
    enabled = true;
    await page.goto('http://localhost:3300/forgot-password');
    await page.getByLabel('Email address', { exact: true }).fill(user.email);
    await page
      .getByRole('button', { name: 'Send recovery code', exact: true })
      .click();
    await fillOtp(page, 'Six-digit code');
    await page
      .getByLabel('New password', { exact: true })
      .fill('Synthetic replacement password 45');
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill('Synthetic replacement password 45');
    await page
      .getByRole('button', { name: 'Save new password', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Authenticator verification',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Use a recovery code', exact: true })
      .click();
    await page
      .getByLabel('Single-use recovery code', { exact: true })
      .fill(recoveryCodes[0]);
    await page
      .getByRole('button', { name: 'Save new password', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Password updated', exact: true }),
    ).toBeVisible();
    assert.equal(signedIn, false);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    reviews.push({
      width,
      setup: true,
      recoverySavedBeforeClose: true,
      passwordExtraFactor: true,
      loginEmailThenAuthenticator: true,
      disableRequiresAllProofs: true,
      unenrolledPasswordChangePreserved: true,
      resetRequiresFactorWithoutSigningIn: true,
      noOverflow: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/review.json`, JSON.stringify(reviews, null, 2) + '\n');
console.log(JSON.stringify(reviews));
