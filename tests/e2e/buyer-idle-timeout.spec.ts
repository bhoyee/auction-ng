import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const url = process.env.BUYER_BROWSER_URL ?? 'http://localhost:3310';
const id = '12565678-1234-4234-8234-123456789012';
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});
async function fixture(page: Page, idleWindow = 900_000) {
  const start = Date.parse('2026-11-27T10:00:00Z');
  await page.clock.install({ time: new Date(start) });
  let idle = start + idleWindow,
    activities = 0,
    refreshes = 0,
    failure = false;
  await page.route(/^http:\/\/localhost:(4000|4400)\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], nextCursor: null };
    let now = start;
    try {
      if (['/auth/refresh', '/auth/session', '/auth/activity'].includes(path))
        now = await page.evaluate(() => Date.now());
    } catch (cause) {
      if (
        cause instanceof Error &&
        /Execution context was destroyed|Target.*closed/.test(cause.message)
      ) {
        await route.abort().catch(() => {});
        return;
      }
      throw cause;
    }
    if (path === '/auth/refresh') {
      refreshes++;
      if (now >= idle) return route.fulfill({ status: 401, body: '{}' });
      body = {
        accessToken: (refreshes % 2 ? 'x' : 'y').repeat(43),
        expiresInSeconds: 900,
        user: {
          id,
          name: 'Synthetic Buyer',
          role: 'buyer',
          status: 'active',
          email: 'buyer@example.test',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          address: null,
          passwordSet: true,
          twoFactorEnabled: false,
        },
      };
    } else if (path === '/auth/session' || path === '/auth/activity') {
      if (failure) return route.fulfill({ status: 503, body: '{}' });
      if (now >= idle) return route.fulfill({ status: 401, body: '{}' });
      if (path === '/auth/activity') {
        expect(route.request().postDataJSON()).toEqual({});
        activities++;
        idle = now + 900_000;
      }
      body = {
        serverTime: new Date(now).toISOString(),
        idleExpiresAt: new Date(idle).toISOString(),
        expiresAt: new Date(start + 30 * 86400_000).toISOString(),
      };
    } else if (path === '/auth/logout') {
      idle = 0;
      return route.fulfill({ status: 204 });
    } else if (path === '/wallet')
      body = {
        id,
        userId: id,
        currency: 'NGN',
        availableKobo: 5_000_000,
        heldKobo: 0,
        totalKobo: 5_000_000,
      };
    else if (path.endsWith('/watchlist/count')) body = { count: 0 };
    else if (path.endsWith('/notifications/summary'))
      body = { unread: 0, awaitingPickup: 0 };
    else if (path.endsWith('/savings')) body = { savedKobo: 0, paidItems: 0 };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  const read = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/auth/session',
  );
  await page.goto(url + '/account');
  await expect(page.getByLabel('Full name', { exact: true })).toBeVisible();
  await read;
  // Strict Mode may start a second mount/read; finish startup requests before
  // changing the server outcome or jumping the browser clock.
  await page.waitForLoadState('networkidle');
  await page.clock.runFor(50);
  return {
    activities: () => activities,
    refreshes: () => refreshes,
    fail: () => {
      failure = true;
    },
    extend: (ms: number) => {
      idle += ms;
    },
    revoke: () => {
      idle = 0;
    },
  };
}
for (const width of [360, 768, 1280])
  test(`buyer warning and automatic redirect at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await fixture(page);
    await page.evaluate(() => window.dispatchEvent(new Event('pointermove')));
    await page.clock.fastForward(840_100);
    const warning = page.getByRole('dialog', { name: 'Are you still there?' });
    await expect(warning).toBeVisible();
    await expect(
      warning.getByRole('button', { name: 'Stay signed in', exact: true }),
    ).toBeFocused();
    expect(state.activities()).toBe(0);
    await mkdir('docs/design/buyer-idle-timeout', { recursive: true });
    await page.screenshot({
      path: `docs/design/buyer-idle-timeout/warning-${width}.png`,
    });
    await page.clock.fastForward(61_000);
    await expect(page).toHaveURL(/\/sign-in\?expired=1$/);
    await expect(page.getByLabel('Full name', { exact: true })).toHaveCount(0);
    await expect(
      page.getByText(
        'Your session expired for your security. Sign in again to continue.',
        { exact: true },
      ),
    ).toBeVisible();
  });
test('confirmed continuation extends the session; ordinary activity is throttled', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.mouse.move(100, 100);
  await expect.poll(state.activities).toBe(1);
  await page.mouse.move(101, 100);
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
  await expect(page.getByLabel('Full name', { exact: true })).toBeVisible();
});
test('failed continuation preserves the warning and still expires', async ({
  page,
}) => {
  // Start near the server deadline to isolate the outage from dev-server
  // hot-reload watchdogs affected by a fourteen-minute browser clock jump.
  const state = await fixture(page, 65_000);
  state.fail();
  await page.clock.fastForward(6_000);
  const warning = page.getByRole('dialog', { name: 'Are you still there?' });
  await expect(warning).toBeVisible();
  await expect(
    warning.getByRole('button', { name: 'Stay signed in', exact: true }),
  ).toBeFocused();
  await warning
    .getByRole('button', { name: 'Stay signed in', exact: true })
    .click();
  await expect(
    warning.getByText(/We could not keep you signed in/),
  ).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(page).toHaveURL(/\/sign-in\?expired=1$/);
});
test('cross-tab activity is accepted only after a server read confirms the new deadline', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.clock.fastForward(840_100);
  const warning = page.getByRole('dialog', { name: 'Are you still there?' });
  await expect(warning).toBeVisible();
  const notify = () =>
    page.evaluate((owner) => {
      const channel = new BroadcastChannel('giddydeal:buyer-activity');
      channel.postMessage(owner);
      channel.close();
    }, id);
  await notify();
  await expect(warning).toBeVisible();
  expect(state.activities()).toBe(0);
  state.extend(840_000);
  await notify();
  await expect(warning).not.toBeVisible();
  expect(state.activities()).toBe(0);
});
test('a definitive session rejection redirects even from the public home page', async ({
  page,
}) => {
  const state = await fixture(page);
  const checked = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/auth/session',
  );
  await page.goto(url + '/');
  await checked;
  await page.clock.runFor(50);
  state.revoke();
  await page.clock.fastForward(30_100);
  await expect(page).toHaveURL(/\/sign-in\?expired=1$/);
});
test('a late expiry signal for an older token cannot terminate the current session', async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate((ownerId) => {
    const channel = new BroadcastChannel('auction-ng-buyer-session');
    channel.postMessage({
      deviceId: localStorage.getItem('auction-ng-device'),
      ownerId,
      accessToken: 'z'.repeat(43),
      tokens: null,
    });
    channel.close();
  }, id);
  await expect(page.getByLabel('Full name', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(url + '/account');
});
test('an ended browser session is not silently restored by a still-valid refresh cookie', async ({
  page,
}) => {
  const state = await fixture(page);
  state.extend(60_000);
  state.fail();
  await page.clock.fastForward(901_000);
  await expect(page).toHaveURL(/\/sign-in\?expired=1$/);
  await expect(
    page.getByText(
      'Your session expired for your security. Sign in again to continue.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/sign-in\?expired=1$/);
});
