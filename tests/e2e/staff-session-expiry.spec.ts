import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
const url = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
async function fixture(page: Page) {
  const id = randomUUID(),
    now = new Date().toISOString();
  let booting = true,
    renewals = 0,
    refreshStatus = 200,
    meStatus = 200,
    block = false,
    held = false;
  let release: () => void = () => {};
  await page.clock.install();
  await page.route('http://localhost:4000/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    let status = 200,
      body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/staff/refresh') {
      if (!booting) renewals++;
      status = booting ? 200 : refreshStatus;
      body = {
        accessToken: (booting ? 'x' : 'y').repeat(43),
        expiresInSeconds: 120,
        user: {
          id,
          name: 'Synthetic staff',
          role: 'admin',
          status: 'active',
          email: 'staff@example.test',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: false,
        },
      };
    } else if (path === '/staff/me') {
      if (block && req.headers().authorization === 'Bearer ' + 'x'.repeat(43)) {
        held = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        status = 401;
      } else status = meStatus;
      body = {
        name: 'Synthetic staff',
        roleName: 'Admin',
        permissions: ['dashboard.view', 'pickup.manage'],
      };
    } else if (path === '/staff/overview')
      body = {
        serverTime: now,
        metrics: {
          live: 3,
          scheduled: 2,
          drafts: 1,
          pickup: 1,
          support: 0,
          paidSalesKobo: 0,
          refundsKobo: 0,
          paidOrders: 0,
        },
        sales: [],
        lots: [],
      };
    else if (path === '/staff/preferences')
      body = { compactTables: false, reduceMotion: false };
    else if (path === '/staff/activity')
      body = { id, message: 'Activity recorded.' };
    else if (path === '/staff/notifications')
      body = {
        items: [],
        nextCursor: null,
        unreadCount: 0,
        serverTime: now,
        emailMode: 'preview',
      };
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(url + '/?section=overview');
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening), / }),
  ).toBeVisible();
  booting = false;
  return {
    renewals: () => renewals,
    refreshStatus: (value: number) => {
      refreshStatus = value;
    },
    meStatus: (value: number) => {
      meStatus = value;
    },
    blockMe: () => {
      block = true;
    },
    held: () => held,
    release: () => {
      block = false;
      release();
    },
  };
}
for (const width of [360, 768, 1280])
  test(
    'expired staff session returns to sign-in and closes protected dialogs at ' +
      width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await fixture(page);
      await page
        .getByRole('button', { name: 'Check in a buyer', exact: true })
        .click();
      await expect(
        page.getByRole('dialog', { name: 'Check in a buyer', exact: true }),
      ).toBeVisible();
      state.refreshStatus(401);
      await page.clock.fastForward(61000);
      await expect(
        page.getByRole('heading', { name: 'Staff sign in', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('Your staff session expired. Sign in again.', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', {
          name: /Good (morning|afternoon|evening), /,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('dialog', { name: 'Check in a buyer', exact: true }),
      ).toHaveCount(0);
      await expect(page).toHaveURL(url + '/');
      await mkdir('docs/design/staff-session-expiry', { recursive: true });
      await page.screenshot({
        path: 'docs/design/staff-session-expiry/expired-' + width + '.png',
        fullPage: true,
      });
    },
  );
test('a protected API 401 automatically checks renewal and returns to login if rejected', async ({
  page,
}) => {
  const state = await fixture(page);
  state.refreshStatus(401);
  state.meStatus(401);
  await page.clock.fastForward(5100);
  await expect(
    page.getByRole('heading', { name: 'Staff sign in', exact: true }),
  ).toBeVisible();
  expect(state.renewals()).toBe(1);
});
test('successful token renewal keeps staff signed in and ignores late old-token errors', async ({
  page,
}) => {
  const state = await fixture(page);
  state.blockMe();
  await page.clock.fastForward(5100);
  await expect.poll(state.held).toBe(true);
  await page.clock.fastForward(56000);
  await expect.poll(state.renewals).toBe(1);
  state.release();
  await page.clock.fastForward(5100);
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening), / }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Staff sign in', exact: true }),
  ).toHaveCount(0);
  expect(state.renewals()).toBe(1);
});
test('temporary renewal failure keeps a valid session only until its hard expiry', async ({
  page,
}) => {
  const state = await fixture(page);
  state.refreshStatus(503);
  await page.clock.fastForward(61000);
  await expect(
    page.getByText(
      'Your staff session could not be renewed. Check your connection; we will retry.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening), / }),
  ).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(
    page.getByRole('heading', { name: 'Staff sign in', exact: true }),
  ).toBeVisible();
});
test('a permission denial is not treated as an expired session', async ({
  page,
}) => {
  const state = await fixture(page);
  state.meStatus(403);
  await page.clock.fastForward(5100);
  await expect(
    page.getByRole('heading', { name: 'Staff sign in', exact: true }),
  ).toHaveCount(0);
  expect(state.renewals()).toBe(0);
});
