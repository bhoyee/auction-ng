import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const url = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const id = '12345678-1234-4234-8234-123456789012';
async function fixture(page: Page, enabled = false) {
  let changed = false,
    changes = 0;
  await page.route('http://localhost:4000/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/staff/refresh') {
      if (changed) return route.fulfill({ status: 401, body: '{}' });
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id,
          name: 'Synthetic staff',
          role: 'admin',
          status: 'active',
          email: 'staff@example.test',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: enabled,
        },
      };
    } else if (path === '/staff/me')
      body = {
        name: 'Synthetic staff',
        roleName: 'Admin',
        permissions: ['dashboard.view'],
      };
    else if (path === '/staff/activity')
      body = { id, message: 'Activity recorded.' };
    else if (path === '/staff/preferences')
      body = { compactTables: false, reduceMotion: false };
    else if (path === '/staff/notifications')
      body = {
        items: [],
        nextCursor: null,
        unreadCount: 0,
        serverTime: new Date().toISOString(),
        emailMode: 'preview',
      };
    else if (path === '/staff/overview')
      body = {
        serverTime: new Date().toISOString(),
        metrics: {
          live: 0,
          scheduled: 0,
          drafts: 0,
          pickup: 0,
          support: 0,
          paidSalesKobo: 0,
          refundsKobo: 0,
          paidOrders: 0,
        },
        sales: [],
        lots: [],
      };
    else if (path === '/auth/security')
      body = {
        enabled,
        mandatory: false,
        recoveryCodesRemaining: enabled ? 10 : 0,
      };
    else if (path === '/auth/security/start') {
      expect(request.postDataJSON()).toMatchObject({
        purpose: 'change-password',
        password: 'Synthetic current password',
        newPassword: 'Synthetic replacement password',
      });
      body = { id, expiresAt: new Date(Date.now() + 300000).toISOString() };
    } else if (path === '/auth/security/email') {
      if (request.postDataJSON().code !== '123456')
        return route.fulfill({ status: 400, body: '{}' });
      body = { verified: true };
    } else if (path === '/auth/staff/change-password') {
      expect(request.headers().authorization).toBe('Bearer ' + 'x'.repeat(43));
      expect(request.headers()['x-auction-client']).toBe('web');
      const input = request.postDataJSON();
      expect(input).toMatchObject({
        currentPassword: 'Synthetic current password',
        newPassword: 'Synthetic replacement password',
        securityChallengeId: id,
      });
      if (enabled)
        expect(input.factor).toEqual({
          method: 'authenticator',
          code: '654321',
        });
      else expect(input.factor).toBeUndefined();
      changed = true;
      changes++;
      return route.fulfill({ status: 204 });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(url + '/?section=profile');
  await page.getByLabel('Open account menu').click();
  await page
    .getByRole('button', { name: 'Account security', exact: true })
    .click();
  const account = page.getByRole('dialog', {
    name: 'Account security',
    exact: true,
  });
  if (!enabled) {
    await expect(
      account.getByRole('button', { name: 'Enable two-factor authentication' }),
    ).toBeEnabled();
    await mkdir('docs/design/staff-password-change', { recursive: true });
    await page.screenshot({
      path: `docs/design/staff-password-change/security-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  }
  await account
    .getByRole('button', { name: 'Change password', exact: true })
    .click();
  const form = page.getByRole('dialog', {
    name: 'Change password',
    exact: true,
  });
  return { form, changes: () => changes };
}
async function fillPasswords(form: ReturnType<Page['getByRole']>) {
  await form
    .getByLabel('Current password', { exact: true })
    .fill('Synthetic current password');
  await form
    .getByLabel('New password', { exact: true })
    .fill('Synthetic replacement password');
  await form
    .getByLabel('Confirm new password', { exact: true })
    .fill('Synthetic replacement password');
}
for (const width of [360, 768, 1280])
  test(`staff password popup and verified-email success at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    const state = await fixture(page);
    await fillPasswords(state.form);
    await mkdir('docs/design/staff-password-change', { recursive: true });
    await page.screenshot({
      path: `docs/design/staff-password-change/form-${width}.png`,
      fullPage: true,
    });
    const box = await state.form.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= width + 1).toBeTruthy();
    await state.form
      .getByRole('button', { name: 'Send verification code' })
      .click();
    await state.form
      .getByLabel('Email verification code', { exact: true })
      .fill('000000');
    await state.form
      .getByRole('button', { name: 'Change password', exact: true })
      .click();
    await expect(state.form.getByRole('alert')).toContainText(
      'Verification failed',
    );
    expect(state.changes()).toBe(0);
    await state.form
      .getByLabel('Email verification code', { exact: true })
      .fill('123456');
    await state.form
      .getByRole('button', { name: 'Change password', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Staff sign in', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toContainText(
      'Your password has been changed.',
    );
    expect(state.changes()).toBe(1);
  });
test('staff password requires matching passwords and enrolled authenticator after email', async ({
  page,
}) => {
  const state = await fixture(page, true);
  await fillPasswords(state.form);
  await state.form
    .getByLabel('Confirm new password', { exact: true })
    .fill('Synthetic mismatched password');
  await state.form
    .getByRole('button', { name: 'Send verification code' })
    .click();
  await expect(state.form.getByRole('alert')).toContainText('do not match');
  await state.form
    .getByLabel('Confirm new password', { exact: true })
    .fill('Synthetic replacement password');
  await state.form
    .getByRole('button', { name: 'Send verification code' })
    .click();
  await state.form
    .getByLabel('Email verification code', { exact: true })
    .fill('123456');
  await state.form
    .getByRole('button', { name: 'Verify email', exact: true })
    .click();
  expect(state.changes()).toBe(0);
  await state.form
    .getByLabel('Authenticator code', { exact: true })
    .fill('654321');
  await state.form
    .getByRole('button', { name: 'Change password', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Staff sign in', exact: true }),
  ).toBeVisible();
  expect(state.changes()).toBe(1);
});
