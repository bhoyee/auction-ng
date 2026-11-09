import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
const url = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
async function fixture(page: Page, read = true, live = false) {
  const id = randomUUID(),
    now = new Date().toISOString(),
    buyer = { id: randomUUID(), name: 'Ada Okafor' };
  const lot = {
    id: randomUUID(),
    reference: 'LV8J7H6G',
    title: 'Samsung Galaxy S24 Ultra',
    status: live ? 'open' : 'closed',
    condition: 'open_box',
    category: 'Phones',
    location: 'Ikeja collection centre',
    startAt: now,
    endAt: now,
    archived: false,
    startingPriceKobo: 50000,
    bidCount: 12,
    preBidCount: 1,
  };
  let failed = false;
  const entries = Array.from({ length: 12 }, (_, n) => ({
    id: randomUUID(),
    reference: randomUUID(),
    buyer: n ? { id: randomUUID(), name: 'Buyer ' + n } : buyer,
    createdAt: now,
    updatedAt: null,
    kind: 'Full amount bid',
    status: 'accepted',
    round: 0,
    publicPriceKobo: 1234567800,
    directAmountKobo: 1234567800,
  }));
  await page.route('http://localhost:4000/**', async (route) => {
    const u = new URL(route.request().url()),
      path = u.pathname;
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/staff/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id,
          name: 'Warehouse admin',
          role: 'admin',
          status: 'active',
          email: 'ada@example.test',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: false,
        },
      };
    else if (path === '/staff/me')
      body = {
        name: 'Warehouse admin',
        roleName: 'Admin',
        permissions: [
          'dashboard.view',
          'pickup.manage',
          ...(read ? ['bids.read'] : []),
        ],
      };
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
          live: 12,
          scheduled: 4,
          drafts: 2,
          pickup: 3,
          support: 1,
          paidSalesKobo: 1234567800,
          refundsKobo: 0,
          paidOrders: 12,
        },
        sales: [],
        lots: [],
      };
    else if (path === '/staff/bid-review')
      body = {
        items: u.searchParams.get('search') === 'missing' ? [] : [lot],
        nextCursor: null,
      };
    else if (path.endsWith('/open'))
      body = { id: lot.id, message: 'Bid review recorded.' };
    else if (path === '/staff/bid-review/' + lot.id) {
      if (failed) {
        await route.fulfill({ status: 503, body: '{}' });
        return;
      }
      const prebid = u.searchParams.get('view') === 'prebids',
        q = u.searchParams.get('search') ?? '',
        offset = u.searchParams.has('cursor') ? 10 : 0;
      const filtered = prebid
        ? [
            {
              ...entries[0],
              kind: 'Private pre-bid',
              status: 'launched',
              publicPriceKobo: null,
              directAmountKobo: null,
              updatedAt: now,
            },
          ]
        : entries.filter((entry) => entry.buyer.name.includes(q));
      body = {
        lot,
        description: 'Inspected demo handset with accessories.',
        retailPriceKobo: 1500000000,
        fixedPriceKobo: null,
        round: 0,
        serverTime: now,
        lastRecordedAt: now,
        lastRecordedPriceKobo: 1234567800,
        recordedLeader: buyer,
        result: {
          type: 'auction',
          buyer,
          priceKobo: 1234567800,
          closedAt: now,
          status: 'paid',
          invoiceNumber: 'INV8J7H6G',
          invoiceStatus: 'paid',
        },
        entries: filtered.slice(offset, offset + 10),
        nextCursor: !offset && filtered.length > 10 ? id : null,
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(url + '/?section=bid-review');
  return {
    lotId: lot.id,
    addBid: () => {
      lot.bidCount++;
      if (entries[0])
        entries[0].buyer = { id: randomUUID(), name: 'New bidder' };
    },
    fail: (value: boolean) => {
      failed = value;
    },
  };
}
test('counts and item history reconcile automatically without a manual refresh', async ({
  page,
}) => {
  const state = await fixture(page);
  await expect(
    page.getByText('12 accepted bids', { exact: true }),
  ).toBeVisible();
  state.addBid();
  await expect(page.getByText('13 accepted bids', { exact: true })).toBeVisible(
    { timeout: 7500 },
  );
  await expect(
    page.getByText('Loading auction records…', { exact: true }),
  ).not.toBeVisible();
  await page.getByRole('button', { name: 'View bids', exact: true }).click();
  await expect(
    page
      .getByRole('table', { name: 'Item bid history' })
      .getByText('New bidder', { exact: true }),
  ).toBeVisible();
  await page.getByRole('searchbox').fill('Buyer 3');
  await expect(
    page.getByRole('table', { name: 'Item bid history' }).locator('tbody tr'),
  ).toHaveCount(1);
  state.addBid();
  await page.waitForTimeout(5500);
  await expect(page.getByRole('searchbox')).toHaveValue('Buyer 3');
  await expect(
    page.getByRole('table', { name: 'Item bid history' }).locator('tbody tr'),
  ).toHaveCount(1);
});
test('live lot events refresh visible counts before the polling interval', async ({
  page,
}) => {
  let send: ((value: string) => void) | undefined;
  let watched: string | undefined;
  const liveLot = (lotId: string, streamId: string) => ({
    lotId,
    currentPriceKobo: 50000,
    endsAt: new Date(Date.now() + 60000).toISOString(),
    streamId,
    serverTime: new Date().toISOString(),
    isLeader: false,
  });
  await page.routeWebSocket(/localhost:4001\/socket.io\//, (socket) => {
    socket.send(
      '0' +
        JSON.stringify({
          sid: 'synthetic',
          upgrades: [],
          pingInterval: 25000,
          pingTimeout: 20000,
          maxPayload: 1000000,
        }),
    );
    socket.onMessage((message) => {
      if (typeof message !== 'string') return;
      if (message.startsWith('40/public')) {
        send = (value) => socket.send(value);
        socket.send('40/public,' + JSON.stringify({ sid: 'synthetic-public' }));
        return;
      }
      if (message.startsWith('40')) {
        socket.send('40' + JSON.stringify({ sid: 'synthetic-staff' }));
        return;
      }
      const match = /^42\/public,(\d+)(\[.*)$/.exec(message);
      if (!match?.[1] || !match[2]) return;
      const payload: unknown = JSON.parse(match[2]);
      if (!Array.isArray(payload)) return;
      if (
        payload[0] === 'lot:subscribe' &&
        payload[1] &&
        typeof payload[1] === 'object' &&
        'lotId' in payload[1] &&
        typeof payload[1].lotId === 'string'
      ) {
        const lotId: string = payload[1].lotId;
        watched = lotId;
        socket.send(
          '43/public,' +
            match[1] +
            JSON.stringify([{ ok: true, lot: liveLot(lotId, '1-0') }]),
        );
      } else if (payload[0] === 'clock:sync')
        socket.send(
          '43/public,' +
            match[1] +
            JSON.stringify([{ serverTime: new Date().toISOString() }]),
        );
    });
  });
  const state = await fixture(page, true, true);
  await expect(
    page.getByText('12 accepted bids', { exact: true }),
  ).toBeVisible();
  await expect.poll(() => watched).toBe(state.lotId);
  state.addBid();
  if (!send) throw Error('Public socket did not connect');
  send(
    '42/public,' + JSON.stringify(['lot:update', liveLot(state.lotId, '2-0')]),
  );
  await expect(page.getByText('13 accepted bids', { exact: true })).toBeVisible(
    { timeout: 2500 },
  );
});
test('staff can inspect bidders, winner and pre-bids with live search and pagination', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.getByRole('button', { name: 'View bids', exact: true }).click();
  await expect(page.getByText('Winner', { exact: true })).toBeVisible();
  await expect(page.getByText('INV8J7H6G', { exact: true })).toBeVisible();
  const table = page.getByRole('table', { name: 'Item bid history' });
  await expect(table.locator('tbody tr')).toHaveCount(10);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  const search = page.getByRole('searchbox');
  await search.fill('Buyer 3');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(search).toBeFocused();
  await expect(table.getByText('Buyer 3', { exact: true })).toBeVisible();
  state.fail(true);
  await page.evaluate(() =>
    window.dispatchEvent(new Event('lotvanta:staff-refresh')),
  );
  await expect(page.locator('.lv-staff-message[role="alert"]')).toContainText(
    'Bid records could not be refreshed',
  );
  await expect(table.getByText('Buyer 3', { exact: true })).toBeVisible();
  state.fail(false);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.lv-staff-message[role="alert"]')).toHaveCount(0);
  await search.fill('');
  await page.getByRole('button', { name: 'Pre-bids', exact: true }).click();
  await expect(
    table.getByText('Private pre-bid', { exact: true }),
  ).toBeVisible();
  await expect(
    table.getByText('Private limit hidden', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Back to auction records', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'View bids', exact: true }),
  ).toBeVisible();
});
test('bid review navigation is hidden without the read permission', async ({
  page,
}) => {
  await fixture(page, false);
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening), / }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Bid review', exact: true }),
  ).toHaveCount(0);
});
for (const width of [360, 768, 1280])
  test(
    'bid review and prominent overview action at ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await fixture(page);
      await expect(
        page.getByRole('button', { name: 'View bids', exact: true }),
      ).toBeVisible();
      await mkdir('docs/design/staff-bid-review', { recursive: true });
      await page.screenshot({
        path: 'docs/design/staff-bid-review/list-' + width + '.png',
        fullPage: true,
      });
      await page
        .getByRole('button', { name: 'View bids', exact: true })
        .click();
      await expect(page.getByText('Winner', { exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: 'docs/design/staff-bid-review/detail-' + width + '.png',
        fullPage: true,
      });
      if (width < 768)
        await page
          .getByRole('button', { name: 'Open staff navigation' })
          .click();
      await page.getByRole('button', { name: 'Overview', exact: true }).click();
      const action = page
        .locator('.lv-staff-heading')
        .getByRole('button', { name: 'Check in a buyer', exact: true });
      await expect(action).toBeVisible();
      expect(
        await action.evaluate((element) => getComputedStyle(element).fontSize),
      ).toBe('18px');
      expect(
        await action.evaluate(
          (element) => getComputedStyle(element).fontWeight,
        ),
      ).toBe('800');
      expect((await action.boundingBox())?.height).toBeGreaterThanOrEqual(56);
      await page.screenshot({
        path: 'docs/design/staff-bid-review/overview-' + width + '.png',
        fullPage: true,
      });
    },
  );
