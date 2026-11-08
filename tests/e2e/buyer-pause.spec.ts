import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const origin = process.env.BUYER_BROWSER_URL ?? 'http://localhost:3300';
const api = process.env.BUYER_API_URL ?? 'http://localhost:4000';
async function fixture(page: Page) {
  let pausedAt: number | undefined;
  let endsAt = Date.now() + 1200000;
  const signals: (() => void)[] = [];
  await page.routeWebSocket(/socket\.io/, (socket) => {
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
          JSON.stringify([
            'auction:control',
            {
              paused: pausedAt !== undefined,
              revision: (pausedAt === undefined ? 'a' : 'b').repeat(64),
              serverTime: new Date().toISOString(),
            },
          ]),
      );
    signals.push(signal);
    socket.onMessage((message) => {
      const text = String(message);
      if (text.startsWith('40')) {
        socket.send('40' + JSON.stringify({ sid: 'buyer-pause' }));
        signal();
      }
      const match = /^42(\d+)(\[.*\])$/.exec(text);
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
      if (result) socket.send('43' + match[1] + JSON.stringify([result]));
    });
  });
  const id = '10000000-0000-4000-8000-000000000090';
  await page.route(api + '/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
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
      pausedAt = Date.now();
      signals.forEach((send) => send());
    },
    resume() {
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
