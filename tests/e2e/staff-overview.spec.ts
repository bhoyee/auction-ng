import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { buildOverviewDemo } from '../../apps/api/src/staff-admin/overview-demo';
import {
  overviewQuerySchema,
  overviewWidgetSchema,
  overviewResponseSchema,
  type OverviewResponse,
  type OverviewWidget,
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
    aggregate?: boolean;
    negativeRevenue?: boolean;
    sourceData?: Partial<Record<OverviewWidget, OverviewResponse>>;
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
      if (options.negativeRevenue) {
        if (data.kpis[0]) data.kpis[0].value = -1800;
        if (widget === 'revenue' && data.series[0])
          data.series[0].value = -1800;
      }
      if (widget === 'live' && data.rows[0]) data.rows[0].value = live;
      if (widget === 'attention' && options.support)
        data.rows = data.rows.filter((row) => row.destination === 'support');
      body =
        options.sourceData?.[widget] ??
        (options.unavailable
          ? {
              widget,
              mode: 'unavailable',
              updatedAt: now,
              message: 'Aggregate source unavailable.',
            }
          : {
              widget,
              mode: options.aggregate ? 'aggregate' : 'demo',
              updatedAt: now,
              data,
            });
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
test('aggregate responses show actual-source freshness and signed refunds without demo branding', async ({
  page,
}) => {
  await fixture(page, { aggregate: true, negativeRevenue: true });
  await expect(page.getByRole('note')).toHaveCount(0);
  await expect(page.locator('.lv-admin-demo-chip')).toHaveCount(0);
  await expect(page.locator('.lv-admin-kpi-value').first()).toHaveText('−₦18');
  await expect(
    page.getByText('Totals refresh every 5 min', { exact: false }).first(),
  ).toBeVisible();
  await expect(page.locator('.lv-admin-source-age time').first()).toContainText(
    'WAT',
  );
});

test('actual seeded response layout at phone, tablet and desktop widths', async ({
  page,
}) => {
  let sourceData: Partial<Record<OverviewWidget, OverviewResponse>> | undefined;
  // Optional local visual review uses derived, redacted seeded responses, with a
  // synthetic staff session. CI verifies the same contract with aggregate fixtures.
  try {
    const source: unknown = JSON.parse(
      await readFile('.tools/overview-actual-responses.json', 'utf8'),
    );
    if (source && typeof source === 'object')
      sourceData = Object.fromEntries(
        Object.entries(source).map(([key, value]) => [
          overviewWidgetSchema.parse(key),
          overviewResponseSchema.parse(value),
        ]),
      );
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  await fixture(page, { aggregate: true, sourceData });
  await expect(page.locator('.lv-admin-demo-chip')).toHaveCount(0);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (sourceData) {
      await mkdir('docs/design/admin-overview-actual', { recursive: true });
      await page.screenshot({
        path: `docs/design/admin-overview-actual/overview-${width}.png`,
        fullPage: true,
      });
    }
  }
});
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
      overflowing: Array.from(document.querySelectorAll('*'))
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
test('date range and chart grain persist without a comparison control', async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole('button', { name: '7 days', exact: true }).click();
  await expect(page).toHaveURL(/range=7/);
  await expect(page.getByLabel('Comparison period')).toHaveCount(0);
  await expect(page).toHaveURL(/compare=none/);
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page).toHaveURL(/grain=week/);
  await page.reload();
  await expect(
    page.getByRole('button', { name: '7 days', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Comparison period')).toHaveCount(0);
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
  const before = f.calls.length;
  await page.clock.fastForward(5100);
  await expect(page.locator('.lv-admin-live-stats strong').first()).toHaveText(
    '3,413',
  );
  await expect(chart.getByRole('table')).toBeVisible();
  await expect.poll(() => f.calls.length).toBeGreaterThan(before);
  for (const widget of new Set(f.calls))
    expect(f.calls.filter((value) => value === widget).length).toBeGreaterThan(
      1,
    );
});

test('staff activity silently updates Overview and coalesces socket bursts', async ({
  page,
}) => {
  await page.clock.install();
  const f = await fixture(page);
  await expect(page.locator('.lv-admin-live-stats strong').first()).toHaveText(
    '3,412',
  );
  const before = f.calls.filter((value) => value === 'live').length;
  f.setLive(3500);
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++)
      window.dispatchEvent(new Event('lotvanta:staff-refresh'));
  });
  await page.clock.fastForward(300);
  await expect(page.locator('.lv-admin-live-stats strong').first()).toHaveText(
    '3,500',
  );
  expect(f.calls.filter((value) => value === 'live').length).toBe(before + 1);
  await expect(page.locator('.lv-admin-kpi')).toHaveCount(6);
});

