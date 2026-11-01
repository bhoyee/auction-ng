import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage, window, document, Event */
const dir = 'docs/design/buyer-profile';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    let user = {
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
    };
    const token = randomBytes(32).toString('base64url');
    let failSave = true,
      failPassword = true,
      saves = 0,
      passwordCalls = 0;
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', (route) => {
      const url = new URL(route.request().url());
      const json = (value, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
        });
      if (url.pathname === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (
        url.pathname === '/auth/profile' &&
        route.request().method() === 'PATCH'
      ) {
        saves++;
        const body = route.request().postDataJSON();
        assert.deepEqual(Object.keys(body).sort(), [
          'address',
          'name',
          'phone',
        ]);
        assert.equal(body.phone, '+2348031234567');
        if (failSave) return json({}, 503);
        user = { ...user, ...body };
        return json(user);
      }
      if (url.pathname === '/auth/change-password') {
        passwordCalls++;
        const body = route.request().postDataJSON();
        assert.equal(body.currentPassword, 'Synthetic current password 1');
        assert.equal(body.newPassword, 'Synthetic new password 2');
        return route.fulfill({ status: failPassword ? 400 : 204, body: '' });
      }
      if (url.pathname === '/wallet')
        return json({
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: 0,
          heldKobo: 0,
          totalKobo: 0,
        });
      if (url.pathname === '/buyers/watchlist/count') return json({ count: 0 });
      if (url.pathname === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 0 });
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/account');
    const profile = page.getByRole('form', {
      name: 'Personal details',
      exact: true,
    });
    const security = page.getByRole('form', {
      name: 'Change password',
      exact: true,
    });
    await expect(
      page.getByRole('region', { name: 'Account overview', exact: true }),
    ).toContainText('Email verified');
    await expect(
      profile.getByLabel('Email address', { exact: true }),
    ).toHaveAttribute('readonly', '');
    await expect(profile.getByLabel('Full name', { exact: true })).toHaveValue(
      'Amina Yusuf',
    );
    const identity = await page.locator('.agn-profile-identity').boundingBox();
    const person = await page.locator('.agn-profile-person').boundingBox();
    assert.ok(identity && identity.height < 200);
    assert.ok(person && person.width > 150);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `${dir}/profile-${width}.png`,
      fullPage: true,
    });
    await profile.getByLabel('Full name', { exact: true }).fill('Amina Bello');
    await profile
      .getByLabel('Phone number', { exact: true })
      .fill('08031234567');
    await profile
      .getByLabel('Full address', { exact: true })
      .fill('24 Admiralty Way, Lekki, Lagos');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(profile.getByLabel('Full name', { exact: true })).toHaveValue(
      'Amina Bello',
    );
    await context.setOffline(true);
    await expect(
      profile.getByRole('button', { name: 'Save changes', exact: true }),
    ).toBeDisabled();
    await expect(profile.getByLabel('Full name', { exact: true })).toHaveValue(
      'Amina Bello',
    );
    await context.setOffline(false);
    await expect(
      profile.getByRole('button', { name: 'Save changes', exact: true }),
    ).toBeEnabled();
    await profile
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(profile.getByRole('alert')).toContainText(
      'could not be saved',
    );
    await expect(profile.getByRole('alert')).toHaveCSS(
      'background-color',
      'rgb(200, 52, 28)',
    );
    await expect(
      profile.getByLabel('Full address', { exact: true }),
    ).toHaveValue('24 Admiralty Way, Lekki, Lagos');
    failSave = false;
    await profile
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(profile.getByRole('status')).toContainText(
      'Your profile has been saved',
    );
    await expect(profile.getByRole('status')).toHaveCSS(
      'background-color',
      'rgb(18, 122, 85)',
    );
    await expect(
      page.getByRole('region', { name: 'Account overview', exact: true }),
    ).toContainText('Amina Bello');
    assert.equal(saves, 2);
    await page.screenshot({
      path: `${dir}/saved-${width}.png`,
      fullPage: true,
    });
    await security
      .getByLabel('Current password', { exact: true })
      .fill('Synthetic current password 1');
    await security
      .getByRole('button', { name: 'Show current password', exact: true })
      .click();
    await expect(
      security.getByLabel('Current password', { exact: true }),
    ).toHaveAttribute('type', 'text');
    await security
      .getByRole('button', { name: 'Hide current password', exact: true })
      .click();
    await security
      .getByLabel('New password', { exact: true })
      .fill('Synthetic new password 2');
    await security
      .getByLabel('Confirm new password', { exact: true })
      .fill('Different synthetic password 3');
    await security
      .getByRole('button', { name: 'Change password', exact: true })
      .click();
    await expect(security.getByRole('alert')).toContainText('do not match');
    assert.equal(passwordCalls, 0);
    await security
      .getByLabel('Confirm new password', { exact: true })
      .fill('Synthetic new password 2');
    await security
      .getByRole('button', { name: 'Change password', exact: true })
      .click();
    await expect(security.getByRole('alert')).toContainText(
      'could not be changed',
    );
    failPassword = false;
    await security
      .getByRole('button', { name: 'Change password', exact: true })
      .click();
    await page.waitForURL('**/sign-in?passwordChanged=1');
    assert.equal(passwordCalls, 2);
    assert.deepEqual(errors, []);
    results.push({
      width,
      readonlyEmail: true,
      verifiedHeader: true,
      draftRetention: true,
      profileSaveRetry: true,
      clearFeedback: true,
      passwordVisibility: true,
      mismatchBlocksRequest: true,
      passwordErrorRetry: true,
      signInRedirect: true,
      noOverflow: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
