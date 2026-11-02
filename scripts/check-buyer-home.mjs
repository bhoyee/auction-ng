import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { setInterval, clearInterval } from 'node:timers';
/* global document, localStorage, window, Event, innerWidth, getComputedStyle */
const dir = 'docs/design/buyer-home';
mkdirSync(dir, { recursive: true });
const sources = (
  await (await fetch('http://localhost:4000/lots?limit=50')).json()
).items;
assert.ok(sources.length);
const now = Date.now();
const lots = Array.from({ length: 12 }, (_, i) => ({
  ...sources[i % sources.length],
  id: randomUUID(),
  lotNumber: 'PREVIEW-' + i,
  title:
    ['Wireless headphones', 'Smartphone', 'Smart watch', 'Portable speaker'][
      i % 4
    ] +
    ' ' +
    (i + 1),
  isTopDeal: i >= 8,
  topDealOrder: i,
  status: 'open',
  startsAt: new Date(now - 3600000).toISOString(),
  endsAt: new Date(
    now + (i < 4 ? 10 + i : i < 8 ? 30 + i : 180 + i) * 60000,
  ).toISOString(),
}));
// Keep representative photographs distinct, as the real homepage deduplicates them.
const photos = new Set();
for (const lot of lots) {
  const src = lot.thumbnail?.thumbnailUrl;
  if (src && photos.has(src)) lot.thumbnail = null;
  else photos.add(src);
}
const scheduled = Array.from({ length: 4 }, (_, i) => ({
  ...sources[(12 + i) % sources.length],
  id: randomUUID(),
  lotNumber: 'PREVIEW-UP-' + i,
  title: 'Upcoming find ' + (i + 1),
  isTopDeal: false,
  status: 'scheduled',
  startsAt: new Date(now + (6 + i) * 3600000).toISOString(),
  endsAt: new Date(now + (30 + i) * 3600000).toISOString(),
}));
const browser = await chromium.launch();
const results = [];
async function setup(width, signedIn) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: 'reduce',
  });
  context.setDefaultTimeout(15000);
  const state = { signedIn, upcoming: true };
  const errors = [];
  const user = {
    id: randomUUID(),
    name: 'Amina Yusuf',
    email: 'amina@example.test',
    role: 'buyer',
    status: 'active',
    emailVerified: true,
    phone: null,
    phoneVerified: false,
    address: null,
    passwordSet: true,
  };
  const token = {
    accessToken: randomBytes(32).toString('base64url'),
    expiresInSeconds: 900,
    user,
  };
  await context.addInitScript(() =>
    localStorage.setItem(
      'auction-ng-cookie-notice',
      JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
    ),
  );
  await context.route('http://localhost:4000/**', (route) => {
    const url = new URL(route.request().url()),
      p = url.pathname;
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (p === '/auth/refresh')
      return state.signedIn ? json(token) : json({}, 401);
    if (p === '/auth/request-code')
      return json({
        challengeId: randomUUID(),
        expiresInSeconds: 300,
        message: 'Check your email.',
      });
    if (p === '/auth/verify-code') {
      state.signedIn = true;
      return json(token);
    }
    if (p === '/auth/profile') return json(user);
    if (p === '/lots')
      return json({
        items:
          url.searchParams.get('topDeals') === 'true'
            ? lots.filter((l) => l.isTopDeal)
            : lots,
        nextCursor: null,
        serverTime: new Date().toISOString(),
      });
    if (p === '/upcoming-lots')
      return json({
        items: state.upcoming ? scheduled : [],
        nextCursor: null,
        serverTime: new Date().toISOString(),
      });
    if (p === '/time') return json({ serverTime: new Date().toISOString() });
    if (p === '/buyers/watchlist/count') return json({ count: 0 });
    if (p === '/buyers/notifications/summary')
      return json({ unread: 0, awaitingPickup: 0 });
    if (p === '/wallet')
      return json({
        id: user.id,
        userId: user.id,
        currency: 'NGN',
        availableKobo: 1000000,
        heldKobo: 0,
        totalKobo: 1000000,
      });
    return json({ items: [], nextCursor: null, lotIds: [] });
  });
  await context.routeWebSocket(/localhost:4001\/socket.io\//, (socket) => {
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
      3000,
    );
    socket.onClose(() => clearInterval(heartbeat));
    socket.onMessage((raw) => {
      const text = String(raw);
      if (text.startsWith('40'))
        return socket.send(
          '40' +
            (text.startsWith('40/public,') ? '/public,' : '') +
            JSON.stringify({ sid: randomUUID() }),
        );
      const m = text.match(/^42(\/public,)?(\d+)(\[.*\])$/);
      if (!m) return;
      const [event, input] = JSON.parse(m[3]);
      const lot = lots.find((l) => l.id === input.lotId);
      const value =
        event === 'clock:sync'
          ? { serverTime: new Date().toISOString() }
          : lot
            ? {
                ok: true,
                lot: {
                  lotId: lot.id,
                  currentPriceKobo: lot.startPriceKobo,
                  endsAt: lot.endsAt,
                  streamId: '1-0',
                  serverTime: new Date().toISOString(),
                  isLeader: false,
                },
              }
            : { ok: false };
      socket.send('43' + (m[1] ?? '') + m[2] + JSON.stringify([value]));
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, state, errors };
}
try {
  for (const width of [360, 768, 1280]) {
    for (const signedIn of [false, true]) {
      const { context, page, state, errors } = await setup(width, signedIn);
      await page.goto('http://localhost:3300/');
      if (signedIn) {
        await expect(
          page.getByRole('heading', { name: 'Hello, Amina.' }),
        ).toBeVisible();
        await expect(page.locator('.agn-hero-grid')).toHaveCount(0);
        const ending = page.getByRole('region', {
          name: 'Ending Soon',
          exact: true,
        });
        await expect(ending.locator('article')).toHaveCount(4);
        await expect(
          page
            .getByRole('region', { name: 'Upcoming Deals', exact: true })
            .locator('article'),
        ).toHaveCount(4);
        await expect(page.locator('#top-deals article')).toHaveCount(4);
        await expect(page.locator('.agn-closing-band article')).toHaveCount(4);
        if (width >= 768)
          assert.equal(
            await ending
              .locator('.agn-buyer-grid')
              .evaluate(
                (grid) =>
                  getComputedStyle(grid).gridTemplateColumns.split(' ').length,
              ),
            4,
          );
        assert.ok(
          await page
            .locator('.agn-upcoming-countdown .agn-countdown')
            .evaluateAll((timers) =>
              timers.every(
                (timer) => timer.scrollWidth <= timer.clientWidth + 1,
              ),
            ),
        );
        const ids = await page
          .locator('main article button.agn-lot-title')
          .evaluateAll((nodes) => nodes.map((n) => n.textContent));
        assert.equal(ids.length, 12);
        assert.equal(new Set(ids).size, ids.length);
        await expect(page.locator('.agn-first-visit')).toHaveCount(0);
        if (width >= 768) {
          const rail = await page
            .locator('#top-deals .agn-buyer-rail')
            .evaluate((el) => ({
              parent: el.clientWidth,
              card: el.firstElementChild.getBoundingClientRect().width,
            }));
          assert.ok(
            Math.abs(rail.card * 4 + 48 - rail.parent) < 3,
            'Four Top Deals must fit in the viewport',
          );
        }
        const bell = page.locator('.agn-notification-menu > summary');
        const watch = page.locator('.agn-header-actions > .agn-watch-link');
        const style = await bell.evaluate((el) => ({
          border: getComputedStyle(el).borderTopWidth,
          radius: getComputedStyle(el).borderRadius,
          width: el.getBoundingClientRect().width,
          cursor: getComputedStyle(el).cursor,
        }));
        assert.equal(style.border, '1px');
        assert.equal(style.cursor, 'pointer');
        assert.ok(style.width >= 44);
        assert.equal(
          style.radius,
          await watch.evaluate((el) => getComputedStyle(el).borderRadius),
        );
        if (width >= 768) {
          const before = await bell.evaluate(
            (el) => getComputedStyle(el).backgroundColor,
          );
          await bell.hover();
          await expect
            .poll(() =>
              bell.evaluate((el) => getComputedStyle(el).backgroundColor),
            )
            .not.toBe(before);
          await bell.click();
          await expect(page.locator('.agn-notification-menu')).toHaveAttribute(
            'open',
            '',
          );
          await bell.click();
          await page.mouse.move(0, 0);
        }
      } else {
        await expect(page.locator('.agn-hero-grid')).toBeVisible();
        await expect(page.locator('.agn-first-visit')).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'Hello, Amina.' }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('region', { name: 'Upcoming Deals', exact: true }),
        ).toHaveCount(0);
      }
      await page.evaluate(() => document.fonts.ready);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `${dir}/${signedIn ? 'signed-in' : 'signed-out'}-${width}.png`,
        fullPage: true,
      });
      if (signedIn) {
        state.upcoming = false;
        await expect(
          page.getByRole('region', { name: 'Upcoming Deals', exact: true }),
        ).toHaveCount(0, { timeout: 8000 });
        state.upcoming = true;
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(
          page.getByRole('region', { name: 'Upcoming Deals', exact: true }),
        ).toBeVisible();
      }
      assert.deepEqual(errors, []);
      results.push({ width, signedIn, passed: true });
      await context.close();
    }
  }
  for (const next of ['', '/lots/' + lots[0].id]) {
    const { context, page, errors } = await setup(1280, false);
    await page.goto(
      'http://localhost:3300/sign-in' +
        (next ? '?next=' + encodeURIComponent(next) : ''),
    );
    await page
      .getByLabel('Email address', { exact: true })
      .fill('amina@example.test');
    await page
      .getByLabel('Password', { exact: true })
      .fill('Preview-only-passphrase');
    await page.getByRole('button', { name: 'Continue securely' }).click();
    await page
      .getByRole('textbox', { name: 'Six-digit code', exact: true })
      .fill('123456');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page).toHaveURL('http://localhost:3300' + (next || '/'));
    assert.deepEqual(errors, []);
    results.push({ loginReturn: next || '/', passed: true });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/checks.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
