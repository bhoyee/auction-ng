import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
const url = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
async function fixture(page: Page, pickup = true, pickupApp = false) {
  const id = randomUUID(),
    locationId = randomUUID(),
    now = new Date().toISOString();
  const visit = {
    id: randomUUID(),
    buyerName: 'Ada Okafor',
    locationId,
    location: 'Ikeja collection centre',
    status: 'waiting',
    createdAt: now,
    finishedAt: null,
  };
  let reject = false,
    scans = 0,
    registered = false;
  await page.route('http://localhost:4000/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/staff/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id,
          name: 'Ada Okafor',
          role: 'admin',
          status: 'active',
          email: 'ada@example.test',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: false,
        },
      };
    else if (path === '/staff/me')
      body = {
        name: 'Ada Okafor',
        roleName: 'Admin',
        permissions: ['dashboard.view', ...(pickup ? ['pickup.manage'] : [])],
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
    else if (path === '/staff/overview')
      body = {
        serverTime: now,
        metrics: {
          live: 4,
          scheduled: 2,
          drafts: 1,
          pickup: 3,
          support: 1,
          paidSalesKobo: 15000000,
          refundsKobo: 0,
          paidOrders: 3,
        },
        sales: [],
        lots: [],
      };
    else if (path === '/pickup/visits/scan') {
      scans++;
      if (reject) {
        await route.fulfill({ status: 400, body: '{}' });
        return;
      }
      registered = true;
      body = visit;
    } else if (path === '/pickup/visits')
      body = { items: registered ? [visit] : [], nextCursor: null };
    else if (path === '/pickup/visits/' + visit.id + '/items')
      body = {
        visit,
        items: [
          {
            id: randomUUID(),
            lotId: randomUUID(),
            itemNumber: 'LV8J7H6G',
            title: 'Demo headphones',
            invoiceNumber: 'INV8J7H6G',
          },
        ],
        nextCursor: null,
      };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(url + (pickupApp ? '/pickup/desk' : ''));
  await expect(
    page.getByRole('heading', {
      name: pickupApp
        ? 'Ready for collection.'
        : /Good (morning|afternoon|evening), /,
    }),
  ).toBeVisible();
  return {
    reject: (value: boolean) => {
      reject = value;
    },
    scans: () => scans,
  };
}
test('overview check-in dialog handles errors and opens the registered buyer checklist', async ({
  page,
}) => {
  const state = await fixture(page);
  const action = page
    .locator('.lv-staff-heading')
    .getByRole('button', { name: 'Check in a buyer', exact: true });
  await action.click();
  let dialog = page.getByRole('dialog', {
    name: 'Check in a buyer',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(action).toBeFocused();
  expect(state.scans()).toBe(0);
  await action.click();
  dialog = page.getByRole('dialog', { name: 'Check in a buyer', exact: true });
  state.reject(true);
  await dialog.getByLabel('Scan pass or enter code').fill('AB12CD34');
  await dialog.getByRole('button', { name: 'Register arrival' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Pass could not be accepted',
  );
  state.reject(false);
  await dialog.getByRole('button', { name: 'Register arrival' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Pickup desk', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Collection checklist', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Demo headphones', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Buyer checked in. Verify the items below before handover.'),
  ).toBeVisible();
  await page
    .locator('.lv-staff-heading')
    .getByRole('button', { name: 'Check in a buyer', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  expect(state.scans()).toBe(2);
});
test('check-in action stays hidden without pickup access', async ({ page }) => {
  await fixture(page, false);
  await expect(
    page.getByRole('button', { name: 'Check in a buyer', exact: true }),
  ).toHaveCount(0);
});

for (const width of [360, 768, 1280]) {
  test(
    'pickup app checks in without the full portal at ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 960 });
      const state = await fixture(page, true, true);
      await expect(page.locator('.lv-staff-sidebar')).toHaveCount(0);
      await page
        .getByRole('button', { name: 'Scan or enter buyer pass' })
        .click();
      const dialog = page.getByRole('dialog', {
        name: 'Check in a buyer',
        exact: true,
      });
      await dialog.getByLabel('Scan pass or enter code').fill('AB12CD34');
      await dialog.getByRole('button', { name: 'Register arrival' }).click();
      await expect(
        page.getByRole('heading', { name: 'Collection checklist' }),
      ).toBeVisible();
      await expect(
        page.getByText('Demo headphones', { exact: true }),
      ).toBeVisible();
      expect(state.scans()).toBe(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await mkdir('docs/design/pickup-app', { recursive: true });
      await page.screenshot({
        path: `docs/design/pickup-app/pickup-${width}.png`,
        fullPage: true,
      });
      await page.route('http://localhost:4000/auth/staff/logout', (route) =>
        route.fulfill({ status: 204 }),
      );
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Staff sign in' }),
      ).toBeVisible();
      await page.screenshot({
        path: `docs/design/pickup-app/sign-in-${width}.png`,
        fullPage: true,
      });
    },
  );
}

test('pickup app blocks staff without pickup permission', async ({ page }) => {
  await fixture(page, false, true);
  await expect(
    page.getByText(
      'This account does not have pickup access. Ask an administrator to assign it.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Scan or enter buyer pass' }),
  ).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Pickup queue' })).toHaveCount(
    0,
  );
});

test('pickup app signs out and retains its dedicated entry', async ({
  page,
}) => {
  await fixture(page, true, true);
  await page.route('http://localhost:4000/auth/staff/logout', (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Staff sign in' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/pickup\/desk$/);
  await expect(page.locator('.lv-staff-login-brand')).toHaveCount(0);
});

test('pickup app returns to its own sign-in when a session expires', async ({
  page,
}) => {
  await fixture(page, true, true);
  await page.route('http://localhost:4000/staff/me', (route) =>
    route.fulfill({ status: 401, body: '{}' }),
  );
  await page.route('http://localhost:4000/auth/staff/refresh', (route) =>
    route.fulfill({ status: 401, body: '{}' }),
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event('giddydeal:staff-unauthorized')),
  );
  await expect(
    page.getByRole('heading', { name: 'Staff sign in' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/pickup\/desk$/);
});

test('pickup app has a scoped install manifest and a network-only worker', async ({
  request,
}) => {
  const response = await request.get(url + '/pickup/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    start_url: '/pickup/desk',
    scope: '/pickup/',
    display: 'standalone',
  });
  for (const icon of manifest.icons)
    expect((await request.get(url + icon.src)).ok()).toBe(true);
  const worker = await request.get(url + '/pickup/sw.js');
  expect(worker.ok()).toBe(true);
  const source = await worker.text();
  expect(source).toContain('Reconnect to use Pickup');
  expect(source).not.toMatch(/caches\.|localStorage|indexedDB/);
});
for (const width of [360, 768, 1280])
  test('check-in popup and full-width queue at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      Object.defineProperty(window, 'BarcodeDetector', { value: undefined });
    });
    await fixture(page);
    await page
      .locator('.lv-staff-heading')
      .getByRole('button', { name: 'Check in a buyer', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Check in a buyer',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Scan with camera' }).click();
    await expect(
      dialog.getByText(/This browser does not support camera QR scanning/),
    ).toBeVisible();
    await expect(dialog.getByLabel('Scan pass or enter code')).toBeEnabled();
    const box = await dialog.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= width + 1).toBeTruthy();
    await mkdir('docs/design/check-in-dialog', { recursive: true });
    await page.screenshot({
      path: 'docs/design/check-in-dialog/popup-' + width + '.png',
      fullPage: true,
    });
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    if (width < 768)
      await page.getByRole('button', { name: 'Open staff navigation' }).click();
    await page
      .getByRole('button', { name: 'Pickup desk', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Pickup queue', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Pickup queue', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Check in a buyer', exact: true }),
    ).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'docs/design/check-in-dialog/queue-' + width + '.png',
      fullPage: true,
    });
  });
