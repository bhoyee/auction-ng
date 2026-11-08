import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

// Synthetic staff session only.
const staffUrl = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';

async function fixture(page: Page) {
  const id = randomUUID();
  await page.route(/http:\/\/localhost:(4000|4400)\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/refresh' || path === '/auth/staff/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id,
          name: 'Adaeze Okafor',
          role: 'admin',
          status: 'active',
          email: 'adaeze.okafor@lotvanta.example',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: false,
        },
      };
    else if (path === '/staff/me')
      body = {
        name: 'Adaeze Okafor',
        roleName: 'Core Admin',
        permissions: ['pickup.manage'],
      };
    else if (path === '/staff/preferences')
      body = { compactTables: false, reduceMotion: false };
    else if (path === '/staff/notifications')
      body = { items: [], nextCursor: null, unreadCount: 0 };
    else if (path === '/staff/activity') body = { id, message: 'Recorded' };
    else if (path === '/pickup/storage/prepare')
      body = {
        items: [],
        nextCursor: null,
        serverTime: new Date().toISOString(),
        summary: {
          total: 0,
          overWarn: 0,
          overAlert: 0,
          oldestPaidAt: null,
          centres: [],
        },
      };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

for (const width of [360, 768, 1280]) {
  test(`staff account menu shows name and email at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await fixture(page);
    await page.goto(staffUrl + '/?section=pickup');
    await expect(
      page.getByRole('heading', { name: 'Pickup desk', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.lv-staff-brand')).not.toContainText(
      'Core Admin',
    );
    await page.getByLabel('Open account menu').click();
    const card = page.locator('.lv-staff-account-name');
    await expect(card.locator('strong')).toHaveText('Adaeze Okafor');
    await expect(card.locator('small')).toHaveText(
      'adaeze.okafor@lotvanta.example',
    );
    await expect(card).not.toContainText('Core Admin');
    expect(await card.getByText('Adaeze Okafor').count()).toBe(1);
    const size = await card
      .locator('small')
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(size).toBeLessThan(13);
    await mkdir('docs/design/staff-account-menu', { recursive: true });
    await page.screenshot({
      path: `docs/design/staff-account-menu/menu-${width}.png`,
    });
  });
}
