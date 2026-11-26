import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const url = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rows = Array.from({ length: 15 }, (_, index) => ({
  id: uuid(index + 1),
  code: `B-${String(index + 1).padStart(4, '0')}`,
  name: `Electronics stock ${index + 1}`,
  supplierId: uuid(100),
  supplierName: 'Synthetic supplier',
  locationName: 'Lagos centre',
  locationCode: 'LAG',
  status: 'selling',
  boughtOn: '2026-11-20',
  expectedOn: null,
  receivedOn: '2026-11-21',
  itemsExpected: 20,
  itemsReceived: 20,
  lots: 20,
  sold: 5,
  writtenOff: 0,
  intakenPercent: 100,
  soldPercent: 25,
  costKobo: null,
  moneyBackKobo: null,
  marginKobo: null,
  recoveryPercent: null,
  updatedAt: '2026-11-26T10:00:00.000Z',
}));
async function fixture(page: Page, path = '/batches') {
  let details = 0,
    failedId = '',
    heldId = '',
    release = () => {};
  await page.route('http://localhost:4000/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/staff/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id: uuid(200),
          name: 'Synthetic staff',
          role: 'warehouse',
          status: 'active',
          email: 'staff@example.test',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: false,
        },
      };
    else if (path === '/auth/staff/session' || path === '/auth/staff/activity')
      body = {
        serverTime: new Date().toISOString(),
        idleExpiresAt: new Date(Date.now() + 900_000).toISOString(),
        expiresAt: new Date(Date.now() + 8 * 60 * 60_000).toISOString(),
      };
    else if (path === '/staff/me')
      body = {
        name: 'Synthetic staff',
        roleName: 'Warehouse',
        permissions: ['batches.read'],
      };
    else if (path === '/staff/preferences')
      body = { compactTables: false, reduceMotion: false };
    else if (path === '/staff/activity')
      body = { id: uuid(201), message: 'Activity recorded.' };
    else if (path === '/staff/notifications')
      body = {
        items: [],
        nextCursor: null,
        unreadCount: 0,
        serverTime: new Date().toISOString(),
        emailMode: 'preview',
      };
    else if (path === '/admin/batches')
      body = {
        items: rows,
        counts: { open: 15, arriving: 0, closed: 0, all: 15 },
        cards: {
          unsoldCostKobo: null,
          unsoldLots: 225,
          unsoldLocations: 1,
          openBatches: 15,
          arrivingThisWeek: 0,
          averageRecoveryPercent: null,
          oldestUnsold: null,
        },
        nextCursor: null,
        canManage: false,
        canReceive: false,
        canSeeCosts: false,
      };
    else if (/^\/admin\/batches\/[0-9a-f-]{36}$/.test(path)) {
      const batch = rows.find((row) => path.endsWith(row.id));
      if (!batch) throw Error('Unknown fixture batch');
      details++;
      if (batch.id === failedId)
        return route.fulfill({ status: 503, body: '{}' });
      if (batch.id === heldId)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      body = {
        batch,
        supplierRef: null,
        locationId: uuid(101),
        categories: [],
        costs: null,
        notes: null,
        closedAt: null,
        closedReason: null,
        recovery: null,
        left: { unsold: 15, categories: [], stuck: 0 },
        costsAreEstimates: false,
        canManage: false,
        canReceive: false,
        canSeeCosts: false,
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(url + path);
  await expect(
    page.getByRole('heading', { name: 'Inventory batches', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Show B-0001, Electronics stock 1',
      exact: true,
    }),
  ).toBeVisible();
  return {
    details: () => details,
    fail: (id: string) => {
      failedId = id;
    },
    hold: (id: string) => {
      heldId = id;
    },
    release: () => {
      heldId = '';
      release();
    },
  };
}
async function expectRevealed(page: Page, code: string) {
  const heading = page.getByRole('heading', { name: new RegExp(`^${code} ·`) });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport({ ratio: 1 });
  // A short detail panel cannot align at the very top without adding blank
  // space below the footer; the full summary must still be visible.
  await expect(
    page
      .getByRole('region', { name: `Batch ${code}`, exact: true })
      .locator('.lv-batch-summary'),
  ).toBeInViewport({ ratio: 1 });
  return heading;
}
for (const width of [360, 768, 1280])
  test(`batch selection reveals the loaded details at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page);
    // Merely opening the list must not jump to its automatically selected batch.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    state.hold(uuid(12));
    await page
      .getByRole('button', {
        name: 'Show B-0012, Electronics stock 12',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('region', { name: 'Selected batch details', exact: true }),
    ).toBeFocused();
    state.release();
    await expectRevealed(page, 'B-0012');
    await expect(page).toHaveURL(url + '/batches/' + uuid(12));
    await mkdir('docs/design/batch-detail-navigation', { recursive: true });
    await page.screenshot({
      path: `docs/design/batch-detail-navigation/selected-${width}.png`,
    });
    // Selecting the same batch again still brings its details into view.
    await page
      .getByRole('button', {
        name: 'Show B-0012, Electronics stock 12',
        exact: true,
      })
      .click();
    await expectRevealed(page, 'B-0012');
    // Quiet updates must not steal focus or drag staff down the page.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const before = state.details();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(state.details).toBeGreaterThan(before);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
test('row selection and direct links reveal batch details', async ({
  page,
}) => {
  await fixture(page);
  await page
    .locator('.lv-batch-table tr', { hasText: 'B-0002' })
    .getByText('Synthetic supplier', { exact: false })
    .click();
  await expectRevealed(page, 'B-0002');
  const button = page.getByRole('button', {
    name: 'Show B-0004, Electronics stock 4',
    exact: true,
  });
  await button.focus();
  await button.press('Enter');
  await expectRevealed(page, 'B-0004');
  await page.goto(url + '/batches/' + uuid(3));
  await expectRevealed(page, 'B-0003');
});
test('a selected batch loading error is revealed with its retry action', async ({
  page,
}) => {
  const state = await fixture(page);
  state.fail(uuid(13));
  await page
    .getByRole('button', {
      name: 'Show B-0013, Electronics stock 13',
      exact: true,
    })
    .click();
  const panel = page.getByRole('region', {
    name: 'Selected batch details',
    exact: true,
  });
  await expect(panel.getByText(/couldn.t be loaded/)).toBeVisible();
  await expect(panel).toBeFocused();
  await expect(panel).toBeInViewport({ ratio: 1 });
  await expect(
    panel.getByRole('button', { name: 'Try again', exact: true }),
  ).toBeVisible();
});
