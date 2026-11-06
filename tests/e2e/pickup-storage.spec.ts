import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
async function fixture(page: Page, staff: boolean) {
  await page.addInitScript(() =>
    localStorage.setItem(
      'auction-ng-cookie-notice',
      JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
    ),
  );
  const id = randomUUID(),
    caseId = randomUUID(),
    now = new Date().toISOString();
  const item = {
    id: caseId,
    invoiceLineId: randomUUID(),
    lotId: randomUUID(),
    reference: 'LV8Q7R6P',
    title: 'Samsung Galaxy S24 Ultra',
    invoiceNumber: 'LV-8Y4K2P',
    buyerId: id,
    buyerName: 'Ada Okafor',
    locationId: randomUUID(),
    location: 'Ikeja collection centre',
    status: 'overdue',
    dueAt: now,
    reviewAt: now,
    notifiedAt: now,
    collectedAt: null,
    revision: 1,
    dailyKobo: 100000,
    capKobo: 1000000,
    days: 2,
    assessedKobo: 200000,
    paidKobo: 0,
    outstandingKobo: 200000,
    waived: false,
    assignedToId: null,
    assignedToName: null,
  };
  const payment = {
    id: randomUUID(),
    caseId,
    method: 'wallet',
    status: 'pending',
    storageKobo: 200000,
    feeKobo: 0,
    amountKobo: 200000,
    expiresAt: now,
    checkoutUrl: null,
    createdAt: now,
  };
  await page.route(/http:\/\/localhost:(4000|4400)\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/refresh' || path === '/auth/staff/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id,
          name: 'Ada Okafor',
          role: staff ? 'admin' : 'buyer',
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
        permissions: [
          'dashboard.view',
          'pickup.manage',
          'storage.manage',
          'storage.adjust',
        ],
      };
    else if (path === '/staff/preferences')
      body = { compactTables: false, reduceMotion: false };
    else if (path === '/staff/notifications')
      body = { items: [], nextCursor: null, unreadCount: 0 };
    else if (path === '/staff/activity') body = { id, message: 'Recorded' };
    else if (
      path === '/pickup/storage/cases' ||
      path === '/pickup/storage/mine'
    )
      body = { items: [item], nextCursor: null, serverTime: now };
    else if (path === '/pickup/storage/centres')
      body = {
        items: [
          {
            locationId: item.locationId,
            location: item.location,
            enabled: true,
            dailyKobo: 100000,
            capKobo: 1000000,
            revision: 1,
            calendar: {
              weekdays: [1, 2, 3, 4, 5],
              closedDates: [],
              opensMinute: 540,
              closesMinute: 1020,
            },
          },
        ],
        nextCursor: null,
      };
    else if (path.endsWith('/payment')) body = null;
    else if (path === '/pickup/storage/quote') body = payment;
    else if (path === '/pickup/storage/confirm')
      body = { ...payment, status: 'paid' };
    else if (path.includes('watchlist/count')) body = { count: 0 };
    else if (path.includes('notifications/summary'))
      body = { unread: 0, awaitingPickup: 1 };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return { item };
}
for (const width of [360, 768, 1280]) {
  test(`staff pickup storage at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await fixture(page, true);
    await page.goto(
      (process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301') +
        '/?section=pickup',
    );
    await page.getByRole('button', { name: 'Deadlines & storage' }).click();
    await expect(page.getByText('Samsung Galaxy S24 Ultra')).toBeVisible();
    await expect(page.getByText('₦2,000', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('docs/design/pickup-storage', { recursive: true });
    await page.screenshot({
      path: `docs/design/pickup-storage/staff-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Centre policy', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: /Enable storage policy/ }),
    ).toBeVisible();
    await page.screenshot({
      path: `docs/design/pickup-storage/policy-${width}.png`,
      fullPage: true,
    });
  });
  test(`buyer storage checkout at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await fixture(page, false);
    await page.goto('http://localhost:3310/pickup-storage');
    await expect(page.getByText('Samsung Galaxy S24 Ultra')).toBeVisible();
    await page.getByRole('button', { name: 'Review storage payment' }).click();
    await page.getByRole('button', { name: 'Show storage total' }).click();
    await expect(
      page.getByRole('button', { name: 'Confirm payment ₦2,000' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Confirm payment ₦2,000' }).click();
    await expect(
      page.getByText('Payment confirmed. You can continue collection.'),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await mkdir('docs/design/pickup-storage', { recursive: true });
    await page.screenshot({
      path: `docs/design/pickup-storage/buyer-${width}.png`,
      fullPage: true,
    });
  });
}
test('staff adjustment errors stay visible during silent refresh', async ({
  page,
}) => {
  await fixture(page, true);
  await page.route('**/pickup/storage/adjust', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto(
    (process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301') +
      '/?section=pickup',
  );
  await page.getByRole('button', { name: 'Deadlines & storage' }).click();
  await page
    .getByRole('button', { name: 'Manage pickup', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Reason / contact note')
    .fill('Buyer contacted about collection');
  await dialog.getByRole('button', { name: 'Confirm change' }).click();
  const error = dialog.getByText(/This change was not confirmed/);
  await expect(error).toBeVisible();
  await page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/pickup/storage/cases',
  );
  await expect(error).toBeVisible();
  await dialog.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(error).not.toBeVisible();
});
test('staff readiness explains disabled policy, can be dismissed and succeeds after explicit setup', async ({
  page,
}) => {
  const { item } = await fixture(page, true);
  let enabled = false;
  await page.route(/\/pickup\/storage\/cases(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...item,
            id: null,
            revision: 0,
            status: 'not_started',
            dueAt: null,
            reviewAt: null,
            notifiedAt: null,
            days: 0,
            assessedKobo: 0,
            outstandingKobo: 0,
          },
        ],
        nextCursor: null,
        serverTime: new Date().toISOString(),
      },
    }),
  );
  await page.route(/\/pickup\/storage\/centres(?:\?|$)/, (route) => {
    if (route.request().method() === 'POST') {
      enabled = true;
      return route.fulfill({
        json: { id: item.locationId, message: 'Storage policy saved.' },
      });
    }
    return route.fulfill({
      json: {
        items: [
          {
            locationId: item.locationId,
            location: item.location,
            enabled,
            dailyKobo: 100000,
            capKobo: 1000000,
            revision: 1,
            calendar: {
              weekdays: [1, 2, 3, 4, 5],
              closedDates: [],
              opensMinute: 540,
              closesMinute: 1020,
            },
          },
        ],
        nextCursor: null,
      },
    });
  });
  await page.route('**/pickup/storage/ready', (route) =>
    enabled
      ? route.fulfill({
          json: {
            id: item.invoiceLineId,
            message:
              'Items ready. Fresh five-working-day grace period recorded.',
          },
        })
      : route.fulfill({
          status: 409,
          json: { code: 'PICKUP_STORAGE_POLICY_REQUIRED' },
        }),
  );
  await page.goto(
    (process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301') +
      '/?section=pickup',
  );
  await page.getByRole('button', { name: 'Deadlines & storage' }).click();
  await page.getByRole('button', { name: 'Mark physically ready' }).click();
  let dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Reason / contact note')
    .fill('Paid stock is physically ready');
  await dialog.getByRole('button', { name: 'Confirm change' }).click();
  await expect(
    dialog.getByText(/Enable the collection centre’s storage policy first/),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(
    dialog.getByText(/Enable the collection centre’s storage policy first/),
  ).not.toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm change' }).click();
  await dialog.getByRole('button', { name: 'Open centre policy' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Pickup centre')).toHaveValue(item.locationId);
  await expect(
    dialog.getByRole('checkbox', { name: /Enable storage policy/ }),
  ).toBeVisible();
  await dialog.getByRole('checkbox', { name: /Enable storage policy/ }).check();
  await dialog
    .getByLabel('Reason', { exact: true })
    .fill('Enable approved pickup storage calendar');
  await dialog.getByRole('button', { name: 'Save policy' }).click();
  await expect(dialog.getByText('Storage policy saved.')).toBeVisible();
  await expect(
    dialog.getByRole('checkbox', { name: /Enable storage policy/ }),
  ).toBeChecked();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Mark physically ready' }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Reason / contact note')
    .fill('Paid stock is physically ready');
  await dialog.getByRole('button', { name: 'Confirm change' }).click();
  await expect(
    page.getByText(
      'Items ready. Fresh five-working-day grace period recorded.',
    ),
  ).toBeVisible();
});
