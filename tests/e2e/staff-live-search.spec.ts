import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const url = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const permissions = [
  'dashboard.view',
  'inventory.read',
  'inventory.write',
  'auctions.manage',
  'pickup.manage',
  'buyers.read',
  'buyers.manage',
  'support.manage',
  'finance.read',
  'refunds.manage',
  'withdrawals.manage',
  'wallet.manage',
  'fees.manage',
  'bids.cancel',
  'audit.read',
  'records.archive',
  'staff.manage',
  'setup.manage',
  'records.purge',
];
type Request = {
  path: string;
  kind: string;
  query: string;
  cursor: string | null;
};
async function fixture(page: Page) {
  const requests: Request[] = [];
  let slow = false,
    finished: Promise<void> = Promise.resolve(),
    finish = () => {};
  const id = randomUUID(),
    now = new Date().toISOString();
  await page.route('http://localhost:4000/**', async (route) => {
    const r = route.request(),
      u = new URL(r.url()),
      p = u.pathname;
    let body: unknown = { items: [], nextCursor: null };
    if (p === '/auth/staff/refresh')
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
    else if (p === '/staff/me')
      body = { name: 'Ada Okafor', roleName: 'Admin', permissions };
    else if (p === '/staff/preferences')
      body = { compactTables: false, reduceMotion: false };
    else if (p === '/staff/activity')
      body = { id, message: 'Activity recorded.' };
    else if (p === '/staff/notifications')
      body = {
        items: [],
        nextCursor: null,
        unreadCount: 0,
        serverTime: now,
        emailMode: 'preview',
      };
    else if (p === '/staff/records' || p === '/staff/setup') {
      const q = u.searchParams.get('search') ?? '',
        kind = u.searchParams.get('kind') ?? '';
      requests.push({
        path: p,
        kind,
        query: q,
        cursor: u.searchParams.get('cursor'),
      });
      if (slow && q === 'alpha') {
        finished = new Promise<void>((resolve) => {
          finish = resolve;
        });
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
      const title = (q || 'All records') + ' result';
      body =
        p === '/staff/setup'
          ? {
              items: [
                {
                  id,
                  kind,
                  name: title,
                  key: kind === 'category' ? 'phones' : 'LAGOS-01',
                  parentId: null,
                  address:
                    kind === 'location' ? '12 Example Road, Ikeja, Lagos' : '',
                  hours: 'Monday–Friday, 9am–5pm',
                  capacityPerSlot: kind === 'location' ? 20 : null,
                  linkedLots: 3,
                  currentItems: kind === 'location' ? 3 : undefined,
                  pendingPickupItems: kind === 'location' ? 1 : undefined,
                  createdAt: now,
                  updatedAt: now,
                  archivedAt: null,
                },
              ],
              nextCursor: q || u.searchParams.has('cursor') ? null : 'page-2',
            }
          : {
              items: [
                {
                  id,
                  title,
                  reference: 'DEMO-ABCD1234',
                  status: kind === 'lots' ? 'draft' : 'active',
                  createdAt: now,
                  updatedAt: now,
                  detail: 'Synthetic staff search fixture',
                },
              ],
              nextCursor: q || u.searchParams.has('cursor') ? null : 'page-2',
            };
    }
    if (u.searchParams.get('search') === 'missing')
      body = { items: [], nextCursor: null };
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
      .catch(() => {});
    if (slow && u.searchParams.get('search') === 'alpha') finish();
  });
  return {
    requests,
    delay() {
      slow = true;
    },
    waitForSlow: () => finished,
  };
}
const scenarios = [
  { section: 'inventory', kind: 'lots' },
  { section: 'buyers', kind: 'buyers' },
  { section: 'staff', kind: 'staff' },
  { section: 'staff', kind: 'roles', tab: 'Roles & permissions' },
  { section: 'finance', kind: 'invoices' },
  { section: 'finance', kind: 'withdrawals', tab: 'Withdrawals' },
  { section: 'audit', kind: 'audit' },
  { section: 'trash', kind: 'lots' },
  { section: 'trash', kind: 'buyers', tab: 'Buyers' },
  { section: 'trash', kind: 'staff', tab: 'Staff accounts' },
  { section: 'trash', kind: 'roles', tab: 'Custom roles' },
  { section: 'categories', kind: 'category' },
  { section: 'centres', kind: 'location' },
];
test('every staff list searches while typing without a submit button', async ({
  page,
}) => {
  test.setTimeout(90000);
  const f = await fixture(page);
  for (const s of scenarios) {
    await page.goto(url + '/?section=' + s.section);
    await expect(
      page.locator('#staff-main').getByRole('searchbox'),
    ).toBeVisible();
    if (s.tab)
      await page.getByRole('tab', { name: s.tab, exact: true }).click();
    await page.locator('#staff-main').getByRole('searchbox').fill('nigeria');
    await expect
      .poll(() =>
        f.requests.some((r) => r.kind === s.kind && r.query === 'nigeria'),
      )
      .toBe(true);
    await expect(
      page.locator('#staff-main').getByText('nigeria result', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Search', exact: true }),
    ).toHaveCount(0);
  }
});
for (const section of ['inventory', 'centres']) {
  test(`${section} resets pagination, trims terms and restores results on clear`, async ({
    page,
  }) => {
    const f = await fixture(page);
    await page.goto(url + '/?section=' + section);
    await expect(
      page.getByText('All records result', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect
      .poll(() => f.requests.some((r) => r.cursor === 'page-2'))
      .toBe(true);
    await page
      .locator('#staff-main')
      .getByRole('searchbox')
      .fill('  nigeria  ');
    await expect(
      page.locator('#staff-main').getByText('nigeria result', { exact: true }),
    ).toBeVisible();
    expect(
      f.requests
        .filter((r) => r.query === 'nigeria')
        .every((r) => r.cursor === null),
    ).toBe(true);
    await page
      .getByRole('button', { name: 'Clear search', exact: true })
      .click();
    await expect(
      page.locator('#staff-main').getByRole('searchbox'),
    ).toHaveValue('');
    await expect(
      page.locator('#staff-main').getByRole('searchbox'),
    ).toBeFocused();
    await expect(
      page.getByText('All records result', { exact: true }),
    ).toBeVisible();
    await page.locator('#staff-main').getByRole('searchbox').fill('missing');
    await expect(
      page.getByRole('heading', {
        name:
          section === 'centres'
            ? 'No matching pickup centres'
            : 'No matching records',
        exact: true,
      }),
    ).toBeVisible();
  });
  test(`${section} ignores an older response that arrives after the latest search`, async ({
    page,
  }) => {
    const f = await fixture(page);
    f.delay();
    await page.goto(url + '/?section=' + section);
    await expect(
      page.locator('#staff-main').getByRole('searchbox'),
    ).toBeVisible();
    await page.locator('#staff-main').getByRole('searchbox').fill('alpha');
    await expect
      .poll(() => f.requests.some((r) => r.query === 'alpha'))
      .toBe(true);
    await page.locator('#staff-main').getByRole('searchbox').fill('beta');
    await expect(page.getByText('beta result', { exact: true })).toBeVisible();
    await f.waitForSlow();
    await expect(page.getByText('alpha result', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText('beta result', { exact: true })).toBeVisible();
  });
}
test('rapid typing is debounced and composition waits for completed text', async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto(url + '/?section=inventory');
  const input = page.locator('#staff-main').getByRole('searchbox');
  await expect(input).toBeVisible();
  await input.pressSequentially('nigeria', { delay: 10 });
  await expect(
    page.locator('#staff-main').getByText('nigeria result', { exact: true }),
  ).toBeVisible();
  expect(f.requests.filter((r) => r.query).map((r) => r.query)).toEqual([
    'nigeria',
  ]);
  await input.dispatchEvent('compositionstart');
  await input.fill('composed');
  await page.waitForTimeout(350);
  expect(f.requests.some((r) => r.query === 'composed')).toBe(false);
  await input.dispatchEvent('compositionend');
  await expect(
    page.getByText('composed result', { exact: true }),
  ).toBeVisible();
});
test('changing sections cancels a pending search term', async ({ page }) => {
  const f = await fixture(page);
  await page.goto(url + '/?section=inventory');
  await page.locator('#staff-main').getByRole('searchbox').fill('oldterm');
  await page
    .getByRole('navigation', { name: 'Staff navigation' })
    .getByRole('button', { name: 'Buyers', exact: true })
    .click();
  await expect(page.locator('#staff-main').getByRole('searchbox')).toHaveValue(
    '',
  );
  await expect(
    page.getByText('All records result', { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(350);
  expect(
    f.requests.some((r) => r.kind === 'buyers' && r.query === 'oldterm'),
  ).toBe(false);
});

for (const width of [360, 768, 1280]) {
  test(`staff live search remains usable at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    for (const section of ['inventory', 'categories', 'centres']) {
      await page.goto(url + '/?section=' + section);
      const input = page.locator('#staff-main').getByRole('searchbox');
      await input.fill('nigeria');
      await expect(
        page
          .locator('#staff-main')
          .getByText('nigeria result', { exact: true }),
      ).toBeVisible();
      await expect(input).toBeFocused();
      const box = await input.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const path = info.outputPath(`live-search-${section}-${width}.png`);
      await page.screenshot({ path, fullPage: true });
      await info.attach(section, { path, contentType: 'image/png' });
    }
  });
}
