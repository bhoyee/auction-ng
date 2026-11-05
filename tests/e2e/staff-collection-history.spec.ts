import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
const url = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
async function fixture(page: Page) {
  const id = randomUUID(),
    now = new Date().toISOString();
  const rows = Array.from({ length: 12 }, (_, n) => ({
    id: randomUUID(),
    itemNumber: 'LOT' + n,
    invoiceNumber: 'INV' + n,
    title: 'Collected phone ' + n,
    buyerName: 'Ada Okafor',
    location: 'Ikeja collection centre',
    staffName: n ? 'Warehouse staff' : null,
    collectedAt: now,
  }));
  let failed = false;
  await page.route('http://localhost:4000/**', async (route) => {
    const path = new URL(route.request().url());
    let body: unknown = { items: [], nextCursor: null };
    if (path.pathname === '/auth/staff/refresh')
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
    else if (path.pathname === '/staff/me')
      body = {
        name: 'Ada Okafor',
        roleName: 'Admin',
        permissions: ['pickup.manage'],
      };
    else if (path.pathname === '/staff/preferences')
      body = { compactTables: false, reduceMotion: false };
    else if (path.pathname === '/staff/activity')
      body = { id, message: 'Activity recorded.' };
    else if (path.pathname === '/staff/notifications')
      body = {
        items: [],
        nextCursor: null,
        unreadCount: 0,
        serverTime: now,
        emailMode: 'preview',
      };
    else if (path.pathname === '/pickup/collections') {
      if (failed) {
        await route.fulfill({ status: 503, body: '{}' });
        return;
      }
      const q = path.searchParams.get('q') ?? '';
      const filtered = rows.filter((row) => row.title.includes(q));
      const offset = path.searchParams.has('cursor') ? 10 : 0;
      body = {
        items: filtered.slice(offset, offset + 10),
        nextCursor: !offset && filtered.length > 10 ? now + '|' + id : null,
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(url + '/?section=pickup');
  await page
    .getByRole('button', { name: 'Collected items', exact: true })
    .click();
  await expect(
    page.getByText('Collected phone 0', { exact: true }),
  ).toBeVisible();
  return {
    fail: (value: boolean) => {
      failed = value;
    },
  };
}
test('collected history searches live, paginates and retains confirmed rows on silent refresh failure', async ({
  page,
}) => {
  const state = await fixture(page);
  const history = page.locator('.agn-visit-desk-panel').filter({
    has: page.getByRole('heading', { name: 'Collected items', exact: true }),
  });
  await expect(history.locator('tbody tr')).toHaveCount(10);
  await history.getByRole('button', { name: /Next/ }).click();
  await expect(
    page.getByText('Collected phone 10', { exact: true }),
  ).toBeVisible();
  await expect(history.locator('tbody tr')).toHaveCount(2);
  await history.getByRole('searchbox').fill('Collected phone 3');
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await expect(
    page.getByText('Collected phone 3', { exact: true }),
  ).toBeVisible();
  state.fail(true);
  await page.evaluate(() =>
    window.dispatchEvent(new Event('lotvanta:staff-refresh')),
  );
  await expect(
    history.getByText(/Collected items could not be refreshed/),
  ).toBeVisible();
  await expect(
    page.getByText('Collected phone 3', { exact: true }),
  ).toBeVisible();
  state.fail(false);
  await history.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    history.getByText(/Collected items could not be refreshed/),
  ).toHaveCount(0);
  await history.getByRole('searchbox').fill('no match');
  await expect(
    history.getByText('No collected items match this view.'),
  ).toBeVisible();
});
for (const width of [360, 768, 1280])
  test('collected history responsive at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const tab = page.getByRole('button', {
      name: 'Collected items',
      exact: true,
    });
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
    expect((await tab.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await mkdir('docs/design/collection-history', { recursive: true });
    await page.screenshot({
      path: 'docs/design/collection-history/history-' + width + '.png',
      fullPage: true,
    });
  });
