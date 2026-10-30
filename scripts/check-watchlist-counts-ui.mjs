import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const source = (
  await (await fetch('http://localhost:4000/lots?limit=1')).json()
).items[0];
if (!source)
  throw new Error(
    'A visible local demo lot is required for the watch-button check.',
  );
const browser = await chromium.launch();
const dir = 'docs/design/watchlist-counts';
mkdirSync(dir, { recursive: true });
const review = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const first = {
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
    const second = {
      ...first,
      id: randomUUID(),
      name: 'Tunde Adeyemi',
      email: 'tunde@example.test',
    };
    let current = first;
    const token = randomBytes(32).toString('base64url');
    const saved = new Set();
    let countError = false,
      delayNext = false,
      releaseHeld;
    let heldReady;
    const held = new Promise((resolve) => (heldReady = resolve));
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname;
      const body = () => route.request().postDataJSON();
      const json = (value, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
        });
      if (path === '/auth/refresh')
        return json({
          accessToken: token,
          expiresInSeconds: 900,
          user: current,
        });
      if (path === '/auth/realtime-session') return json({}, 401);
      if (path === '/wallet')
        return json({
          id: first.id,
          userId: current.id,
          currency: 'NGN',
          availableKobo: 0,
          heldKobo: 0,
          totalKobo: 0,
        });
      if (path === '/buyers/watchlist/count') {
        if (countError) return json({}, 503);
        const value = { count: current.id === first.id ? saved.size : 2 };
        if (delayNext) {
          delayNext = false;
          heldReady();
          await new Promise((resolve) => (releaseHeld = resolve));
        }
        try {
          return await json(value);
        } catch {
          if (context.pages().every((page) => page.isClosed())) return;
          throw new Error('Count fixture response failed.');
        }
      }
      if (path === '/buyers/watchlist/status')
        return json({ lotIds: body().lotIds.filter((id) => saved.has(id)) });
      if (path === '/buyers/watchlist/activity')
        return json({
          items: saved.has(source.id)
            ? [
                {
                  id: source.id,
                  lotNumber: source.lotNumber,
                  title: source.title,
                  thumbnailUrl: null,
                  locationName: 'Demo pickup',
                  locationAddress: 'Lagos',
                  startPriceKobo: source.startPriceKobo,
                  retailPriceKobo: source.retailPriceKobo,
                  finalPriceKobo: null,
                  endsAt: source.endsAt,
                  outcome: 'watching',
                },
              ]
            : [],
          nextCursor: null,
        });
      if (path === '/buyers/watchlist')
        return json({
          items: saved.has(source.id)
            ? [
                {
                  lot: {
                    id: source.id,
                    lotNumber: source.lotNumber,
                    title: source.title,
                    status: 'open',
                    thumbnailUrl: null,
                  },
                  createdAt: new Date().toISOString(),
                },
              ]
            : [],
          nextCursor: null,
        });
      if (path.startsWith('/buyers/watchlist/')) {
        const id = path.split('/').at(-1);
        if (body().watching) saved.add(id);
        else saved.delete(id);
        return json({ watching: body().watching });
      }
      if (path === '/buyers/notifications')
        return json({ items: [], nextCursor: null });
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const count = async (target, value) => {
      await target
        .locator(`.agn-watch-link [data-watchlist-count="${value}"]`)
        .waitFor({ state: 'attached' });
    };
    const change = () =>
      page.evaluate(
        (id) =>
          window.dispatchEvent(
            new CustomEvent('auction-ng-watchlist-change', {
              detail: { userId: id },
            }),
          ),
        first.id,
      );
    await page.goto('http://localhost:3300/account');
    await page
      .getByRole('heading', { name: 'Change password', exact: true })
      .waitFor();
    await count(page, 0);
    assert.equal(await page.locator('.agn-wallet-chip').count(), 0);
    assert.equal(
      await page
        .getByRole('link', { name: 'Forgot your password?', exact: true })
        .count(),
      0,
    );
    await page.goto('http://localhost:3300/lots/' + source.id);
    const save = page
      .getByRole('button', { name: 'Save to watchlist', exact: true })
      .first();
    await save.waitFor();
    delayNext = true;
    await change();
    await held;
    await save.click();
    await page
      .getByRole('button', { name: 'Remove from watchlist', exact: true })
      .first()
      .waitFor();
    releaseHeld();
    await count(page, 1);
    await change();
    await count(page, 1);
    assert.equal(saved.size, 1);
    await page.goto('http://localhost:3300/account');
    await count(page, 1);
    await page.locator('summary[aria-label="Account menu"]').click();
    await page
      .locator('.agn-account-menu [data-watchlist-count="1"]')
      .waitFor();
    await page.screenshot({
      path: dir + '/account-menu-' + width + '.png',
      fullPage: true,
    });
    await page.locator('summary[aria-label="Account menu"]').click();
    if (width < 1024)
      await page
        .getByRole('button', { name: 'My account', exact: true })
        .click();
    await page
      .locator('.agn-portal-sidebar [data-watchlist-count="1"]')
      .waitFor();
    await page.screenshot({
      path: dir + '/profile-' + width + '.png',
      fullPage: true,
    });
    if (width === 1280) {
      await page
        .getByRole('button', { name: 'Collapse account sidebar' })
        .click();
      await page
        .locator('.agn-portal-sidebar [data-watchlist-count="1"]')
        .waitFor();
      await page.screenshot({
        path: dir + '/collapsed-1280.png',
        fullPage: true,
      });
      await page
        .getByRole('button', { name: 'Expand account sidebar' })
        .click();
    }
    const otherTab = await context.newPage();
    await otherTab.goto('http://localhost:3300/account');
    await count(otherTab, 1);
    await page.goto('http://localhost:3300/watchlist');
    await page
      .getByRole('button', { name: `Unwatch ${source.title}`, exact: true })
      .waitFor();
    await otherTab.bringToFront();
    await page
      .getByRole('button', { name: `Unwatch ${source.title}`, exact: true })
      .evaluate((button) => button.click());
    await count(otherTab, 0);
    await page.bringToFront();
    await count(page, 0);
    await page
      .getByRole('heading', { name: 'No active items saved', exact: true })
      .waitFor();
    await otherTab.close();
    await page.goto('http://localhost:3300/account');
    await count(page, 0);
    for (let index = 0; index < 105; index++) saved.add(randomUUID());
    await change();
    await count(page, 105);
    assert.equal(
      await page
        .locator('.agn-watch-link [data-watchlist-count="105"]')
        .textContent(),
      '99+',
    );
    countError = true;
    await change();
    await page
      .locator('.agn-watch-link [data-watchlist-count]')
      .waitFor({ state: 'detached' });
    countError = false;
    saved.clear();
    await change();
    await count(page, 0);
    current = second;
    await page.reload();
    await count(page, 2);
    assert.equal(
      await page
        .locator('.agn-watch-link [data-watchlist-count="105"]')
        .count(),
      0,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    review.push({
      width,
      headerWalletRemoved: true,
      profileRecoveryLinkRemoved: true,
      add: true,
      remove: true,
      headerAndMenus: true,
      raceProtection: true,
      crossTab: true,
      largeCount: true,
      failureHidesCount: true,
      accountIsolation: true,
      noOverflow: true,
      browserErrors: errors,
    });
    await context.close();
  }
  writeFileSync(dir + '/review.json', JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify(review));
} finally {
  await browser.close();
}
/* global localStorage,window,document,innerWidth,CustomEvent */
