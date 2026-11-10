import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const origin = process.env.BUYER_BROWSER_URL ?? 'http://localhost:3310';
const id = (n: number) =>
  '10000000-0000-4000-8000-' + n.toString().padStart(12, '0');
async function setup(page: Page) {
  const old = {
    id: id(1),
    title: 'LotVanta item update: An older update',
    href: '/lots/' + id(99),
    createdAt: new Date(Date.now() - 60000).toISOString(),
    readAt: null as string | null,
  };
  let items = [old],
    reads = 0;
  await page.route(/^http:\/\/localhost:(4000|4400)\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id: id(90),
          name: 'Ada Okafor',
          role: 'buyer',
          status: 'active',
          email: 'buyer@example.test',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: false,
        },
      };
    else if (path === '/buyers/notifications/messages') {
      reads++;
      body = { items: items.filter((item) => !item.readAt), nextCursor: null };
    } else if (path === '/buyers/notifications')
      body = { items, nextCursor: null };
    else if (path === '/buyers/notifications/summary')
      body = {
        unread: items.filter((item) => !item.readAt).length,
        awaitingPickup: 0,
      };
    else if (path === '/buyers/watchlist/count') body = { count: 0 };
    else if (path === '/buyers/notifications/read') {
      const input = route.request().postDataJSON() as { ids: string[] };
      items = items.map((item) =>
        input.ids.includes(item.id)
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      );
      body = { updated: input.ids.length };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(origin + '/privacy-policy');
  await expect.poll(() => reads).toBeGreaterThan(0);
  return {
    send: () => {
      items = [
        {
          ...old,
          id: id(2),
          title:
            'LotVanta item update: Collection opens at 9am. Please bring your pickup pass.',
          createdAt: new Date().toISOString(),
          readAt: null,
        },
        ...items,
      ];
    },
    items: () => items,
  };
}
test('shows a tappable new-message banner and opens the complete message', async ({
  page,
}) => {
  const fixture = await setup(page);
  const banner = page.getByRole('button', {
    name: 'Read new message from LotVanta',
    exact: true,
  });
  await expect(banner).toHaveCount(0);
  fixture.send();
  await expect(banner).toBeVisible({ timeout: 12000 });
  await mkdir('docs/design/bidder-message-banner', { recursive: true });
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `docs/design/bidder-message-banner/banner-${width}.png`,
      animations: 'disabled',
    });
  }
  await banner.click();
  const dialog = page.getByRole('dialog', {
    name: 'Message from LotVanta',
    exact: true,
  });
  await expect(dialog).toContainText(
    'Collection opens at 9am. Please bring your pickup pass.',
  );
  await expect
    .poll(() => fixture.items().find((item) => item.id === id(2))?.readAt)
    .not.toBeNull();
  await expect(
    dialog.getByRole('button', { name: 'View item', exact: true }),
  ).toBeVisible();
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `docs/design/bidder-message-banner/read-${width}.png`,
      animations: 'disabled',
    });
  }
});
test('dismisses without marking read and does not replay the banner on another refresh', async ({
  page,
}) => {
  const fixture = await setup(page);
  fixture.send();
  await page
    .getByRole('button', { name: 'Dismiss message notification', exact: true })
    .click({ timeout: 12000 });
  expect(fixture.items().find((item) => item.id === id(2))?.readAt).toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('button', {
      name: 'Read new message from LotVanta',
      exact: true,
    }),
  ).toHaveCount(0);
});
