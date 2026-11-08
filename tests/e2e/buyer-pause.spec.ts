import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const origin = process.env.BUYER_BROWSER_URL ?? 'http://localhost:3300';
const api = process.env.BUYER_API_URL ?? 'http://localhost:4000';
for (const guest of [true, false]) {
  test(`global pause popup on any page for ${guest ? 'guests' : 'signed-in buyers'}`, async ({
    page,
  }) => {
    const controls = await fixture(page, guest);
    await page.goto(origin + '/privacy-policy');
    await page
      .getByRole('button', { name: 'Use necessary cookies', exact: true })
      .click();
    controls.pause();
    const dialog = page.getByRole('dialog', {
      name: 'Bidding is temporarily paused',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    if (guest) {
      const close = dialog.getByRole('button', {
        name: 'Close dialog',
        exact: true,
      });
      const red = await close.evaluate((node) => getComputedStyle(node).color);
      await expect(close).toHaveCSS('cursor', 'pointer');
      await close.hover();
      await expect(close).toHaveCSS('background-color', red);
      await expect(close).toHaveCSS('color', 'rgb(255, 255, 255)');
    }
    await expect(dialog).toContainText('any reserved bid funds are preserved');
    await mkdir('docs/design/global-pause-notice', { recursive: true });
    if (guest)
      for (const width of [360, 768, 1280]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.screenshot({
          path: `docs/design/global-pause-notice/${width}.png`,
          animations: 'disabled',
        });
      }
    await dialog
      .getByRole('button', { name: 'Continue browsing', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Read update', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Policies and privacy', exact: true })
      .getByRole('link', { name: 'Terms of Use', exact: true })
      .click();
    await expect(page).toHaveURL(/terms-of-use/);
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Read update', exact: true }),
    ).toBeVisible();
    await expect(dialog).not.toBeVisible();
    controls.resume();
    await expect(
      page.getByText('Bidding has resumed', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Read update', exact: true }),
    ).toHaveCount(0);
    controls.pause();
    await expect(dialog).toBeVisible();
  });
}
async function fixture(page: Page, guest = false) {
  let controlCounter = 0;
  let pausedAt: number | undefined;
  let endsAt = Date.now() + 1200000;
  const signals: (() => void)[] = [];
  await page.routeWebSocket(/socket\.io/, (socket) => {
    let namespace = '';
    socket.send(
      '0' +
        JSON.stringify({
          sid: 'buyer-pause',
          upgrades: [],
          pingInterval: 25000,
          pingTimeout: 20000,
          maxPayload: 1000000,
        }),
    );
    const signal = () =>
      socket.send(
        '42' +
          namespace +
          JSON.stringify([
            'auction:control',
            {
              paused: pausedAt !== undefined,
              revision: controlCounter.toString(16).padStart(64, '0'),
              serverTime: new Date().toISOString(),
            },
          ]),
      );
    signals.push(signal);
    socket.onClose(() => {
      const index = signals.indexOf(signal);
      if (index >= 0) signals.splice(index, 1);
    });
    socket.onMessage((message) => {
      const text = String(message);
      if (text.startsWith('40')) {
        namespace = text.startsWith('40/public,') ? '/public,' : '';
        socket.send('40' + namespace + JSON.stringify({ sid: 'buyer-pause' }));
        signal();
      }
      const match = /^42(?:\/public,)?(\d+)(\[.*\])$/.exec(text);
      if (!match) return;
      const [event, input] = JSON.parse(match[2]) as [
        string,
        { lotId?: string },
      ];
      let result: unknown;
      if (event === 'clock:sync')
        result = { serverTime: new Date().toISOString() };
      if (event === 'lot:subscribe')
        result = {
          ok: true,
          lot: {
            lotId: input.lotId,
            currentPriceKobo: 100000,
            endsAt: new Date(endsAt).toISOString(),
            serverTime: new Date().toISOString(),
            streamId: '1-0',
            isLeader: false,
            ...(pausedAt === undefined ? {} : { pausedAt }),
          },
        };
      if (result)
        socket.send('43' + namespace + match[1] + JSON.stringify([result]));
    });
  });
  const id = '10000000-0000-4000-8000-000000000090';
  await page.route(api + '/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (guest && path === '/auth/refresh') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{}',
      });
      return;
    }
    let body: unknown;
    if (path === '/auth/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id,
          name: 'Ada Okafor',
          email: 'buyer@example.test',
          role: 'buyer',
          status: 'active',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: false,
        },
      };
    else if (path === '/wallet')
      body = {
        id,
        userId: id,
        currency: 'NGN',
        availableKobo: 100000000,
        heldKobo: 0,
        totalKobo: 100000000,
      };
    else if (path.endsWith('/bid-cancellation'))
      body = {
        commitment: null,
        canRequest: false,
        blocked: false,
        conversation: null,
      };
    else if (path === '/buyers/notifications/summary')
      body = { unread: 0, awaitingPickup: 0 };
    else if (path === '/buyers/watchlist/count') body = { count: 0 };
    else if (path === '/buyers/notifications/messages')
      body = { items: [], nextCursor: null };
    else return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return {
    pause() {
      controlCounter++;
      pausedAt = Date.now();
      signals.forEach((send) => send());
    },
    resume() {
      controlCounter++;
      endsAt += Date.now() - (pausedAt ?? Date.now());
      pausedAt = undefined;
      signals.forEach((send) => send());
    },
  };
}
test('freezes homepage card countdowns without removing the cards', async ({
  page,
}) => {
  const controls = await fixture(page);
  await page.goto(origin);
  const card = page.locator('.agn-lot').first();
  const action = card.locator('.agn-lot-body > .agn-button');
  await expect(action).toHaveText('Bid now');
  controls.pause();
  await page
    .getByRole('dialog', { name: 'Bidding is temporarily paused', exact: true })
    .getByRole('button', { name: 'Continue browsing', exact: true })
    .click();
  await expect(action).toHaveText('Bidding paused');
  const timer = card.locator('.agn-countdown');
  const frozen = await timer.textContent();
  await page.waitForTimeout(2200);
  await expect(timer).toHaveText(frozen ?? '');
  controls.resume();
  await expect(action).toHaveText('Bid now');
});

