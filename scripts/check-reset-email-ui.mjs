import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch();
const dir = 'docs/design/reset-email-validation';
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
    let mode = 'missing',
      requests = 0;
    await context.route('http://localhost:4000/auth/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/refresh'))
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{}',
        });
      requests++;
      if (mode === 'network') return route.abort('internetdisconnected');
      const status =
        mode === 'active'
          ? 200
          : mode === 'delivery'
            ? 503
            : mode === 'rate'
              ? 429
              : 400;
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          status === 200
            ? {
                challengeId: randomUUID(),
                expiresInSeconds: 300,
                message: 'Recovery code dispatched',
              }
            : { message: 'Recovery request rejected' },
        ),
      });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/forgot-password');
    const banner = page.locator('.agn-form-error:visible');
    const email = page.getByLabel('Email address', { exact: true });
    const submit = () =>
      page
        .getByRole('button', { name: 'Send recovery code', exact: true })
        .click();
    const stays = async () => {
      assert.equal(
        await page.getByLabel('Six-digit code', { exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByLabel('New password', { exact: true }).count(),
        0,
      );
      assert.equal(await email.isVisible(), true);
    };
    await email.fill('missing@example.test');
    await submit();
    await banner.filter({ hasText: 'No active account was found' }).waitFor();
    await stays();
    assert.equal(await email.inputValue(), 'missing@example.test');
    await page.screenshot({
      path: dir + '/unknown-' + width + '.png',
      fullPage: true,
    });
    const before = requests;
    await email.fill('invalid-email');
    await submit();
    await banner.filter({ hasText: 'Enter a valid email address.' }).waitFor();
    await stays();
    assert.equal(requests, before);
    mode = 'inactive';
    await email.fill('inactive@example.test');
    await submit();
    await banner.filter({ hasText: 'No active account was found' }).waitFor();
    await stays();
    for (const failure of ['delivery', 'network']) {
      mode = failure;
      await email.fill('active@example.test');
      await submit();
      await banner
        .filter({ hasText: 'We could not request a code.' })
        .waitFor();
      await stays();
    }
    mode = 'rate';
    await submit();
    await banner.filter({ hasText: 'Too many attempts.' }).waitFor();
    await stays();
    mode = 'active';
    await submit();
    await page.getByLabel('Six-digit code', { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('New password', { exact: true }).isVisible(),
      true,
    );
    assert.equal(
      await page.getByLabel('Confirm password', { exact: true }).isVisible(),
      true,
    );
    assert.equal(await banner.count(), 0);
    assert.equal(await page.locator('.agn-otp-digits input').count(), 6);
    await page.screenshot({
      path: dir + '/accepted-' + width + '.png',
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    review.push({
      width,
      unknownEmailBlocked: true,
      invalidSyntaxBlocked: true,
      inactiveBlocked: true,
      deliveryFailureBlocked: true,
      networkFailureBlocked: true,
      rateLimitBlocked: true,
      acceptedOnlyAdvances: true,
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
/* global localStorage,document,innerWidth */
