import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage, window, document, Event */
const dir = 'docs/design/buyer-bids';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const user = {
      id: randomUUID(),
      name: 'Amina Yusuf',
      email: 'buyer@example.test',
      role: 'buyer',
      status: 'active',
      emailVerified: true,
      phone: null,
      phoneVerified: false,
      address: null,
      passwordSet: true,
    };
    const token = randomBytes(32).toString('base64url');
    const entries = Array.from({ length: 11 }, (_, i) => ({
      id: randomUUID(),
      lot: {
        id: randomUUID(),
        lotNumber: `A7Q9M2P${i}`,
        title: [
          'Wireless noise-cancelling headphones',
          'Samsung Galaxy smartphone',
          'Dell business laptop',
          'Smart watch with charging cable',
        ][i % 4],
        status: i < 2 ? 'open' : 'closed',
        thumbnailUrl:
          i === 10
            ? null
            : `http://localhost:3300/demo/${['hero-headphones.webp', 'phones-thumb.webp', 'computers-thumb.webp', 'electronics-thumb.webp'][i % 4]}`,
      },
      amountKobo: 1250000 + i * 10000,
      automatic: i % 2 === 0,
      outcome: i < 2 ? 'pending' : ['won', 'lost', 'cancelled'][i % 3],
      createdAt: '2026-11-01T09:00:00.000Z',
    }));
    let fail = false,
      empty = false,
      writes = 0;
    const requests = [];
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const url = new URL(route.request().url());
      const json = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      if (url.pathname === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (route.request().method() !== 'GET') writes++;
      if (url.pathname === '/buyers/bids') {
        assert.equal(url.searchParams.get('limit'), '10');
        const cursor = url.searchParams.get('cursor');
        requests.push(cursor);
        if (fail) return json({}, 503);
        return json({
          items: empty ? [] : cursor ? entries.slice(10) : entries.slice(0, 10),
          nextCursor: !empty && !cursor ? 'older-bids' : null,
        });
      }
      if (url.pathname === '/wallet')
        return json({
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: 0,
          heldKobo: 0,
          totalKobo: 0,
        });
      if (url.pathname === '/buyers/watchlist/count') return json({ count: 0 });
      if (url.pathname === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 0 });
      return json({ items: [], nextCursor: null });
    });
    await context.routeWebSocket(/localhost:4001\/socket.io\//, (ws) => {
      ws.send(
        '0' +
          JSON.stringify({
            sid: randomUUID(),
            upgrades: [],
            pingInterval: 25000,
            pingTimeout: 20000,
            maxPayload: 1000000,
          }),
      );
      ws.onMessage((raw) => {
        const text = String(raw);
        if (text.startsWith('40'))
          return ws.send('40' + JSON.stringify({ sid: randomUUID() }));
        if (text === '2') return ws.send('3');
        const match = text.match(/^42(\d+)(\[.*)$/);
        if (!match) return;
        const [event, payload] = JSON.parse(match[2]);
        if (event === 'lot:subscribe')
          ws.send(
            '43' +
              match[1] +
              JSON.stringify([
                {
                  ok: true,
                  lot: {
                    lotId: payload.lotId,
                    currentPriceKobo: 1250000,
                    endsAt: new Date(Date.now() + 3600000).toISOString(),
                    streamId: '1-0',
                    serverTime: new Date().toISOString(),
                    isLeader: payload.lotId === entries[0].lot.id,
                  },
                },
              ]),
          );
      });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/my-bids');
    const region = page.getByRole('region', {
      name: 'Your bid history',
      exact: true,
    });
    const panel = region.locator('[role="tabpanel"]:visible');
    const tab = (name) => region.getByRole('tab', { name, exact: true });
    await expect(panel.locator('article')).toHaveCount(10);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await expect(panel.locator('.agn-buyer-bid-status').first()).toHaveText(
      'Winning',
    );
    await expect(panel.locator('.agn-buyer-bid-status').nth(1)).toHaveText(
      'Outbid',
    );
    await expect(tab('All')).toHaveCSS('background-color', 'rgb(28, 42, 107)');
    await expect(tab('Outbid').locator('.agn-buyer-bid-live')).toHaveText(
      'Live',
    );
    await expect(tab('Winning').locator('.agn-buyer-bid-live')).toHaveText(
      'Live',
    );
    for (const name of ['Won', 'Lost', 'Cancelled'])
      await expect(tab(name).locator('.agn-buyer-bid-live')).toHaveCount(0);
    await tab('Won').hover();
    await expect(tab('Won')).toHaveCSS(
      'background-color',
      'rgb(238, 240, 250)',
    );
    await page.screenshot({ path: `${dir}/all-${width}.png`, fullPage: true });
    for (const name of ['Winning', 'Outbid', 'Won', 'Lost', 'Cancelled']) {
      await tab(name).click();
      await expect(tab(name)).toHaveAttribute('aria-selected', 'true');
      await expect(tab(name)).toHaveCSS('background-color', 'rgb(28, 42, 107)');
      const labels = await panel
        .locator('.agn-buyer-bid-status')
        .allTextContents();
      assert.ok(labels.length && labels.every((label) => label === name));
    }
    await page.screenshot({
      path: `${dir}/cancelled-${width}.png`,
      fullPage: true,
    });
    await tab('All').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab('Winning')).toBeFocused();
    await expect(tab('Winning')).toHaveAttribute('aria-selected', 'true');
    await tab('All').click();
    await region.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(panel.locator('article')).toHaveCount(1);
    await expect(region).toContainText('Page 2');
    await expect(
      region.getByRole('button', { name: 'Next', exact: true }),
    ).toBeDisabled();
    await tab('Winning').click();
    await expect(panel.getByRole('status')).toBeVisible();
    await region.getByRole('button', { name: 'Previous', exact: true }).click();
    await tab('All').click();
    await expect(panel.locator('article')).toHaveCount(10);
    assert.ok(requests.includes('older-bids'));
    fail = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Bid history could not be refreshed' }),
    ).toBeVisible();
    await expect(panel.locator('article')).toHaveCount(10);
    fail = false;
    empty = true;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'No bids yet', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `${dir}/empty-${width}.png` });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    assert.equal(writes, 0);
    assert.deepEqual(errors, []);
    results.push({
      width,
      livePositions: true,
      statusFilters: true,
      hoverAndActive: true,
      keyboardTabs: true,
      pagination: true,
      filteredEmpty: true,
      retainedRefreshError: true,
      noMoneyWrites: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