test('freezes catalogue timers and disables bidding until resumed', async ({
  page,
}) => {
  const controls = await fixture(page);
  await page.goto(origin + '/search');
  const card = page.locator('.agn-lot').first();
  await expect(
    card.getByRole('button', { name: 'Bid now', exact: true }),
  ).toBeEnabled();
  controls.pause();
  await page
    .getByRole('dialog', { name: 'Bidding is temporarily paused', exact: true })
    .getByRole('button', { name: 'Continue browsing', exact: true })
    .click();
  await expect(
    card.getByRole('button', { name: 'Bidding paused', exact: true }),
  ).toBeDisabled();
  const timer = card.locator('.agn-countdown');
  const frozen = await timer.textContent();
  await page.waitForTimeout(2200);
  await expect(timer).toHaveText(frozen ?? '');
  controls.resume();
  await expect(
    card.getByRole('button', { name: 'Bid now', exact: true }),
  ).toBeEnabled();
});
test('freezes the item countdown and greys the signed-in bid button', async ({
  page,
  request,
}) => {
  const response = await request.get(api + '/lots?limit=1');
  const catalogue = (await response.json()) as { items: { id: string }[] };
  expect(catalogue.items.length).toBeGreaterThan(0);
  const controls = await fixture(page);
  await page.goto(origin + '/lots/' + catalogue.items[0].id);
  await page.getByLabel('Your bid amount', { exact: true }).fill('5000');
  const bid = page
    .getByRole('region', { name: 'Auction bidding', exact: true })
    .getByRole('button', { name: 'Bid now', exact: true });
  await expect(bid).toBeEnabled();
  controls.pause();
  await page
    .getByRole('dialog', { name: 'Bidding is temporarily paused', exact: true })
    .getByRole('button', { name: 'Continue browsing', exact: true })
    .click();
  await expect(bid).toBeDisabled();
  const timer = page.locator('.agn-detail-summary .agn-countdown');
  await expect(
    page.getByText('Bidding is temporarily paused.', { exact: false }),
  ).toBeVisible();
  const frozen = await timer.textContent();
  await page.waitForTimeout(2200);
  await expect(timer).toHaveText(frozen ?? '');
  await mkdir('docs/design/buyer-pause', { recursive: true });
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `docs/design/buyer-pause/${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  controls.resume();
  await expect(bid).toBeEnabled();
});
