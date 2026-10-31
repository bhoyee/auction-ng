import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
/* global localStorage,requestAnimationFrame */
const dir = 'docs/design/admin-wallet-controls';
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
    };
    const admin = {
      ...user,
      id: randomUUID(),
      name: 'Synthetic administrator',
      email: 'admin@example.test',
      role: 'admin',
    };
    const token = randomBytes(32).toString('base64url');
    let settings = {
        depositsEnabled: true,
        withdrawalsEnabled: true,
        revision: 0,
        updatedAt: new Date().toISOString(),
      },
      reads = 0,
      conflict = false,
      settingsUnavailable = false;
    let holdSettingsRead = false,
      releaseSettingsRead;
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (data, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(data),
        });
      if (path === '/auth/refresh' || path === '/auth/staff/refresh')
        return json({
          accessToken: token,
          expiresInSeconds: 900,
          user: path.includes('/staff/') ? admin : user,
        });
      if (path === '/admin/wallet-controls') {
        if (settingsUnavailable) return json({}, 503);
        if (route.request().method() === 'GET' && holdSettingsRead)
          await new Promise((resolve) => {
            releaseSettingsRead = resolve;
          });
        if (route.request().method() === 'POST') {
          const value = route.request().postDataJSON();
          assert.equal(value.expectedRevision, settings.revision);
          assert.ok(value.reason.length >= 5);
          assert.match(value.idempotencyKey, /^[a-f0-9-]{36}$/);
          if (conflict) {
            conflict = false;
            return json({}, 409);
          }
          settings = {
            depositsEnabled: value.depositsEnabled,
            withdrawalsEnabled: value.withdrawalsEnabled,
            revision: settings.revision + 1,
            updatedAt: new Date().toISOString(),
          };
        }
        return json(settings);
      }
      if (path === '/wallet/controls') {
        reads++;
        return json(settings);
      }
      if (path === '/wallet')
        return json({
          id: randomUUID(),
          userId: user.id,
          currency: 'NGN',
          availableKobo: 3000000,
          heldKobo: 0,
          totalKobo: 3000000,
        });
      if (path === '/withdrawals/overview')
        return json({
          enabled: settings.withdrawalsEnabled,
          automaticAvailableKobo: 3000000,
          reviewAvailableKobo: 0,
          minimumKobo: 100000,
          dailyLimitKobo: 50000000,
          bank: null,
          bankChange: null,
        });
      if (path === '/buyers/watchlist/count') return json({ count: 0 });
      if (path === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 0 });
      if (path === '/time')
        return json({ serverTime: new Date().toISOString() });
      return json({ items: [], nextCursor: null });
    });
    const errors = [],
      buyer = await context.newPage(),
      staff = await context.newPage();
    buyer.on('pageerror', (e) => errors.push(e.message));
    staff.on('pageerror', (e) => errors.push(e.message));
    await buyer.goto('http://localhost:3300/wallet');
    const fund = buyer.getByRole('textbox', {
        name: 'Amount to Fund',
        exact: true,
      }),
      withdraw = buyer.getByRole('button', {
        name: 'Withdraw to bank',
        exact: true,
      });
    await expect(fund).toBeEnabled();
    await expect(withdraw).toBeEnabled();
    await fund.fill('10000');
    await staff.goto('http://localhost:3301/');
    const panel = staff.getByRole('region', {
      name: 'Wallet controls',
      exact: true,
    });
    await expect(
      panel.getByRole('checkbox', { name: 'Allow new deposits' }),
    ).toBeChecked();
    holdSettingsRead = true;
    const delayedResponse = staff.waitForResponse(
      (response) =>
        response.url().endsWith('/admin/wallet-controls') &&
        response.request().method() === 'GET',
    );
    await panel.getByRole('button', { name: 'Reload settings' }).click();
    await expect.poll(() => typeof releaseSettingsRead).toBe('function');
    await panel.getByRole('checkbox', { name: 'Allow new deposits' }).uncheck();
    holdSettingsRead = false;
    releaseSettingsRead();
    await delayedResponse;
    await staff.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await expect(
      panel.getByRole('checkbox', { name: 'Allow new deposits' }),
    ).not.toBeChecked();
    await panel.getByRole('checkbox', { name: 'Allow new deposits' }).uncheck();
    await panel
      .getByRole('checkbox', { name: 'Allow new withdrawals' })
      .uncheck();
    await panel
      .getByRole('textbox', { name: 'Reason for change' })
      .fill('Scheduled wallet maintenance');
    await panel.getByRole('button', { name: 'Review wallet controls' }).click();
    const dialog = staff.getByRole('dialog', {
      name: 'Update wallet controls?',
      exact: true,
    });
    await expect(dialog).toContainText('Existing checkouts');
    await staff.screenshot({ path: `${dir}/confirmation-${width}.png` });
    await dialog.getByRole('button', { name: 'Save wallet controls' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(panel.getByRole('status')).toContainText(
      'Wallet controls saved',
    );
    await staff.screenshot({
      path: `${dir}/admin-${width}.png`,
      fullPage: true,
    });
    const previousReads = reads;
    await buyer.bringToFront();
    await expect(fund).toBeDisabled({ timeout: 22000 });
    await expect(withdraw).toBeDisabled({ timeout: 22000 });
    await expect(
      buyer.getByText('New deposits are temporarily paused.', { exact: false }),
    ).toBeVisible();
    await expect(
      buyer.getByRole('button', { name: 'Show fee and wallet credit' }),
    ).toBeDisabled();
    await expect(
      buyer.getByRole('button', { name: 'Check pending payment' }),
    ).toHaveCount(0);
    assert.ok(reads > previousReads);
    await expect(fund).toHaveValue('10000');
    await buyer.screenshot({
      path: `${dir}/buyer-paused-${width}.png`,
      fullPage: true,
    });
    await staff.bringToFront();
    await panel.getByRole('checkbox', { name: 'Allow new deposits' }).check();
    await panel
      .getByRole('checkbox', { name: 'Allow new withdrawals' })
      .check();
    await panel
      .getByRole('textbox', { name: 'Reason for change' })
      .fill('Resume wallet services');
    conflict = true;
    await panel.getByRole('button', { name: 'Review wallet controls' }).click();
    await dialog.getByRole('button', { name: 'Save wallet controls' }).click();
    await expect(panel.getByRole('alert')).toContainText(
      'Another administrator',
    );
    await staff.screenshot({ path: `${dir}/conflict-${width}.png` });
    await panel.getByRole('button', { name: 'Reload settings' }).click();
    await expect(
      panel.getByRole('checkbox', { name: 'Allow new deposits' }),
    ).not.toBeChecked();
    await panel.getByRole('checkbox', { name: 'Allow new deposits' }).check();
    await panel
      .getByRole('checkbox', { name: 'Allow new withdrawals' })
      .check();
    await panel
      .getByRole('textbox', { name: 'Reason for change' })
      .fill('Resume wallet services');
    await panel.getByRole('button', { name: 'Review wallet controls' }).click();
    await dialog.getByRole('button', { name: 'Save wallet controls' }).click();
    await expect(dialog).not.toBeVisible();
    await buyer.bringToFront();
    await expect(fund).toBeEnabled({ timeout: 22000 });
    await expect(withdraw).toBeEnabled({ timeout: 22000 });
    await buyer.screenshot({
      path: `${dir}/buyer-resumed-${width}.png`,
      fullPage: true,
    });
    await staff.bringToFront();
    settingsUnavailable = true;
    await panel.getByRole('button', { name: 'Reload settings' }).click();
    await expect(panel.getByRole('alert')).toContainText('could not be loaded');
    await expect(
      panel.getByRole('checkbox', { name: 'Allow new deposits' }),
    ).toBeDisabled();
    assert.deepEqual(errors, []);
    results.push({
      width,
      adminControls: true,
      confirmation: true,
      buyerPauseAndResume: true,
      silentRefresh: true,
      conflictProtection: true,
      settingsFailureClosed: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
