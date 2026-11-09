import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

// Synthetic staff account only; the API is mocked.
const staffUrl = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const challengeId = randomUUID();

async function fixture(page: Page, twoFactorRequired: boolean) {
  const id = randomUUID();
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  await page.route(/http:\/\/localhost:(4000|4400)\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    if (request.method() === 'POST') calls.push({ path, body });
    const json = (status: number, value: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(value),
      });
    if (path === '/auth/staff/refresh' || path === '/auth/refresh')
      return json(401, { statusCode: 401 });
    if (path === '/auth/staff/sign-in')
      return json(200, {
        challengeId,
        expiresInSeconds: 300,
        twoFactorRequired,
      });
    if (path === '/auth/staff/sign-in/verify') {
      if (body.code !== '246810') return json(401, { statusCode: 401 });
      if (twoFactorRequired && body.authenticatorCode !== '135790')
        return json(422, { statusCode: 422, code: 'TWO_FACTOR_INVALID' });
      return json(200, {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id,
          name: 'Adaeze Okafor',
          role: 'admin',
          status: 'active',
          email: 'adaeze.okafor@lotvanta.example',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: twoFactorRequired,
        },
      });
    }
    if (path === '/staff/me')
      return json(200, {
        name: 'Adaeze Okafor',
        roleName: 'Core Admin',
        permissions: ['pickup.manage'],
      });
    if (path === '/staff/preferences')
      return json(200, { compactTables: false, reduceMotion: false });
    if (path === '/staff/notifications')
      return json(200, { items: [], nextCursor: null, unreadCount: 0 });
    if (path === '/staff/activity') return json(200, { id, message: 'Ok' });
    return json(200, { items: [], nextCursor: null });
  });
  return calls;
}

async function password(page: Page) {
  await page
    .locator('.agn-staff-sign-in')
    .getByLabel('Staff email', { exact: true })
    .fill('adaeze.okafor@lotvanta.example');
  await page
    .locator('.agn-staff-sign-in')
    .getByLabel('Password', { exact: true })
    .fill('Synthetic staff passphrase 4242');
  await page.getByRole('button', { name: 'Continue' }).click();
}

for (const width of [360, 768, 1280]) {
  test(`staff sign-in asks for the emailed code before the session at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const calls = await fixture(page, false);
    await page.goto(staffUrl);
    await password(page);
    await expect(
      page.getByRole('heading', { name: 'Check your email' }),
    ).toBeVisible();
    await expect(page.getByText('a***@lotvanta.example')).toBeVisible();
    // Each step starts with empty fields; nothing carries over from step one.
    await expect(
      page
        .locator('.agn-staff-sign-in')
        .getByLabel('Email code', { exact: true }),
    ).toHaveValue('');
    await expect(
      page
        .locator('.agn-staff-sign-in')
        .getByLabel('Authenticator code', { exact: true }),
    ).toHaveCount(0);
    await mkdir('docs/design/staff-email-code', { recursive: true });
    await page.screenshot({
      path: `docs/design/staff-email-code/code-${width}.png`,
    });
    await page
      .locator('.agn-staff-sign-in')
      .getByLabel('Email code', { exact: true })
      .fill('111111');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page.locator('.agn-staff-sign-in').getByRole('alert')).toContainText('six-digit code');
    await page
      .locator('.agn-staff-sign-in')
      .getByLabel('Email code', { exact: true })
      .fill('246810');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page.getByLabel('Open account menu')).toBeVisible();
    const verify = calls.filter((c) => c.path === '/auth/staff/sign-in/verify');
    expect(verify.at(-1)?.body).toMatchObject({ challengeId, code: '246810' });
    expect(verify.at(-1)?.body).not.toHaveProperty('authenticatorCode');
    expect(
      calls.find((c) => c.path === '/auth/staff/sign-in')?.body,
    ).not.toHaveProperty('code');
  });
}

test('staff with 2FA enter the email code and the authenticator code', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const calls = await fixture(page, true);
  await page.goto(staffUrl);
  await password(page);
  await page
    .locator('.agn-staff-sign-in')
    .getByLabel('Email code', { exact: true })
    .fill('246810');
  await page
    .locator('.agn-staff-sign-in')
    .getByLabel('Authenticator code', { exact: true })
    .fill('000000');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.locator('.agn-staff-sign-in').getByRole('alert')).toContainText('authenticator code');
  await page
    .locator('.agn-staff-sign-in')
    .getByLabel('Authenticator code', { exact: true })
    .fill('135790');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByLabel('Open account menu')).toBeVisible();
  await mkdir('docs/design/staff-email-code', { recursive: true });
  await page.screenshot({ path: 'docs/design/staff-email-code/signed-in.png' });
  expect(
    calls.filter((c) => c.path === '/auth/staff/sign-in/verify').at(-1)?.body,
  ).toMatchObject({ code: '246810', authenticatorCode: '135790' });
});
