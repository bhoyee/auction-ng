import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const url = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const id = '12565678-1234-4234-8234-123456789012';
async function fixture(page: Page, pickup = false) {
  await page.clock.install();
  let idle = Date.now() + 900_000,
    hard = Date.now() + 8 * 60 * 60_000;
  let activities = 0,
    refreshes = 0,
    activityFailure = false;
  await page.route('http://localhost:4000/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/staff/refresh') {
      refreshes++;
      body = {
        accessToken: (refreshes % 2 ? 'x' : 'y').repeat(43),
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
          twoFactorEnabled: false,
        },
      };
    } else if (
      path === '/auth/staff/session' ||
      path === '/auth/staff/activity'
    ) {
      const now = await page.evaluate(() => Date.now());
      if (path.endsWith('/activity')) {
        expect(route.request().postDataJSON()).toEqual({});
        if (activityFailure) return route.fulfill({ status: 503, body: '{}' });
        activities++;
        idle = Math.min(now + 900_000, hard);
      }
      body = {
        serverTime: new Date(now).toISOString(),
        idleExpiresAt: new Date(idle).toISOString(),
        expiresAt: new Date(hard).toISOString(),
      };
    } else if (path === '/auth/staff/logout')
      return route.fulfill({ status: 204 });
    else if (path === '/staff/me')
      body = {
        name: 'Synthetic staff',
        roleName: 'Admin',
        permissions: ['dashboard.view', 'pickup.manage'],
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
        serverTime: new Date().toISOString(),
        emailMode: 'preview',
      };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  const sessionRead = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/auth/staff/session',
  );
  await page.goto(url + (pickup ? '/pickup/desk' : '/'));
  await expect(
    page.getByLabel('Open account menu').or(
      page.getByRole('heading', {
        name: 'Ready for collection.',
        exact: true,
      }),
    ),
  ).toBeVisible();
  await sessionRead;
  await expect.poll(() => refreshes).toBeGreaterThan(0);
  return {
    activities: () => activities,
    refreshes: () => refreshes,
    fail: () => {
      activityFailure = true;
    },
    hard: (value: number) => {
      hard = value;
    },
    idle: (value: number) => {
      idle = value;
    },
  };
}
for (const width of [360, 768, 1280])
  test(`staff idle warning and automatic logout at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await fixture(page);
    await page.evaluate(() => window.dispatchEvent(new Event('pointermove')));
    await page.clock.fastForward(840_100);
    const warning = page.getByRole('dialog', { name: 'Are you still there?' });
    await expect(warning).toBeVisible();
    await expect(
      warning.getByRole('button', { name: 'Stay signed in', exact: true }),
    ).toBeVisible();
    await expect(
      warning.getByRole('button', { name: 'Stay signed in', exact: true }),
    ).toBeFocused();
    expect(state.activities()).toBe(0);
    expect(state.refreshes()).toBeGreaterThan(1);
    await mkdir('docs/design/staff-idle-timeout', { recursive: true });
    await page.screenshot({
      path: `docs/design/staff-idle-timeout/warning-${width}.png`,
      fullPage: true,
    });
    await page.clock.fastForward(61_000);
    await expect(
      page.getByRole('heading', { name: 'Staff sign in', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'You were signed out after inactivity or the maximum session time. Sign in again.',
        { exact: true },
      ),
    ).toBeVisible();
  });
test('Stay signed in renews inactivity only after confirmation and ordinary activity is throttled', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.mouse.move(100, 100);
  await expect.poll(state.activities).toBe(1);
  for (let x = 110; x < 120; x++) await page.mouse.move(x, 100);
  expect(state.activities()).toBe(1);
  await page.clock.fastForward(840_100);
  const warning = page.getByRole('dialog', { name: 'Are you still there?' });
  await expect(warning).toBeVisible();
  await warning
    .getByRole('button', { name: 'Stay signed in', exact: true })
    .click();
  await expect(warning).not.toBeVisible();
  await expect.poll(state.activities).toBe(2);
  await page.clock.fastForward(120_000);
  await expect(
    page.getByRole('heading', { name: 'Staff sign in', exact: true }),
  ).toHaveCount(0);
});
test('failed continuation cannot dismiss warning or prevent logout', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.clock.fastForward(840_100);
  state.fail();
  const warning = page.getByRole('dialog', { name: 'Are you still there?' });
  await warning
    .getByRole('button', { name: 'Stay signed in', exact: true })
    .click();
  await expect(
    warning.getByText(/We could not keep you signed in/),
  ).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(
    page.getByRole('heading', { name: 'Staff sign in', exact: true }),
  ).toBeVisible();
});
test('focused pickup app has the same timeout and handles a sleeping browser', async ({
  page,
}) => {
  await fixture(page, true);
  await page.clock.fastForward(901_000);
  await expect(
    page.getByRole('heading', { name: 'Staff sign in', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(url + '/pickup/desk');
});
test('reload respects the existing server deadline instead of starting a new fifteen minutes', async ({
  page,
}) => {
  const state = await fixture(page);
  state.idle(await page.evaluate(() => Date.now() + 30_000));
  await page.reload();
  await expect(
    page.getByRole('dialog', { name: 'Are you still there?' }),
  ).toBeVisible();
  await page.clock.fastForward(31_000);
  await expect(
    page.getByRole('heading', { name: 'Staff sign in', exact: true }),
  ).toBeVisible();
});
test('the absolute session warning cannot be extended by activity or Stay signed in', async ({
  page,
}) => {
  const state = await fixture(page);
  state.hard(await page.evaluate(() => Date.now() + 70_000));
  await page.mouse.move(120, 120);
  await expect.poll(state.activities).toBe(1);
  await page.clock.fastForward(11_000);
  const warning = page.getByRole('dialog', { name: 'Your session is ending' });
  await expect(warning).toBeVisible();
  await expect(
    warning.getByRole('button', { name: 'Stay signed in' }),
  ).toHaveCount(0);
  await page.clock.fastForward(60_000);
  await expect(
    page.getByRole('heading', { name: 'Staff sign in', exact: true }),
  ).toBeVisible();
});
