import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const url = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
async function fixture(page: Page, empty = false) {
  const id = 'bc222441-9957-4550-a0a9-deddbde5f997';
  let live = empty ? 0 : 38;
  await page.route('http://localhost:4000/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const now = new Date().toISOString();
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
          email: 'staff@example.test',
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
          'inventory.read',
          'auctions.manage',
          'pickup.manage',
          'support.manage',
          'finance.read',
          'audit.read',
          'staff.manage',
          'buyers.read',
        ],
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
          live,
          scheduled: empty ? 0 : 24,
          drafts: empty ? 0 : 17,
          pickup: empty ? 0 : 46,
          support: empty ? 0 : 8,
          paidSalesKobo: empty ? 0 : 1842050000,
          refundsKobo: empty ? 0 : 12750000,
          paidOrders: empty ? 0 : 186,
        },
        sales: empty
          ? []
          : Array.from({ length: 14 }, (_, i) => ({
              day: `2026-11-${String(i + 1).padStart(2, '0')}`,
              amountKobo: ((i % 4) + 1) * 15000000 + i * 3500000,
              count: i + 2,
            })),
        lots: empty
          ? []
          : [
              { status: 'open', count: 38 },
              { status: 'scheduled', count: 24 },
              { status: 'draft', count: 17 },
              { status: 'closed', count: 186 },
            ],
      };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(url + '/?section=overview');
  await expect(
    page.getByRole('heading', { name: 'Live right now', exact: true }),
  ).toBeVisible();
  return {
    setLive: (value: number) => {
      live = value;
    },
  };
}

for (const width of [360, 768, 1280, 1440])
  test(`Overview layout, totals and chart at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    await expect(page.locator('.lv-overview-kpi')).toHaveCount(6);
    await expect(page.getByText('₦18,420,500', { exact: true })).toBeVisible();
    expect(
      await page
        .locator('.lv-overview-kpi > strong')
        .first()
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await expect(page.getByText('Hello, Ada.', { exact: false })).toBeVisible();
    await expect(page.locator('.recharts-line')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Check in a buyer', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('docs/design/admin-overview', { recursive: true });
    await page.screenshot({
      path: `docs/design/admin-overview/overview-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'View as table', exact: true })
      .click();
    await expect(
      page.getByRole('table', { name: 'Recorded paid sales by day, WAT' }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: '2026-11-01', exact: true }),
    ).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    expect((await download).suggestedFilename()).toBe(
      'lotvanta-paid-sales.csv',
    );
  });

test('Overview refresh retains the selected table and shows honest empty states', async ({
  page,
}) => {
  const f = await fixture(page);
  await page
    .getByRole('button', { name: 'View as table', exact: true })
    .click();
  f.setLive(39);
  await expect(page.locator('.lv-overview-live-total strong')).toHaveText(
    '39',
    { timeout: 12000 },
  );
  await expect(
    page.getByRole('table', { name: 'Recorded paid sales by day, WAT' }),
  ).toBeVisible();
});

test('Overview renders no-data states without fabricated sales', async ({
  page,
}) => {
  await fixture(page, true);
  await expect(
    page.getByText('No paid sales in this period', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('No inventory yet', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('No auctions are running right now.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Export CSV', exact: true }),
  ).toBeDisabled();
});