test('temporary refresh failure keeps confirmed chart data and recovers silently', async ({
  page,
}) => {
  await page.clock.install();
  const f = await fixture(page);
  const chart = page.getByRole('region', {
    name: 'Net revenue per day',
    exact: true,
  });
  await expect(chart.locator('.recharts-line').first()).toBeVisible();
  f.setFail(true);
  await page.clock.fastForward(5100);
  await expect(chart.getByRole('alert')).toBeVisible();
  await expect(chart.locator('.recharts-line').first()).toBeVisible();
  f.setFail(false);
  await page.clock.fastForward(5100);
  await expect(chart.getByRole('alert')).toHaveCount(0);
  await expect(chart.locator('.recharts-line').first()).toBeVisible();
});

test('permission denial on refresh clears the protected widget snapshot', async ({
  page,
}) => {
  await page.clock.install();
  await fixture(page);
  const chart = page.getByRole('region', {
    name: 'Net revenue per day',
    exact: true,
  });
  await expect(chart.locator('.recharts-line').first()).toBeVisible();
  await page.route(
    'http://localhost:4000/staff/analytics/overview/revenue?**',
    (route) => route.fulfill({ status: 403, json: { message: 'Forbidden' } }),
  );
  await page.clock.fastForward(5100);
  await expect(
    chart.getByText('Your role cannot access this widget.'),
  ).toBeVisible();
  await expect(chart.locator('.recharts-line')).toHaveCount(0);
});

test('Overview pauses hidden or offline polling and refreshes when returning', async ({
  page,
}) => {
  await page.clock.install();
  const f = await fixture(page);
  await expect(page.locator('.lv-admin-live-stats strong').first()).toHaveText(
    '3,412',
  );
  await page.evaluate(() =>
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    }),
  );
  const before = f.calls.filter((value) => value === 'live').length;
  f.setLive(3600);
  await page.clock.fastForward(11000);
  expect(f.calls.filter((value) => value === 'live').length).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.lv-admin-live-stats strong').first()).toHaveText(
    '3,600',
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    window.dispatchEvent(new Event('offline'));
  });
  const offline = f.calls.filter((value) => value === 'live').length;
  await page.clock.fastForward(11000);
  expect(f.calls.filter((value) => value === 'live').length).toBe(offline);
  f.setLive(3700);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    window.dispatchEvent(new Event('online'));
  });
  await expect(page.locator('.lv-admin-live-stats strong').first()).toHaveText(
    '3,700',
  );
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
  const results = page.locator('#staff-global-results');
  await expect(results.getByRole('button')).toHaveCount(0);
  await page
    .getByRole('searchbox', { name: 'Search workspace' })
    .fill('LV8Q2X7P');
  await results
    .getByRole('button', { name: /Demo phone search result/ })
    .click();
  await expect(results).not.toBeVisible();
  await expect(page).toHaveURL(/section=inventory/);
  await expect(page).toHaveURL(/search=LV8Q2X7P/);
  await expect(
    page.getByRole('heading', { name: 'Inventory', exact: true }),
  ).toBeVisible();
});

test('global search checks permitted record types and opens the matching finance tab', async ({
  page,
}) => {
  await fixture(page);
  const kinds: string[] = [];
  await page.route('http://localhost:4000/staff/records?**', async (route) => {
    const u = new URL(route.request().url());
    kinds.push(u.searchParams.get('kind') ?? '');
    const now = new Date().toISOString();
    await route.fulfill({
      json: {
        items:
          u.searchParams.get('kind') === 'withdrawals'
            ? [
                {
                  id: 'bc222441-9957-4550-a0a9-deddbde5f997',
                  title: 'Ada withdrawal',
                  reference: 'WD-TEST',
                  status: 'pending',
                  createdAt: now,
                  updatedAt: now,
                  detail: 'Test request',
                },
              ]
            : [],
        nextCursor: null,
      },
    });
  });
  await page
    .getByRole('searchbox', { name: 'Search workspace' })
    .fill('WD-TEST');
  await page
    .locator('#staff-global-results')
    .getByRole('button', { name: /Ada withdrawal/ })
    .click();
  await expect(page).toHaveURL(/section=finance/);
  await expect(page).toHaveURL(/tab=withdrawals/);
  expect(kinds).toEqual(
    expect.arrayContaining([
      'lots',
      'buyers',
      'staff',
      'roles',
      'audit',
      'invoices',
      'withdrawals',
    ]),
  );
  await expect(
    page.getByRole('tab', { name: 'Withdrawals', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('global search excludes forbidden record requests and starts without menu results', async ({
  page,
}) => {
  const forbidden: string[] = [];
  page.on('request', (request) => {
    if (/\/staff\/(records|setup)\?/.test(request.url()))
      forbidden.push(request.url());
  });
  await fixture(page, { support: true });
  const search = page.getByRole('searchbox', { name: 'Search workspace' });
  await search.focus();
  await expect(
    page.locator('#staff-global-results').getByRole('button'),
  ).toHaveCount(0);
  await search.fill('Finance');
  await expect(
    page.getByText('No matching records. Try a name or reference.'),
  ).toBeVisible();
  expect(forbidden).toEqual([]);
  await search.press('Escape');
  await expect(page.locator('#staff-global-results')).not.toBeVisible();
});
