import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import {
  unsoldBulkRelistSchema,
  unsoldDismissSchema,
} from '../../packages/shared/src/index';

// Unsold review bulk actions against synthetic staff responses only.
const staffUrl = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const shots = process.env.UNSOLD_SCREENSHOTS;

async function open(
  page: Page,
  options: { count?: number; skipFirst?: boolean; failOnce?: boolean } = {},
) {
  const names = [
    'Binatone blender with grinder',
    'Samsung Galaxy A15, 128GB',
    'Hisense 43-inch smart TV',
    'Leather trainers, size 43',
  ];
  let waiting = Array.from({ length: options.count ?? 24 }, (_, i) => ({
    id: randomUUID(),
    lotNumber: `LOT-UNSOLD${String(i).padStart(2, '0')}`,
    title: names[i % names.length],
    imageUrl: null,
    startPriceKobo: 1_250_000 + i * 50_000,
    fixedPriceKobo: null,
    retailPriceKobo: 4_000_000,
    autoRelistCount: 2,
    closedAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
    locationName: 'Ikeja collection centre',
    binCode: 'A-04',
    updatedAt: new Date().toISOString(),
  }));
  let deleted: typeof waiting = [];
  const relists: ReturnType<typeof unsoldBulkRelistSchema.parse>[] = [];
  let failures = options.failOnce ? 1 : 0;
  await page.route(/http:\/\/localhost:(4000|4400)\//, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let status = 200;
    let body: unknown = { items: [], nextCursor: null };
    const take = (ids: string[]) => {
      const skipped = options.skipFirst ? waiting[0]?.id : undefined;
      const gone = waiting.filter(
        (lot) => ids.includes(lot.id) && lot.id !== skipped,
      );
      waiting = waiting.filter((lot) => !gone.includes(lot));
      body = {
        done: gone.length,
        skipped:
          skipped && ids.includes(skipped)
            ? [
                {
                  id: skipped,
                  lotNumber: 'LOT-UNSOLD00',
                  reason: 'This item changed. Reload it first.',
                },
              ]
            : [],
      };
      return gone;
    };
    if (path === '/auth/refresh' || path === '/auth/staff/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id: randomUUID(),
          name: 'Adaeze Okafor',
          role: 'admin',
          status: 'active',
          email: 'adaeze@example.test',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: false,
        },
      };
    else if (path === '/staff/me')
      body = {
        name: 'Adaeze Okafor',
        roleName: 'Admin',
        permissions: ['dashboard.view', 'auctions.manage', 'lots.relist'],
      };
    else if (path === '/staff/preferences')
      body = { compactTables: false, reduceMotion: false };
    else if (path === '/staff/notifications')
      body = { items: [], nextCursor: null, unreadCount: 0 };
    else if (path === '/staff/activity')
      body = { id: randomUUID(), message: 'Recorded' };
    else if (path === '/admin/unsold/count') body = { count: waiting.length };
    else if (path === '/admin/unsold/dismissed')
      body = {
        items: deleted.map((lot) => ({
          id: lot.id,
          lotNumber: lot.lotNumber,
          title: lot.title,
          imageUrl: null,
          startPriceKobo: lot.startPriceKobo,
          deletedAt: new Date().toISOString(),
          deletedBy: 'Adaeze Okafor',
          restoreUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        })),
        nextCursor: null,
        total: deleted.length,
      };
    else if (path === '/admin/unsold/relist') {
      const input = unsoldBulkRelistSchema.parse(
        route.request().postDataJSON(),
      );
      relists.push(input);
      if (failures > 0) {
        failures -= 1;
        status = 503;
        body = { message: 'Unavailable' };
      } else take(input.items.map((item) => item.id));
    } else if (path === '/admin/unsold/dismiss')
      deleted = [
        ...take(unsoldDismissSchema.parse(route.request().postDataJSON()).ids),
        ...deleted,
      ];
    else if (path.endsWith('/restore')) {
      const lot = deleted.find((item) => path.includes(item.id));
      deleted = deleted.filter((item) => item !== lot);
      if (lot) waiting = [lot, ...waiting];
      body = {
        id: lot?.id ?? randomUUID(),
        message: `${lot?.lotNumber} is back in Unsold review.`,
      };
    } else if (path === '/admin/unsold') {
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const start = Number(url.searchParams.get('cursor') ?? 0);
      body = {
        items: waiting.slice(start, start + limit),
        nextCursor:
          start + limit < waiting.length ? String(start + limit) : null,
        total: waiting.length,
        settings: {
          maxRetries: 2,
          runHours: 24,
          priceCutPercent: 0,
          revision: 1,
          updatedAt: new Date().toISOString(),
        },
      };
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(staffUrl + '/?section=auctions');
  await expect(
    page.getByRole('heading', { name: 'Unsold items', exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  return { relists };
}
const tick = (page: Page, index: number) =>
  page
    .getByRole('checkbox', { name: /^Select .*LOT-UNSOLD/ })
    .nth(index)
    .check();
const act = async (page: Page, action: 'Relist' | 'Delete') => {
  await page.locator('.lv-unsold-menu summary').click();
  await page
    .locator('.lv-unsold-menu')
    .getByRole('button', { name: action })
    .click();
};
const shot = async (page: Page, name: string) => {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png` });
};

test.setTimeout(120_000);

test('relists selected items at their own prices after typing RELIST', async ({
  page,
}) => {
  const { relists } = await open(page, { skipFirst: true });
  await expect(page.locator('.lv-unsold-menu')).toHaveCount(0);
  await tick(page, 0);
  await tick(page, 1);
  await page.getByRole('button', { name: 'Next' }).click();
  await tick(page, 0);
  await expect(page.getByText('3 selected')).toBeVisible();
  await act(page, 'Relist');
  const dialog = page.getByRole('dialog', { name: 'Relist 3 items' });
  await expect(
    dialog.getByText('All 3 items keep their current prices.'),
  ).toBeVisible();
  await expect(dialog.getByLabel('Reason')).toHaveCount(0);
  await dialog.getByLabel('Runs for').selectOption('48');
  const submit = dialog.getByRole('button', { name: 'Relist 3 items' });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Type RELIST to confirm').fill('relist');
  await submit.click();
  await expect(page.getByText('2 items relisted.')).toBeVisible();
  await expect(
    page.getByText('LOT-UNSOLD00: This item changed. Reload it first.'),
  ).toBeVisible();
  // The skipped item stays ticked.
  await expect(page.getByText('1 selected')).toBeVisible();
  expect(relists).toHaveLength(1);
  expect(relists[0]).toMatchObject({ startsAt: null, runHours: 48 });
});

test('selects every waiting item in batches and retries with the same keys', async ({
  page,
}) => {
  const { relists } = await open(page, { count: 64, failOnce: true });
  const all = page.getByRole('checkbox', { name: 'Select all on this page' });
  await all.check();
  await expect(page.getByText('20 selected')).toBeVisible();
  await page
    .getByRole('button', { name: 'Select all 64 waiting items' })
    .click();
  await expect(page.getByText('64 selected')).toBeVisible();
  await act(page, 'Relist');
  const dialog = page.getByRole('dialog', { name: 'Relist 64 items' });
  await dialog.getByLabel('Type RELIST to confirm').fill('RELIST');
  const submit = dialog.getByRole('button', { name: 'Relist 64 items' });
  await submit.click();
  await expect(
    dialog.getByText('nothing will be relisted twice', { exact: false }),
  ).toBeVisible();
  await submit.click();
  await expect(page.getByText('64 items relisted.')).toBeVisible();
  await expect(page.getByText('No unsold items.')).toBeVisible();
  expect(relists.map((r) => r.items.length)).toEqual([50, 50, 14]);
  expect(relists[1]).toEqual(relists[0]);
  expect(relists[2]?.idempotencyKey).not.toBe(relists[1]?.idempotencyKey);
});

test('deletes from the list after typing DELETE, then restores', async ({
  page,
}) => {
  await open(page, { count: 3 });
  await tick(page, 1);
  await act(page, 'Delete');
  const dialog = page.getByRole('dialog', { name: /^Delete 1 item/ });
  await expect(
    dialog.getByText('This only removes them from Unsold review.'),
  ).toBeVisible();
  const submit = dialog.getByRole('button', { name: 'Delete 1 item' });
  await dialog.getByLabel('Type DELETE to confirm').fill('relist');
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await submit.click();
  await expect(
    page.getByText('1 item deleted from Unsold review.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Deleted', exact: true }).click();
  await expect(page.getByText('30 days left to restore')).toBeVisible();
  await page.getByRole('button', { name: /^Restore / }).click();
  await expect(
    page.getByText('LOT-UNSOLD01 is back in Unsold review.'),
  ).toBeVisible();
  await expect(page.getByText('No deleted items.')).toBeVisible();
  await page.getByRole('button', { name: 'Waiting', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: /^Select .*LOT-UNSOLD/ }),
  ).toHaveCount(3);
});

for (const width of [360, 768, 1280])
  test(`fits ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await tick(page, 0);
    await tick(page, 1);
    const fits = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
    await page.locator('.lv-unsold-menu summary').click();
    const menu = await page.locator('.lv-unsold-menu > div').boundingBox();
    expect(menu?.x).toBeGreaterThanOrEqual(0);
    expect((menu?.x ?? 0) + (menu?.width ?? 0)).toBeLessThanOrEqual(width);
    expect(await fits()).toBe(true);
    await shot(page, `list-${width}`);
    // Escape closes the menu and returns to its button.
    await page.keyboard.press('Escape');
    await expect(page.locator('.lv-unsold-menu > div')).toBeHidden();
    await expect(page.locator('.lv-unsold-menu summary')).toBeFocused();
    await act(page, 'Relist');
    await shot(page, `relist-${width}`);
    expect(await fits()).toBe(true);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await act(page, 'Delete');
    await shot(page, `delete-${width}`);
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await page.getByRole('button', { name: 'Delete 2 items' }).click();
    await page.getByRole('button', { name: 'Deleted', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Restore / })).toHaveCount(
      2,
    );
    await shot(page, `deleted-${width}`);
    expect(await fits()).toBe(true);
  });
