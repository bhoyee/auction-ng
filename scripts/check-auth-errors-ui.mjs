import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch();
const dir = 'docs/design/auth-error-banners';
mkdirSync(dir, { recursive: true });
const review = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    let mode = 'invalid';
    await context.route('http://localhost:4000/auth/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/refresh'))
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{}',
        });
      if (mode === 'network') return route.abort('internetdisconnected');
      const status = path.endsWith('/verify-code')
        ? 401
        : mode === 'rate'
          ? 429
          : mode === 'valid'
            ? 200
            : 401;
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          status === 200
            ? {
                challengeId: randomUUID(),
                expiresInSeconds: 300,
                message: 'Synthetic fixture',
              }
            : { message: 'Synthetic request failure' },
        ),
      });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install();
    const alert = page.locator('.agn-form-error[role="alert"]:visible');
    const check = async (text) => {
      await alert.filter({ hasText: text }).waitFor();
      assert.equal(await alert.count(), 1);
      assert.equal(
        await alert.evaluate((el) => {
          const form = el.closest('form');
          return (
            form?.querySelector('.agn-buyer-stack')?.firstElementChild === el
          );
        }),
        true,
      );
      const bg = await alert.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      const values = bg.match(/\d+/g).map(Number);
      assert.ok(
        values[0] > values[1] * 1.5 && values[0] > values[2] * 1.5,
        'Error banner must use the red danger surface',
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    };
    const fillLogin = async () => {
      await page
        .getByLabel('Email address', { exact: true })
        .fill('buyer@example.test');
      await page
        .getByLabel('Password', { exact: true })
        .fill('Synthetic password 2026');
    };
    const submitLogin = () =>
      page
        .getByRole('button', { name: 'Continue securely', exact: true })
        .click();
    await page.goto('http://localhost:3300/sign-in');
    await fillLogin();
    await submitLogin();
    await check('Invalid email or password.');
    await page.screenshot({
      path: dir + '/login-' + width + '.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Dismiss error', exact: true })
      .click();
    assert.equal(await alert.count(), 0);
    await submitLogin();
    await check('Invalid email or password.');
    await page.waitForTimeout(50);
    await page.clock.fastForward(10050);
    assert.equal(await alert.count(), 0, 'Error must auto-dismiss');
    await submitLogin();
    await check('Invalid email or password.');
    await alert.hover();
    await page.clock.fastForward(11000);
    assert.equal(await alert.count(), 1, 'Hover pauses dismissal');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(50);
    await page.clock.fastForward(10050);
    assert.equal(await alert.count(), 0);
    await submitLogin();
    await check('Invalid email or password.');
    await page
      .getByRole('button', { name: 'Dismiss error', exact: true })
      .focus();
    await page.mouse.move(0, 0);
    await page.clock.fastForward(11000);
    assert.equal(await alert.count(), 1, 'Keyboard focus pauses dismissal');
    await page.getByLabel('Email address', { exact: true }).focus();
    await page.waitForTimeout(50);
    await page.clock.fastForward(10050);
    assert.equal(await alert.count(), 0);
    mode = 'rate';
    await submitLogin();
    await check('Too many attempts.');
    await page.screenshot({
      path: dir + '/rate-limit-' + width + '.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Dismiss error', exact: true })
      .click();
    await page
      .getByLabel('Email address', { exact: true })
      .fill('invalid-email');
    await submitLogin();
    await check('Enter a valid email address.');
    await page
      .getByRole('button', { name: 'Dismiss error', exact: true })
      .click();
    mode = 'valid';
    await fillLogin();
    await submitLogin();
    await page.getByLabel('Six-digit code', { exact: true }).waitFor();
    await page
      .getByLabel('Six-digit code', { exact: true })
      .pressSequentially('111111');
    await page
      .getByRole('button', { name: 'Verify and sign in', exact: true })
      .click();
    await check('The code could not be verified.');
    await page.screenshot({
      path: dir + '/code-error-' + width + '.png',
      fullPage: true,
    });
    await page.goto('http://localhost:3300/sign-up');
    await page.getByLabel('Full name', { exact: true }).fill('Amina Yusuf');
    await page
      .getByLabel('Email address', { exact: true })
      .fill('buyer@example.test');
    await page
      .getByLabel('Password', { exact: true })
      .fill('Synthetic password 2026');
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill('Different password 2026');
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await check('The passwords do not match.');
    await page.screenshot({
      path: dir + '/signup-' + width + '.png',
      fullPage: true,
    });
    await page.goto('http://localhost:3300/forgot-password');
    mode = 'network';
    await page
      .getByLabel('Email address', { exact: true })
      .fill('buyer@example.test');
    await page
      .getByRole('button', { name: 'Send recovery code', exact: true })
      .click();
    await check('We could not request a code.');
    await page.screenshot({
      path: dir + '/recovery-' + width + '.png',
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    review.push({
      width,
      topOfForm: true,
      dangerRed: true,
      manualDismiss: true,
      autoDismiss: true,
      hoverPause: true,
      focusPause: true,
      invalidEmail: true,
      credentials: true,
      rateLimit: true,
      codeError: true,
      passwordMismatch: true,
      networkError: true,
      noOverflow: true,
      browserErrors: errors,
    });
    await context.close();
  }
  writeFileSync(dir + '/review.json', JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify(review));
} finally {
  await browser.close();
}
/* global document,innerWidth,getComputedStyle,localStorage */
