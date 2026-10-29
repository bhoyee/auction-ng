import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const source = (
  await (await fetch('http://localhost:4000/lots?limit=1')).json()
).items[0];
if (!source) throw new Error('A local demo lot is required.');
const browser = await chromium.launch();
const dir = 'docs/design/watchlist-tabs';
mkdirSync(dir, { recursive: true });
const reviews = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const owner = {
      id: randomUUID(),
      name: 'Amina Yusuf',
      email: 'amina@example.test',
      role: 'buyer',
      status: 'active',
      emailVerified: true,
      phoneVerified: false,
      phone: null,
      address: null,
      passwordSet: true,
    };
    const token = randomBytes(32).toString('base64url');
    const endsAt = new Date(Date.now() + 3 * 3600000).toISOString();
    const entry = {
      id: source.id,
      title: source.title,
      lotNumber: source.lotNumber,
      thumbnailUrl: source.thumbnail?.thumbnailUrl ?? null,
      startPriceKobo: source.startPriceKobo,
      retailPriceKobo: source.retailPriceKobo,
      finalPriceKobo: null,
      locationName: 'Lekki collection centre',
      locationAddress: 'Admiralty Way, Lekki, Lagos',
      endsAt,
      outcome: 'watching',
    };
    let bidWrites = 0;
    let removed = false,
      ended = false,
      failure = false;
    const sockets = [];
    const live = () => ({
      lotId: source.id,
      currentPriceKobo: 2500000,
      endsAt: ended ? new Date(Date.now() - 1000).toISOString() : endsAt,
      streamId: ended ? '2-0' : '1-0',
      serverTime: new Date().toISOString(),
      isLeader: false,
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const query = new URL(route.request().url()).searchParams;
      const json = (value, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
        });
      if (path.startsWith('/bids/') && route.request().method() !== 'GET') {
        bidWrites++;
        return json({}, 500);
      }
      if (path === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user: owner });
      if (path === '/wallet')
        return json({
          id: owner.id,
          userId: owner.id,
          currency: 'NGN',
          availableKobo: 10000000,
          heldKobo: 0,
          totalKobo: 10000000,
        });
      if (path === '/buyers/notifications')
        return json({ items: [], nextCursor: null });
      if (path === '/buyers/watchlist/count')
        return json({ count: removed ? 0 : 3 });
      if (path === '/buyers/watchlist/status')
        return json({ lotIds: removed ? [] : [source.id] });
      if (path === '/buyers/watchlist/activity') {
        if (failure) return json({}, 503);
        const view = query.get('view');
        const item = {
          ...entry,
          outcome:
            view === 'won' ? 'won' : view === 'lost' ? 'unsold' : 'watching',
          finalPriceKobo: view === 'won' ? 2500000 : null,
        };
        return json({
          items: removed || (view === 'watching' && ended) ? [] : [item],
          nextCursor: null,
        });
      }
      if (path === `/buyers/watchlist/${source.id}`) {
        removed = true;
        return json({ watching: false });
      }
      return route.continue();
    });
    await context.routeWebSocket(/localhost:4001\/socket.io\//, (ws) => {
      sockets.push(ws);
      ws.send(
        '0' +
          JSON.stringify({
            sid: randomUUID(),
            upgrades: [],
            pingInterval: 25000,
            pingTimeout: 20000,
          }),
      );
      ws.onMessage((message) => {
        const text = String(message);
        if (text.startsWith('40'))
          ws.send('40' + JSON.stringify({ sid: randomUUID() }));
        const match = text.match(/^42(\d+)(\[.*)$/);
        if (!match) return;
        const [event] = JSON.parse(match[2]);
        if (event === 'lot:subscribe')
          ws.send(
            '43' + match[1] + JSON.stringify([{ ok: true, lot: live() }]),
          );
        if (event === 'clock:sync')
          ws.send(
            '43' +
              match[1] +
              JSON.stringify([{ serverTime: new Date().toISOString() }]),
          );
      });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/watchlist');
    await page
      .getByRole('heading', { name: source.title, exact: true })
      .waitFor();
    await page.getByRole('textbox', { name: 'Your bid (₦)' }).fill('30000');
    const bid = page.getByRole('button', { name: 'Bid now', exact: true });
    assert.equal(await bid.isEnabled(), true);
    assert.equal(
      await page.locator('.agn-watch-card-pickup').textContent(),
      'Lekki collection centreAdmiralty Way, Lekki, Lagos',
    );
    assert.equal(await page.getByRole('tab').count(), 3);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.locator('.agn-watch-card-image img').waitFor();
    await page.waitForFunction(() => {
      const image = document.querySelector('.agn-watch-card-image img');
      return image?.complete && image.naturalWidth > 0;
    });
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `${dir}/watching-${width}.png`,
      fullPage: true,
    });
    await bid.click();
    await page.waitForURL(/amountKobo=3000000/);
    await page
      .getByRole('heading', { name: 'Confirm your bid', exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'Place bid ₦30,000', exact: true })
      .waitFor();
    assert.equal(bidWrites, 0);
    // Opening fee review must never send a prepare/confirm request.
    await page.goto('http://localhost:3300/watchlist');
    await page.getByRole('tab', { name: 'Won', exact: true }).click();
    await page
      .locator('.agn-watch-card-timer')
      .getByText('Won', { exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Bid now', exact: true }).count(),
      0,
    );
    await page.screenshot({ path: `${dir}/won-${width}.png`, fullPage: true });
    await page.getByRole('tab', { name: 'Lost', exact: true }).click();
    await page.getByText('Ended unsold', { exact: true }).waitFor();
    await page.screenshot({ path: `${dir}/lost-${width}.png`, fullPage: true });
    await page.getByRole('tab', { name: 'Watching', exact: true }).click();
    await page
      .getByRole('heading', { name: source.title, exact: true })
      .waitFor();
    ended = true;
    for (const ws of sockets) {
      try {
        ws.send('42' + JSON.stringify(['lot:update', live()]));
      } catch {
        /* Old navigation socket is closed. */
      }
    }
    await page
      .getByRole('heading', { name: 'No active items saved', exact: true })
      .waitFor();
    ended = false;
    await page.reload();
    await page
      .getByRole('button', { name: `Unwatch ${source.title}`, exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'No active items saved', exact: true })
      .waitFor();
    await page.locator('.agn-watch-link [data-watchlist-count="0"]').waitFor();
    failure = true;
    await page.reload();
    await page
      .getByRole('heading', { name: 'Watchlist unavailable', exact: true })
      .waitFor();
    failure = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page
      .getByRole('heading', { name: 'No active items saved', exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    reviews.push({
      width,
      tabs: true,
      feeReviewAmount: true,
      liveExpiry: true,
      unwatchCounts: true,
      errorRetry: true,
      noOverflow: true,
      errors,
    });
    await context.close();
  }
  writeFileSync(`${dir}/review.json`, JSON.stringify(reviews, null, 2) + '\n');
  console.log(JSON.stringify(reviews));
} finally {
  await browser.close();
}
/* global localStorage, document, innerWidth, window */
