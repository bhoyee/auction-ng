import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  calculateInvoiceLine,
  BID_FEE_VERSION,
} from '../packages/shared/src/fees.ts';
/* global localStorage,document,innerWidth,getComputedStyle,setInterval,clearInterval */
const dir = 'docs/design/buyer-feedback';
mkdirSync(dir, { recursive: true });
const lots = (await (await fetch('http://localhost:4000/lots?limit=5')).json())
  .items;
assert.ok(lots.length, 'An active demo lot is required');
const lot = lots[0];
const browser = await chromium.launch();
const review = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const user = {
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
    let watching = false,
      watchFailure = false,
      reject = false,
      confirmFailure = false,
      bidCalls = 0;
    const state = {
      lotId: lot.id,
      currentPriceKobo: null,
      endsAt: lot.endsAt,
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
    await context.routeWebSocket(
      'ws://localhost:4001/socket.io/**',
      (socket) => {
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
      },
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (value, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
        });
      if (path === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (path === '/wallet')
        return json({
          id: randomUUID(),
          userId: user.id,
          currency: 'NGN',
          availableKobo: 100000000,
          heldKobo: 0,
          totalKobo: 100000000,
        });
      if (path === '/buyers/watchlist/status')
        return json({ lotIds: watching ? [lot.id] : [] });
      if (path === '/buyers/watchlist/count')
        return json({ count: watching ? 1 : 0 });
      if (path === '/buyers/watchlist/' + lot.id) {
        if (watchFailure) return json({}, 503);
        watching = route.request().postDataJSON().watching;
        return json({ watching });
      }
      if (path.endsWith('/bid-preparations')) {
        if (reject) return json({}, 409);
        const input = route.request().postDataJSON();
        return json({
          preparationId: randomUUID(),
          idempotencyKey: input.idempotencyKey,
          lotId: lot.id,
          maxKobo: input.maxKobo,
          mode: input.mode,
          totalKobo: calculateInvoiceLine(input.maxKobo).totalKobo,
          reservedKobo: calculateInvoiceLine(input.maxKobo).totalKobo,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          feeVersion: BID_FEE_VERSION,
        });
      }
      if (path === '/lots/' + lot.id + '/bids') {
        if (confirmFailure) return json({}, 503);
        bidCalls++;
        state.currentPriceKobo = lot.startPriceKobo;
        state.isLeader = true;
        state.streamId = '2-0';
        for (const peer of peers)
          peer.send('42' + JSON.stringify(['lot:update', state]));
        return json({
          status: 'accepted',
          mode: 'direct',
          isLeader: true,
          currentPriceKobo: state.currentPriceKobo,
          endsAt: state.endsAt,
          serverTime: new Date().toISOString(),
          streamId: state.streamId,
        });
      }
      if (
        path.includes('bid-history') ||
        path.includes('my-bids') ||
        path === '/buyers/notifications'
      )
        return json({ items: [], nextCursor: null });
      if (path.startsWith('/lots') || path.startsWith('/categories'))
        return route.continue();
      return json({}, 404);
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3300/lots/' + lot.id);
    // The shared auction panel is a labelled section, not necessarily a region in every browser.
    const bidPanel = page
      .locator('[aria-label="Auction bidding"]')
      .filter({ visible: true })
      .first();
    await bidPanel
      .getByRole('button', { name: 'Review bid', exact: true })
      .waitFor();
    await bidPanel
      .getByRole('button', { name: 'Save to watchlist', exact: true })
      .click();
    const success = page.locator('.agn-toast--floating.agn-toast--success');
    await success
      .getByText('Lot saved to your watchlist.', { exact: true })
      .waitFor();
    assert.equal(
      await success.evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(18, 122, 85)',
    );
    await success.getByRole('button', { name: 'Dismiss message' }).click();
    watchFailure = true;
    await bidPanel
      .getByRole('button', { name: 'Remove from watchlist', exact: true })
      .click();
    const failure = page.locator('.agn-toast--floating.agn-toast--error');
    await failure.getByText(/Your watchlist could not be updated/).waitFor();
    assert.equal(
      await failure.evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(200, 52, 28)',
    );
    await failure.getByRole('button', { name: 'Dismiss message' }).click();
    await bidPanel
      .getByRole('button', { name: 'Review bid', exact: true })
      .waitFor();
    const quick = bidPanel.getByRole('button', { name: /^Bid \u20a6/ }).first();
    await quick.click();
    let dialog = page.getByRole('dialog', {
      name: 'Confirm your bid',
      exact: true,
    });
    await dialog.getByRole('button', { name: /^Place bid/ }).click();
    await success.getByText(/Bid accepted. You are leading/).waitFor();
    const winning = page.locator('.agn-winning-status');
    await winning.waitFor();
    assert.deepEqual(
      await winning.evaluate((node) => ({
        background: getComputedStyle(node).backgroundColor,
        weight: getComputedStyle(node).fontWeight,
      })),
      { background: 'rgb(18, 122, 85)', weight: '800' },
    );
    await page.screenshot({
      path: dir + '/bid-success-' + width + '.png',
      fullPage: false,
    });
    await success.getByRole('button', { name: 'Dismiss message' }).click();
    reject = true;
    await quick.click();
    dialog = page.getByRole('dialog', {
      name: 'Confirm your bid',
      exact: true,
    });
    await dialog.getByRole('button', { name: /^Place bid/ }).click();
    await failure.getByText(/This bid could not be prepared/).waitFor();
    assert.equal(
      bidCalls,
      1,
      'A rejected preparation never confirms another bid',
    );
    await page.screenshot({
      path: dir + '/bid-rejected-' + width + '.png',
      fullPage: false,
    });
    await failure.getByRole('button', { name: 'Dismiss message' }).click();
    reject = false;
    confirmFailure = true;
    await quick.click();
    dialog = page.getByRole('dialog', {
      name: 'Confirm your bid',
      exact: true,
    });
    await dialog.getByRole('button', { name: /^Place bid/ }).click();
    await dialog
      .getByRole('alert')
      .getByText(/The bid result could not be confirmed/)
      .waitFor();
    await dialog
      .getByRole('button', { name: 'Retry this bid', exact: true })
      .waitFor();
    await dialog.screenshot({ path: dir + '/bid-uncertain-' + width + '.png' });
    assert.deepEqual(errors, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    review.push({
      width,
      bidSuccess: true,
      bidRejection: true,
      watchSuccess: true,
      watchFailure: true,
      winningBanner: true,
    });
    await context.close();
  }
  writeFileSync(dir + '/review.json', JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify(review));
} finally {
  await browser.close();
}
