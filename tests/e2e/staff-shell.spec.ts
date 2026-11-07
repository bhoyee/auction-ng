import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const url = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
async function fixture(
  page: Page,
  permissions = ['dashboard.view', 'pickup.manage', 'setup.manage'],
) {
  const id = 'bc222441-9957-4550-a0a9-deddbde5f997';
  const now = new Date().toISOString();
  await page.route('http://localhost:4000/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/staff/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id,
          name: 'Synthetic staff',
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
      body = { name: 'Synthetic staff', roleName: 'Admin', permissions };
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
          live: 0,
          scheduled: 0,
          drafts: 0,
          pickup: 0,
          support: 0,
          paidSalesKobo: 0,
          refundsKobo: 0,
          paidOrders: 0,
        },
        sales: [],
        lots: [],
      };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(url + '/?section=overview');
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening), / }),
  ).toBeVisible();
}

for (const width of [360, 768, 1280, 1440]) {
  test(`staff shell navigation and layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await fixture(page);
    const sidebar = page.locator('.lv-staff-shell > .lv-staff-sidebar');
    if (width < 768) {
      await expect(sidebar).toBeHidden();
      await page.getByRole('button', { name: 'Open staff navigation' }).click();
      const drawer = page.getByRole('dialog', { name: 'Staff navigation' });
      await expect(drawer).toBeVisible();
      await expect(
        drawer.getByRole('button', { name: 'Finance', exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
    } else {
      await expect(sidebar).toBeVisible();
      expect(Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(
        width < 1280 ? 72 : 248,
      );
      if (width >= 1280) {
        await page.getByRole('button', { name: 'Collapse sidebar' }).click();
        expect(Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(72);
        await page.getByRole('button', { name: 'Expand sidebar' }).click();
      }
    }
    await expect(
      page.getByRole('button', { name: 'Check in a buyer', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('docs/design/admin-shell', { recursive: true });
    await page.screenshot({
      path: `docs/design/admin-shell/shell-${width}.png`,
      fullPage: true,
    });
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Go to a section' });
    await expect(palette).toBeVisible();
    await palette.getByRole('searchbox').fill('Finance');
    await expect(
      palette.getByText('No matching sections.', { exact: false }),
    ).toBeVisible();
    await palette.getByRole('searchbox').fill('Inventory');
    await palette
      .getByRole('button', { name: 'Inventory', exact: true })
      .click();
    await expect(palette).not.toBeVisible();
    await expect(page).toHaveURL(/section=categories/);
  });
}
