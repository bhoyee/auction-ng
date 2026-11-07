import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { buildOverviewDemo } from '../../apps/api/src/staff-admin/overview-demo';
import {
  overviewQuerySchema,
  overviewWidgetSchema,
} from '../../packages/shared/src/admin-overview-schemas';
const url = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const permissions = [
  'dashboard.view',
  'inventory.read',
  'inventory.write',
  'auctions.manage',
  'bids.read',
  'pickup.manage',
  'finance.read',
  'support.manage',
  'audit.read',
  'buyers.read',
  'buyers.manage',
  'staff.manage',
  'fees.manage',
  'records.archive',
];
async function fixture(
  page: Page,
  options: {
    empty?: boolean;
    unavailable?: boolean;
    support?: boolean;
    failRevenue?: boolean;
  } = {},
) {
  let fail = options.failRevenue ?? false;
  let live = 3412;
  const calls: string[] = [];
  await page.route('http://localhost:4000/**', async (route) => {
    const u = new URL(route.request().url()),
      path = u.pathname,
      now = new Date().toISOString();
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/staff/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id: 'bc222441-9957-4550-a0a9-deddbde5f997',
          name: 'Ada Okafor',
          role: options.support ? 'support' : 'admin',
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
        roleName: options.support ? 'Support' : 'Admin',
        permissions: options.support
          ? ['dashboard.view', 'support.manage']
          : permissions,
      };
    else if (path === '/staff/preferences')
      body = { compactTables: false, reduceMotion: false };
    else if (path === '/staff/activity')
      body = {
        id: 'bc222441-9957-4550-a0a9-deddbde5f997',
        message: 'Recorded',
      };
    else if (path === '/staff/notifications')
      body = {
        items: [],
        nextCursor: null,
        unreadCount: 0,
        serverTime: now,
        emailMode: 'preview',
      };
    else if (
      path === '/staff/records' &&
      u.searchParams.get('kind') === 'lots' &&
      u.searchParams.get('search') === 'LV8Q2X7P'
    )
      body = {
        items: [
          {
            id: 'bc222441-9957-4550-a0a9-deddbde5f997',
            title: 'Demo phone search result',
            reference: 'LV8Q2X7P',
            status: 'open',
            createdAt: now,
            updatedAt: now,
            detail: 'Synthetic search fixture',
          },
        ],
        nextCursor: null,
      };
    else if (path.startsWith('/staff/analytics/overview/')) {
      const widget = overviewWidgetSchema.parse(path.split('/').at(-1));
      calls.push(widget);
      if (widget === 'revenue' && fail) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Temporary widget failure' }),
        });
        return;
      }
      const data = options.empty
        ? { rows: [], series: [], kpis: [] }
        : buildOverviewDemo(
            widget,
            overviewQuerySchema.parse(Object.fromEntries(u.searchParams)),
          );
      if (widget === 'live' && data.rows[0]) data.rows[0].value = live;
      if (widget === 'attention' && options.support)
        data.rows = data.rows.filter((row) => row.destination === 'support');
      body = options.unavailable
        ? {
            widget,
            mode: 'unavailable',
            updatedAt: now,
            message: 'Aggregate source unavailable.',
          }
        : { widget, mode: 'demo', updatedAt: now, data };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(url + '/?section=overview');
  await expect(
    page.getByRole('heading', {
      name: /Good (morning|afternoon|evening), Ada/,
    }),
  ).toBeVisible();
  return {
    calls,
    setFail: (value: boolean) => {
      fail = value;
    },
    setLive: (value: number) => {
      live = value;
    },
  };
}
for (const width of [360, 768, 1280, 1440, 1920])
  test('approved Overview layout at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: width >= 1280 ? 2500 : 1100 });
    await fixture(page);
    await expect(page.locator('.lv-admin-kpi')).toHaveCount(6);
    for (const title of [
      'Net revenue per day',
      'Live right now',
      'GMV by category',
      'From listing to collection',
      'Needs attention',
      'Top lots this period',
      'Recent activity',
      'Unsold stock by age',
      'Net revenue and expenses by month',
    ])
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
    await expect(page.getByRole('note')).toContainText(
      'Demo analytics preview',
    );
    await expect(
      page.locator('.lv-admin-chart .recharts-line').first(),
    ).toBeVisible();
    const geometry = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= innerWidth,
      overflowing: [...document.querySelectorAll('*')]
        .filter(
          (element) => element.getBoundingClientRect().right > innerWidth + 1,
        )
        .slice(0, 12)
        .map((element) => element.tagName + '.' + element.className),
    }));
    expect(geometry.fits, JSON.stringify(geometry)).toBe(true);
    expect(
      await page
        .locator('.lv-admin-kpi-value')
        .first()
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await expect(
      page.getByRole('button', { name: 'Check in a buyer', exact: true }),
    ).toBeVisible();
    await mkdir('docs/design/admin-overview-redesign', { recursive: true });
    await page.screenshot({
      path: 'docs/design/admin-overview-redesign/overview-' + width + '.png',
      fullPage: true,
    });
    const chart = page.getByRole('region', {
      name: 'Net revenue per day',
      exact: true,
    });
    await chart.getByLabel('Net revenue per day options').click();
    await chart
      .getByRole('button', { name: 'View as table', exact: true })
      .click();
    await expect(chart.getByRole('table')).toBeVisible();
    await chart.getByLabel('Net revenue per day options').click();
    const download = page.waitForEvent('download');
    await chart
      .getByRole('button', { name: 'Export CSV', exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe(
      'lotvanta-demo-net-revenue.csv',
    );
  });
test('date range, comparison and chart grain persist in URL and drive requests', async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole('button', { name: '7 days', exact: true }).click();
  await expect(page).toHaveURL(/range=7/);
  await page.getByLabel('Comparison period').selectOption('none');
  await expect(page).toHaveURL(/compare=none/);
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page).toHaveURL(/grain=week/);
  await page.reload();
  await expect(
    page.getByRole('button', { name: '7 days', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Comparison period')).toHaveValue('none');
});
test('one failed widget retries independently while all other widgets remain loaded', async ({
  page,
}) => {
  const f = await fixture(page, { failRevenue: true });
  const chart = page.getByRole('region', {
    name: 'Net revenue per day',
    exact: true,
  });
  await expect(chart.getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'GMV by category', exact: true }),
  ).toBeVisible();
  const before = f.calls.filter((v) => v === 'categories').length;
  f.setFail(false);
  await chart.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(chart.locator('.recharts-line').first()).toBeVisible();
  expect(f.calls.filter((v) => v === 'categories').length).toBe(before);
});
test('silent refresh retains the selected chart table', async ({ page }) => {
  await page.clock.install();
  const f = await fixture(page);
  const chart = page.getByRole('region', {
    name: 'Net revenue per day',
    exact: true,
  });
  await chart.getByLabel('Net revenue per day options').click();
  await chart
    .getByRole('button', { name: 'View as table', exact: true })
    .click();
  f.setLive(3413);
  await page.clock.fastForward(31000);
  await expect(page.locator('.lv-admin-live-stats strong').first()).toHaveText(
    '3,413',
  );
  await expect(chart.getByRole('table')).toBeVisible();
});
test('real mode never shows synthetic figures when aggregate sources are unavailable', async ({
  page,
}) => {
  await fixture(page, { unavailable: true });
  await expect(page.getByRole('note')).toHaveCount(0);
  await expect(page.getByText('Data not available yet').first()).toBeVisible();
  await expect(page.locator('.lv-admin-kpi-value')).toHaveCount(0);
});
test('empty widgets have empty states and support only sees permitted queues', async ({
  page,
}) => {
  await fixture(page, { empty: true });
  await expect(
    page
      .getByRole('region', { name: 'Net revenue per day', exact: true })
      .getByText('No sales in this range'),
  ).toBeVisible();
  await expect(
    page.getByText('All clear. No requests need attention.'),
  ).toBeVisible();
  await expect(
    page.getByText('No live activity in this snapshot.'),
  ).toBeVisible();
  await expect(
    page.getByText('No listing cohort in this range.'),
  ).toBeVisible();
});
test('support never requests or renders financial widgets', async ({
  page,
}) => {
  const f = await fixture(page, { support: true });
  await expect(
    page.getByRole('heading', { name: 'Needs attention', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Net revenue per day', exact: true }),
  ).toHaveCount(0);
  expect(f.calls.every((v) => v === 'attention')).toBe(true);
});

test('KPI cards open a metric report for the selected range', async ({
  page,
}) => {
  await fixture(page);
  await page.locator('.lv-admin-kpi-value').first().click();
  const report = page.getByRole('dialog', {
    name: 'Net revenue report',
    exact: true,
  });
  await expect(report).toBeVisible();
  await expect(
    report.getByText('Demo analytics', { exact: false }),
  ).toBeVisible();
  await expect(report.getByRole('table')).toBeVisible();
  await report
    .getByRole('button', { name: 'Close dialog', exact: true })
    .click();
  await expect(report).not.toBeVisible();
});

test('Overview command search opens the permitted filtered record list', async ({
  page,
}) => {
  await fixture(page);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', {
    name: 'Go to a section',
    exact: true,
  });
  await dialog.getByRole('searchbox').fill('LV8Q2X7P');
  await dialog
    .getByRole('button', { name: /Demo phone search result/ })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/section=inventory/);
  await expect(page).toHaveURL(/search=LV8Q2X7P/);
  await expect(
    page.getByRole('heading', { name: 'Inventory', exact: true }),
  ).toBeVisible();
});
