import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function fixture(page: Page, used = false) {
  let deleted = false;
  const batch = () => ({
    id: uuid(1),
    code: 'B-0001',
    name: 'Electronics purchase',
    supplierId: uuid(2),
    supplierName: 'Synthetic supplier',
    locationName: 'Lagos centre',
    locationCode: 'LAG',
    status: used ? 'received' : 'arriving',
    boughtOn: '2026-11-20',
    expectedOn: '2026-12-01',
    receivedOn: used ? '2026-11-21' : null,
    itemsExpected: 20,
    itemsReceived: used ? 20 : null,
    lots: 0,
    sold: 0,
    writtenOff: 0,
    intakenPercent: 0,
    soldPercent: 0,
    costKobo: 100_000_000,
    moneyBackKobo: 0,
    marginKobo: null,
    recoveryPercent: null,
    updatedAt: '2026-11-26T10:00:00.000Z',
    deletedAt: deleted ? new Date().toISOString() : null,
  });
  await page.route('http://localhost:4000/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/staff/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id: uuid(3),
          name: 'Synthetic administrator',
          role: 'admin',
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
        expiresAt: new Date(Date.now() + 28_800_000).toISOString(),
      };
    else if (path === '/staff/me')
      body = {
        name: 'Synthetic administrator',
        roleName: 'Admin',
        permissions: ['batches.read', 'batches.manage', 'batches.costs'],
      };
    else if (path === '/staff/preferences')
      body = { compactTables: false, reduceMotion: false };
    else if (path === '/staff/activity')
      body = { id: uuid(4), message: 'Activity recorded.' };
    else if (path === '/staff/notifications')
      body = {
        items: [],
        nextCursor: null,
        unreadCount: 0,
        serverTime: new Date().toISOString(),
        emailMode: 'preview',
      };
    else if (
      path === '/admin/batches/delete' ||
      path === '/admin/batches/restore'
    ) {
      const input = request.postDataJSON() as {
        confirmation?: string;
        reason: string;
      };
      expect(input.reason.trim().length).toBeGreaterThanOrEqual(3);
      if (path.endsWith('/delete')) expect(input.confirmation).toBe('B-0001');
      deleted = path.endsWith('/delete');
      body = {
        id: uuid(1),
        message: deleted
          ? 'B-0001 moved to Deleted. You can restore it for 30 days.'
          : 'B-0001 restored.',
      };
    } else if (path.endsWith('/files')) body = { items: [] };
    else if (path === '/admin/batches')
      body = {
        items:
          (url.searchParams.get('tab') === 'deleted') === deleted
            ? [batch()]
            : [],
        counts: {
          open: deleted ? 0 : 1,
          arriving: deleted ? 0 : 1,
          closed: 0,
          all: deleted ? 0 : 1,
          deleted: deleted ? 1 : 0,
        },
        cards: {
          unsoldCostKobo: 0,
          unsoldLots: 0,
          unsoldLocations: 0,
          openBatches: deleted ? 0 : 1,
          arrivingThisWeek: 0,
          averageRecoveryPercent: null,
          oldestUnsold: null,
        },
        nextCursor: null,
        canManage: true,
        canReceive: true,
        canSeeCosts: true,
      };
    else if (path === '/admin/batches/' + uuid(1))
      body = {
        batch: batch(),
        supplierRef: null,
        locationId: uuid(5),
        categories: [],
        costs: null,
        notes: null,
        closedAt: null,
        closedReason: null,
        recovery: null,
        left: { unsold: 0, categories: [], stuck: 0 },
        costsAreEstimates: false,
        canManage: true,
        canReceive: true,
        canSeeCosts: true,
        canDelete: !used && !deleted,
        canRestore: deleted,
        deleteReason: deleted ? 'Created by mistake' : null,
        purgeAt: deleted
          ? new Date(Date.now() + 30 * 86400_000).toISOString()
          : null,
      };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(
    (process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301') + '/batches',
  );
}

for (const width of [360, 768, 1280])
  test(`unused batch deletion and restore at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    await page
      .getByRole('button', { name: 'Delete batch', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('button', { name: 'Delete batch', exact: true }),
    ).toBeDisabled();
    await dialog
      .getByLabel('Reason', { exact: true })
      .fill('Created by mistake');
    await dialog.getByLabel('Type B-0001 to confirm').fill('WRONG');
    await expect(
      dialog.getByRole('button', { name: 'Delete batch', exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel('Type B-0001 to confirm').fill('B-0001');
    await mkdir('docs/design/batch-deletion', { recursive: true });
    await page.screenshot({
      path: `docs/design/batch-deletion/delete-${width}.png`,
    });
    await dialog
      .getByRole('button', { name: 'Delete batch', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Restore batch', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /^B-0001/, level: 2 }),
    ).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Mark received', exact: true }),
    ).toHaveCount(0);
    // Capture from the page origin so off-screen fixed skip links stay outside
    // the full-page image, rather than appearing beside the scrolled viewport.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `docs/design/batch-deletion/deleted-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Restore batch', exact: true })
      .click();
    await dialog
      .getByLabel('Reason', { exact: true })
      .fill('The purchase is needed');
    await dialog
      .getByRole('button', { name: 'Restore batch', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Delete batch', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Restore batch', exact: true }),
    ).toHaveCount(0);
  });

test('received batches have no delete action', async ({ page }) => {
  await fixture(page, true);
  await expect(
    page.getByRole('heading', { name: /^B-0001/, level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Delete batch', exact: true }),
  ).toHaveCount(0);
});
