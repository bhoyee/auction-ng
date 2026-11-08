import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

// Synthetic staff responses only; no real buyer data or API is used.
const staffUrl = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 3600000).toISOString();

async function fixture(
  page: Page,
  options: { policyOff?: boolean; empty?: boolean } = {},
) {
  const id = randomUUID(),
    ikeja = randomUUID(),
    lekki = randomUUID();
  const titles = [
    ['Samsung Galaxy S24 Ultra, 256GB', 'Chiamaka Obi', 52],
    ['HP 15 laptop, Core i5, 8GB RAM', 'Tunde Bakare', 30],
    ['Hisense 43-inch smart TV', 'Ngozi Eze', 26],
    ['Leather trainers, size 43', 'Ibrahim Musa', 6],
    ['Wireless earbuds with charging case', 'Funke Adeyemi', 1],
  ] as const;
  const items = options.empty
    ? []
    : titles.map(([title, buyerName, hours], index) => ({
        invoiceLineId: randomUUID(),
        lotId: randomUUID(),
        reference: `LV8Q00${String(index + 1).padStart(2, '0')}`,
        title,
        invoiceNumber: `LV-INV-30${index + 1}`,
        buyerName,
        locationId: index === 4 && options.policyOff ? lekki : ikeja,
        location:
          index === 4 && options.policyOff
            ? 'Lekki collection centre'
            : 'Ikeja collection centre',
        paidAt: hoursAgo(hours),
        thumbnailUrl: null,
        policyEnabled: !(index === 4 && options.policyOff),
      }));
  const summary = {
    total: items.length,
    overWarn: items.length ? 3 : 0,
    overAlert: items.length ? 1 : 0,
    oldestPaidAt: items[0]?.paidAt ?? null,
    centres: options.empty
      ? []
      : [
          {
            locationId: ikeja,
            location: 'Ikeja collection centre',
            count: options.policyOff ? 4 : 5,
            policyEnabled: true,
          },
          ...(options.policyOff
            ? [
                {
                  locationId: lekki,
                  location: 'Lekki collection centre',
                  count: 1,
                  policyEnabled: false,
                },
              ]
            : []),
        ],
  };
  const ready: unknown[] = [];
  const prepareQueries: URLSearchParams[] = [];
  await page.route(/http:\/\/localhost:(4000|4400)\//, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/refresh' || path === '/auth/staff/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id,
          name: 'Adaeze Okafor',
          role: 'warehouse',
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
        roleName: 'Warehouse',
        permissions: ['pickup.manage', 'storage.manage'],
      };
    else if (path === '/staff/preferences')
      body = { compactTables: false, reduceMotion: false };
    else if (path === '/staff/notifications')
      body = { items: [], nextCursor: null, unreadCount: 0 };
    else if (path === '/staff/activity') body = { id, message: 'Recorded' };
    else if (path === '/pickup/storage/prepare') {
      prepareQueries.push(url.searchParams);
      const reference = url.searchParams.get('reference');
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const list = reference
        ? items.filter((i) => i.reference === reference)
        : items.filter(
            (i) =>
              !search ||
              i.title.toLowerCase().includes(search) ||
              i.reference.toLowerCase().includes(search),
          );
      body = {
        items: list,
        nextCursor: null,
        serverTime: new Date().toISOString(),
        summary,
      };
    } else if (path === '/pickup/storage/ready') {
      ready.push(route.request().postDataJSON());
      body = { id: randomUUID(), message: 'Items ready.' };
    } else if (path === '/pickup/storage/cases')
      body = {
        items: [],
        nextCursor: null,
        serverTime: new Date().toISOString(),
      };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return { items, ready, prepareQueries };
}

async function open(page: Page) {
  await page.goto(staffUrl + '/?section=pickup');
  await expect(
    page.getByRole('heading', { name: 'Prepare items for pickup' }),
  ).toBeVisible();
}

for (const width of [360, 768, 1280]) {
  test(`prepare items queue at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { ready } = await fixture(page);
    await open(page);
    await expect(
      page.getByRole('button', { name: /Prepare items.*5 waiting/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByText('Samsung Galaxy S24 Ultra, 256GB'),
    ).toBeVisible();
    await expect(page.getByRole('table').getByText('2 d 4 h')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await mkdir('docs/design/pickup-prepare', { recursive: true });
    await page.screenshot({
      path: `docs/design/pickup-prepare/queue-${width}.png`,
      fullPage: true,
    });

    await page.getByLabel('Scan or type item ID').fill('lv8q0002');
    await page.getByLabel('Scan or type item ID').press('Enter');
    await expect(page.getByText('Added LV8Q0002 · HP 15 laptop')).toBeVisible();
    await expect(page.getByLabel('Scan or type item ID')).toBeFocused();
    await page.getByLabel('Select LV8Q0001').check();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.screenshot({
      path: `docs/design/pickup-prepare/selected-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Mark 2 ready', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Mark 2 items ready for pickup',
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        'The buyer’s five-working-day pickup window starts now.',
      ),
    ).toBeVisible();
    await dialog.getByLabel('Note (optional)').fill('Shelf B3');
    await page.screenshot({
      path: `docs/design/pickup-prepare/confirm-${width}.png`,
      fullPage: true,
    });
    await dialog
      .getByRole('button', { name: 'Mark 2 ready and notify buyers' })
      .click();
    await expect(
      page.getByText('2 items are ready. Each buyer has been sent'),
    ).toBeVisible();
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({
      reason: 'Item located and placed on the collection shelf. Shelf B3',
    });
    expect((ready[0] as { lineIds: string[] }).lineIds).toHaveLength(2);
  });
}

test('single row action keeps the existing selection', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const { ready, items } = await fixture(page);
  await open(page);
  await page.getByLabel('Select LV8Q0001').check();
  await page.getByLabel('Select LV8Q0003').check();
  await page
    .getByRole('row', { name: /LV8Q0004/ })
    .getByRole('button', { name: 'Mark ready' })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Mark item ready for pickup',
  });
  await dialog
    .getByRole('button', { name: 'Mark ready and notify buyer' })
    .click();
  await expect(page.getByText(/LV8Q0004 is ready/)).toBeVisible();
  expect((ready[0] as { lineIds: string[] }).lineIds).toEqual([
    items[3]?.invoiceLineId,
  ]);
  await expect(page.getByText('2 selected')).toBeVisible();
});

test('scan reports unknown items and disabled centre policy clearly', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await fixture(page, { policyOff: true });
  await open(page);
  await expect(
    page.getByText(/Lekki collection centre: storage policy is off/),
  ).toBeVisible();
  await expect(page.getByLabel('Select LV8Q0005')).toBeDisabled();
  await page.getByLabel('Scan or type item ID').fill('LV9ZZZZZ');
  await page.getByLabel('Scan or type item ID').press('Enter');
  await expect(
    page.getByText(/LV9ZZZZZ is not waiting for preparation/),
  ).toBeVisible();
  await page
    .getByLabel('Scan or type item ID')
    .fill('https://lotvanta.example/lots/LV8Q0005');
  await page.getByLabel('Scan or type item ID').press('Enter');
  await expect(
    page.getByText(/LV8Q0005 is at Lekki collection centre/),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/design/pickup-prepare/policy-off-1280.png',
    fullPage: true,
  });
});

test('empty queue explains what happens next', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await fixture(page, { empty: true });
  await open(page);
  await expect(page.getByText('All caught up')).toBeVisible();
  await page.screenshot({
    path: 'docs/design/pickup-prepare/empty-768.png',
    fullPage: true,
  });
});
