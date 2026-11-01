import { chromium, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setInterval, clearInterval } from 'node:timers';
import assert from 'node:assert/strict';
/* global localStorage, document, window, Event */
const dir = 'docs/design/bid-form-polish';
mkdirSync(dir, { recursive: true });
const catalogue = await (
  await fetch('http://localhost:4000/lots?limit=50')
).json();
const lot = catalogue.items
  .filter((item) => item.status === 'open' && item.startPriceKobo <= 1250000)
  .sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt))[0];
assert.ok(
  lot,
  'An open demo lot is required for the server-rendered detail page.',
);
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
      phoneVerified: false,
      phone: null,
      address: null,
      passwordSet: true,
    };
    const token = randomBytes(32).toString('base64url');
    const preparationId = randomUUID();
    const endsAt = new Date(Date.now() + 7200000).toISOString();
    let current = 1250000,
      availableBalance = 1000000000,
      walletFails = false,
      stream = 1,
      leader = false,
      prepareBody = null,
      confirms = 0;
    const peers = new Set();
    const snapshot = (id) => ({
      lotId: id,
      currentPriceKobo: current,
      endsAt,
      streamId: `${stream}-0`,
      serverTime: new Date().toISOString(),
      isLeader: leader,
    });
    function update() {
      stream++;
      for (const peer of peers)
        peer.send('42' + JSON.stringify(['lot:update', snapshot(lot.id)]));
    }
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      if (path === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (path === '/wallet' && walletFails) return json({}, 503);
      if (path === '/wallet')
        return json({
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: availableBalance,
          heldKobo: 0,
          totalKobo: availableBalance,
        });
      if (path === '/buyers/watchlist/count') return json({ count: 0 });
      if (path === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 0 });
      if (path === `/lots/${lot.id}/result`)
        return json({
          lotId: lot.id,
          state: 'open',
          finalPriceKobo: null,
          serverTime: new Date().toISOString(),
        });
      if (path === `/lots/${lot.id}/bid-preparations`) {
        prepareBody = route.request().postDataJSON();
        assert.equal(prepareBody.mode, 'direct');
        assert.equal(prepareBody.maxKobo, 1321750);
        return json({
          preparationId,
          idempotencyKey: prepareBody.idempotencyKey,
          lotId: lot.id,
          maxKobo: prepareBody.maxKobo,
          mode: prepareBody.mode,
          totalKobo: 1567133,
          reservedKobo: 1567133,
          expiresAt: endsAt,
          feeVersion: 'auction-fees-v1',
        });
      }
      if (path === `/lots/${lot.id}/bids`) {
        const body = route.request().postDataJSON();
        assert.equal(body.preparationId, preparationId);
        assert.equal(body.idempotencyKey, prepareBody.idempotencyKey);
        confirms++;
        current = 1321750;
        leader = true;
        update();
        return json({
          status: 'accepted',
          mode: 'direct',
          isLeader: true,
          currentPriceKobo: current,
          endsAt,
          serverTime: new Date().toISOString(),
          streamId: `${stream}-0`,
        });
      }
      return json({ items: [], nextCursor: null });
    });
    await context.routeWebSocket(/localhost:4001\/socket.io\//, (socket) => {
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
        3000,
      );
      socket.onClose(() => {
        peers.delete(socket);
        clearInterval(heartbeat);
      });
      socket.onMessage((raw) => {
        const text = String(raw);
        if (text.startsWith('40'))
          return socket.send(
            '40' +
              (text.startsWith('40/public,') ? '/public,' : '') +
              JSON.stringify({ sid: randomUUID() }),
          );
        const match = text.match(/^42(\/public,)?(\d+)(\[.*\])$/);
        if (!match) return;
        const [event, input] = JSON.parse(match[3]);
        const value =
          event === 'clock:sync'
            ? { serverTime: new Date().toISOString() }
            : { ok: true, lot: snapshot(input.lotId) };
        socket.send(
          '43' + (match[1] ?? '') + match[2] + JSON.stringify([value]),
        );
      });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://localhost:3300/lots/${lot.id}`);
    const panel = page.getByRole('region', {
      name: 'Auction bidding',
      exact: true,
    });
    const direct = panel.getByRole('radio', {
      name: 'Bid full amount',
      exact: true,
    });
    const automatic = panel.getByRole('radio', {
      name: 'Automatic spending limit',
      exact: true,
    });
    await expect(direct).toBeChecked();
    await expect(panel.locator('.agn-detail-bid-minimum')).toContainText(
      '12,500.01',
    );
    await expect(panel.getByRole('combobox')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /^Bid ₦/ })).toHaveCount(0);
    let field = panel.getByLabel('Your bid amount', { exact: true });
    const action = panel.getByRole('button', { name: 'Bid now', exact: true });
    await field.fill('12500');
    await expect(action).toBeDisabled();
    await field.fill('12500.01');
    await expect(action).toBeEnabled();
    for (const text of [
      'abc',
      '1e5',
      '-100',
      '+100',
      '12#34',
      '12,500',
      '12500.012',
    ]) {
      await field.fill(text);
      await expect(field).toHaveValue('12500.01');
    }
    await expect(
      panel.getByRole('link', {
        name: 'Check wallet or add funds',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(action.locator('svg')).toHaveCount(1);
    if (width >= 1100) {
      const left = await direct.locator('..').boundingBox(),
        right = await automatic.locator('..').boundingBox();
      assert.ok(
        left &&
          right &&
          Math.abs(left.y - right.y) < 2 &&
          left.x + left.width <= right.x + 1,
      );
    }
    const methods = await panel
      .getByRole('group', { name: 'Bidding method', exact: true })
      .boundingBox();
    const inputBox = await field.boundingBox(),
      buttonBox = await action.boundingBox();
    assert.ok(
      methods &&
        inputBox &&
        buttonBox &&
        methods.y + methods.height < inputBox.y,
    );
    assert.ok(
      inputBox.x + inputBox.width <= buttonBox.x + 1 &&
        Math.abs(
          inputBox.y + inputBox.height - buttonBox.y - buttonBox.height,
        ) <= 2,
    );
    assert.ok(Math.abs(inputBox.width - buttonBox.width) < 2);
    await field.fill('13217.50');
    await panel
      .getByRole('button', { name: 'Fee details', exact: true })
      .click();
    const details = page.getByRole('dialog', {
      name: 'Estimated bid fees',
      exact: true,
    });
    for (const label of [
      'Bid amount',
      'Buyer premium',
      'Lot fee',
      'VAT on fees',
      'Estimated total including fees',
    ])
      await expect(details.getByText(label, { exact: true })).toBeVisible();
    assert.equal(prepareBody, null);
    await details.screenshot({ path: `${dir}/fee-details-${width}.png` });
    await details
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
    availableBalance = 100000;
    await page.evaluate(() =>
      window.dispatchEvent(new Event('auction-ng-wallet-change')),
    );
    const walletAction = panel.getByRole('link', {
      name: 'Check wallet or add funds',
      exact: true,
    });
    await expect(walletAction).toBeVisible();
    await expect(walletAction).not.toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
    await expect(action).toBeDisabled();
    await expect(panel.getByText(/Your wallet needs another/)).toHaveCSS(
      'font-weight',
      '700',
    );
    await panel.screenshot({
      path: `${dir}/insufficient-${width}.png`,
      style:
        '.agn-support-launcher, .agn-header-stack, .agn-bid-bar { visibility: hidden; }',
    });
    availableBalance = 1000000000;
    await page.evaluate(() =>
      window.dispatchEvent(new Event('auction-ng-wallet-change')),
    );
    await expect(action).toBeEnabled();
    await expect(walletAction).toHaveCount(0);
    walletFails = true;
    await page.evaluate(() =>
      window.dispatchEvent(new Event('auction-ng-wallet-change')),
    );
    await expect(
      panel.getByRole('button', { name: 'Retry wallet balance', exact: true }),
    ).toBeVisible();
    await expect(action).toBeDisabled();
    walletFails = false;
    await panel
      .getByRole('button', { name: 'Retry wallet balance', exact: true })
      .click();
    await expect(action).toBeEnabled();
    if (width < 768) {
      const help = await page
        .getByRole('button', { name: 'Open support chat', exact: true })
        .boundingBox();
      const sticky = await page.locator('.agn-bid-bar').boundingBox();
      assert.ok(help && sticky && help.y + help.height <= sticky.y);
      await page
        .getByRole('button', { name: 'Enter bid', exact: true })
        .click();
      await expect(field).toHaveValue('13217.50');
      await expect(field).toBeFocused();
      await expect(
        page.getByRole('dialog', { name: 'Confirm your bid', exact: true }),
      ).toHaveCount(0);
    }
    await action.click();
    const review = page.getByRole('dialog', {
      name: 'Confirm your bid',
      exact: true,
    });
    await expect(review.getByText('Bid amount', { exact: true })).toBeVisible();
    await expect(
      review.getByText('Buyer premium', { exact: true }),
    ).toBeVisible();
    assert.equal(prepareBody, null);
    await review.screenshot({ path: `${dir}/fee-review-${width}.png` });
    await review
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
    await automatic.locator('..').click();
    await expect(automatic).toBeChecked();
    await expect(
      panel.getByLabel('Your private spending limit', { exact: true }),
    ).toHaveValue('13217.50');
    await panel.screenshot({
      path: `${dir}/automatic-${width}.png`,
      style:
        '.agn-support-launcher, .agn-header-stack, .agn-bid-bar { visibility: hidden; }',
    });
    await panel.getByRole('button', { name: 'Set limit', exact: true }).click();
    await expect(
      review.getByText('Maximum hammer price', { exact: true }),
    ).toBeVisible();
    assert.equal(prepareBody, null);
    await review
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
    await direct.locator('..').click();
    await expect(direct).toBeChecked();
    await panel.screenshot({
      path: `${dir}/bid-entry-${width}.png`,
      style:
        '.agn-support-launcher, .agn-header-stack, .agn-bid-bar { visibility: hidden; }',
    });
    await action.click();
    await review
      .getByRole('button', { name: 'Place bid ₦13,217.50', exact: true })
      .click();
    await expect(review).toHaveCount(0);
    assert.equal(confirms, 1);
    await expect(action).toBeDisabled();
    await field.fill('13217.51');
    await expect(action).toBeEnabled();
    current = 2000000;
    leader = false;
    update();
    await expect(action).toBeDisabled();
    await context.setOffline(true);
    await expect(
      panel.getByText(/Live prices and bidding are paused/),
    ).toBeVisible();
    await expect(action).toBeDisabled();
    await context.setOffline(false);
    update();
    current = null;
    leader = false;
    await page.reload();
    await expect(direct).toBeChecked();
    field = panel.getByLabel('Your bid amount', { exact: true });
    await field.fill((lot.startPriceKobo / 100).toFixed(2));
    await expect(action).toBeEnabled();
    await field.fill(((lot.startPriceKobo - 1) / 100).toFixed(2));
    await expect(action).toBeDisabled();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      defaultDirect: true,
      radioBeforeAmount: true,
      inlineButton: true,
      equalInputAndButtonWidths: true,
      numericMoneyInput: true,
      desktopInlineRadios: true,
      feeDetailsPopup: true,
      dynamicWalletAction: true,
      walletFailureRetry: true,
      noSuggestions: true,
      strictHigherAmount: true,
      arbitraryKoboAmountPreserved: true,
      feesBeforeConfirm: true,
      explicitAutomaticChoice: true,
      staleAndOfflineDisabled: true,
      startingPriceAccepted: true,
      noOverflow: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
