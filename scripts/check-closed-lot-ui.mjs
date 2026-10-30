import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
/* global localStorage,document,innerWidth,setInterval,clearInterval */
const closedId = '78d1a399-4b2b-48e3-aa13-9d2342d9f977';
const dir = 'docs/design/closed-lot';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const review = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/lots/' + closedId);
    const result = page.getByRole('region', {
      name: 'Auction result',
      exact: true,
    });
    await result.getByText('Sold', { exact: true }).waitFor();
    assert.equal(
      await result.locator('.agn-price').innerText(),
      '\u20a612,250',
    );
    assert.equal(
      await page
        .getByRole('link', { name: 'Join Now to Bid', exact: true })
        .count(),
      0,
    );
    assert.equal(await result.getByText(/Reconnecting/).count(), 0);
    assert.equal(
      await result
        .getByRole('link', { name: 'Browse auctions', exact: true })
        .evaluate((node) => node.getBoundingClientRect().height >= 44),
      true,
    );
    assert.equal(await page.locator('.agn-bid-bar').count(), 0);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const related = page.locator('.agn-buyer-rail .agn-price').first();
    if (await page.locator('.agn-buyer-rail').count())
      await related.waitFor({ timeout: 15000 });
    await page.screenshot({
      path: dir + '/closed-' + width + '.png',
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    review.push({
      width,
      actualClosedLot: true,
      finalPriceKobo: 1225000,
      noReconnecting: true,
      noBidControls: true,
    });
    await context.close();
  }
  const lot = (await (await fetch('http://localhost:4000/lots?limit=1')).json())
    .items[0];
  assert.ok(lot);
  const context = await browser.newContext({
    viewport: { width: 360, height: 1000 },
    reducedMotion: 'reduce',
  });
  let phase = 'open',
    fail = false,
    resultReads = 0;
  const state = {
    lotId: lot.id,
    currentPriceKobo: lot.startPriceKobo,
    endsAt: new Date(Date.now() + 60000).toISOString(),
    streamId: '1-0',
    serverTime: new Date().toISOString(),
    isLeader: false,
  };
  const peers = new Set();
  await context.addInitScript(() =>
    localStorage.setItem(
      'auction-ng-cookie-notice',
      JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
    ),
  );
  await context.routeWebSocket('ws://localhost:4001/socket.io/**', (socket) => {
    peers.add(socket);
    socket.send(
      '0' +
        JSON.stringify({
          sid: randomUUID(),
          upgrades: [],
          pingInterval: 25000,
          pingTimeout: 20000,
          maxPayload: 1000000,
        }),
    );
    const heartbeat = setInterval(
      () =>
        socket.send(
          '42' +
            JSON.stringify([
              'serverTime',
              { serverTime: new Date().toISOString() },
            ]),
        ),
      4000,
    );
    socket.onClose(() => {
      clearInterval(heartbeat);
      peers.delete(socket);
    });
    socket.onMessage((raw) => {
      const message = String(raw);
      if (message.startsWith('40')) {
        const ns = message.startsWith('40/public,') ? '/public,' : '';
        socket.send('40' + ns + JSON.stringify({ sid: randomUUID() }));
        return;
      }
      const parsed = message.match(/^42(\/public,)?(\d+)(\[.*\])$/);
      if (!parsed) return;
      const [event, input] = JSON.parse(parsed[3]);
      const value =
        event === 'clock:sync'
          ? { serverTime: new Date().toISOString() }
          : { ok: true, lot: { ...state, lotId: input.lotId } };
      socket.send(
        '43' + (parsed[1] ?? '') + parsed[2] + JSON.stringify([value]),
      );
    });
  });

  await context.route('http://localhost:4000/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/refresh')
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{}',
      });
    if (path === '/lots/' + lot.id + '/result') {
      resultReads++;
      return route.fulfill({
        status: fail ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lotId: lot.id,
          state: phase,
          finalPriceKobo: phase === 'sold' ? 1225000 : null,
          serverTime: new Date().toISOString(),
        }),
      });
    }
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3300/lots/' + lot.id);
  await page
    .getByRole('link', { name: 'Join Now to Bid', exact: true })
    .waitFor();
  await page.locator('.agn-detail-summary .agn-price').waitFor();
  assert.equal(
    await page
      .getByRole('region', { name: 'Auction result', exact: true })
      .count(),
    0,
  );
  // A live soft-close extension remains an open auction; local elapsed time does not fabricate a sale.
  state.endsAt = new Date(Date.now() + 180000).toISOString();
  state.streamId = '2-0';
  for (const peer of peers)
    peer.send('42/public,' + JSON.stringify(['lot:update', state]));
  assert.equal(
    await page
      .getByRole('region', { name: 'Auction result', exact: true })
      .count(),
    0,
  );
  phase = 'closing';
  for (const peer of peers)
    peer.send('42/public,' + JSON.stringify(['realtime:unavailable', {}]));
  const result = page.getByRole('region', {
    name: 'Auction result',
    exact: true,
  });
  await result
    .getByText(/result is being confirmed/)
    .waitFor({ timeout: 8000 });
  assert.equal(
    await page
      .getByRole('link', { name: 'Join Now to Bid', exact: true })
      .count(),
    0,
  );
  phase = 'sold';
  await result.getByText('Sold', { exact: true }).waitFor({ timeout: 8000 });
  assert.equal(await result.locator('.agn-price').innerText(), '\u20a612,250');
  fail = true;
  const finalReads = resultReads;
  await expect(result.getByText('Sold', { exact: true })).toBeVisible();
  await page.waitForTimeout(5500);
  assert.equal(
    resultReads,
    finalReads,
    'Confirmed terminal results stop polling',
  );
  await expect(result.getByText('Sold', { exact: true })).toBeVisible();
  assert.equal(await result.getByText(/Reconnecting/).count(), 0);
  await result.screenshot({ path: dir + '/automatic-result-360.png' });
  review.push({
    automaticTransition: true,
    softCloseNotMarkedSold: true,
    retainsConfirmedResultOnOutage: true,
  });
  await context.close();
  writeFileSync(dir + '/review.json', JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify(review));
} finally {
  await browser.close();
}
