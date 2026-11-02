import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global document, localStorage, innerWidth, window, Event */
const dir = process.argv.includes('--detail-only')
  ? 'docs/design/prebid-panel-polish'
  : 'docs/design/upcoming-prebids';
mkdirSync(dir, { recursive: true });
const catalogue = await (
  await fetch('http://localhost:4000/upcoming-lots?limit=24')
).json();
const lot = catalogue.items.find((item) => item.startPriceKobo <= 1000000);
assert.ok(lot, 'Seed an upcoming demo lot first.');
const detail = await (
  await fetch(`http://localhost:4000/lots/${lot.id}`)
).json();
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    let signedIn = false,
      owned = null,
      fail = false,
      insufficient = false,
      available = 100000000;
    const replies = new Map(),
      submissions = [];
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
    const accessToken = randomBytes(32).toString('base64url');
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
      const response = () => ({
        preBid: owned,
        serverTime: new Date().toISOString(),
      });
      if (path === '/time')
        return json({ serverTime: new Date().toISOString() });
      if (path === '/auth/refresh')
        return signedIn
          ? json({ accessToken, expiresInSeconds: 900, user })
          : json({}, 401);
      if (path === '/upcoming-lots') return json(catalogue);
      if (path.endsWith('/bid-history'))
        return json({ items: [], nextCursor: null });
      if (path === `/lots/${lot.id}`) return json(detail);
      if (path === `/lots/${lot.id}/result`)
        return json({
          lotId: lot.id,
          state: 'scheduled',
          finalPriceKobo: null,
          serverTime: new Date().toISOString(),
        });
      if (path.endsWith('/auction-fees'))
        return json({
          policy: {
            version: 'auction-fees-v1',
            serviceChargeEnabled: true,
            premiumBps: 1500,
            lotFeeEnabled: true,
            lotFeeKobo: 30000,
            vatEnabled: true,
            vatBps: 750,
          },
          locked: !!owned,
        });
      if (path.endsWith('/prebid') && route.request().method() === 'GET')
        return json(response());
      if (path.endsWith('/prebid') || path.endsWith('/prebid/cancel')) {
        const body = route.request().postDataJSON();
        submissions.push(body);
        if (insufficient) {
          insufficient = false;
          return json({ code: 'INSUFFICIENT_FUNDS' }, 422);
        }
        if (!replies.has(body.idempotencyKey)) {
          owned = {
            id: owned?.id ?? randomUUID(),
            lotId: lot.id,
            maxKobo: body.maxKobo ?? owned.maxKobo,
            totalKobo: body.maxKobo === 1200000 ? 1425750 : 1193500,
            feeVersion: 'auction-fees-v1',
            revision: (owned?.revision ?? 0) + 1,
            status: path.endsWith('/cancel') ? 'cancelled' : 'active',
            startsAt: lot.startsAt,
            serverTime: new Date().toISOString(),
          };
          replies.set(body.idempotencyKey, response());
        }
        if (fail) {
          fail = false;
          return json({}, 503);
        }
        return json(replies.get(body.idempotencyKey));
      }
      if (path === '/buyers/watchlist/count') return json({ count: 0 });
      if (path === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 0 });
      if (path === '/wallet')
        return json({
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: available,
          heldKobo: 0,
          totalKobo: 100000000,
        });
      return json({ items: [], nextCursor: null, lotIds: [] });
    });
    context.setDefaultTimeout(15000);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    async function capture(name) {
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${dir}/${name}-${width}.png`,
        fullPage: true,
      });
      if (
        process.argv.includes('--detail-only') &&
        ['saved-detail', 'top-up'].includes(name)
      )
        await page
          .getByRole('region', { name: 'Auction bidding', exact: true })
          .screenshot({
            path: `${dir}/${name}-panel-${width}.png`,
            style:
              '.agn-market-header, .agn-support-launcher { visibility: hidden !important; }',
          });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${name}: horizontal overflow`,
      );
    }
    await page.goto('http://localhost:3300/upcoming-deals');
    await expect(
      page.getByRole('heading', { name: 'UPCOMING DEALS', exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.agn-upcoming-card .agn-countdown').first(),
    ).toBeVisible();
    assert.ok(
      await page
        .locator('.agn-upcoming-card-content')
        .evaluateAll((cards) =>
          cards.every((card) => card.scrollWidth <= card.clientWidth + 1),
        ),
      'Upcoming card content must fit without clipping',
    );
    assert.ok(
      await page
        .locator('.agn-upcoming-card .agn-countdown')
        .evaluateAll((timers) =>
          timers.every((timer) => timer.scrollWidth <= timer.clientWidth + 1),
        ),
      'Launch timer segments must fit inside their badge',
    );
    await capture('upcoming');
    await page.goto(`http://localhost:3300/lots/${lot.id}`);
    await expect(
      page.getByRole('link', { name: 'Sign in to pre-bid' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Auction bidding', exact: true })
        .getByRole('button', { name: 'Bid now', exact: true }),
    ).toHaveCount(0);
    await capture('anonymous-detail');
    signedIn = true;
    await page.reload();
    const input = page.getByLabel('Your private pre-bid limit');
    await input.fill('10000');
    await input.fill('10000abc');
    await expect(input).toHaveValue('10000');
    await input.fill('10000-');
    await expect(input).toHaveValue('10000');
    const biddingPanel = page.getByRole('region', {
      name: 'Auction bidding',
      exact: true,
    });
    await expect(
      biddingPanel.locator('.agn-input-with-prefix > span'),
    ).toHaveText('₦');
    await expect(biddingPanel.locator('.agn-detail-retail s')).toBeVisible();
    await expect(
      biddingPanel.locator('.agn-countdown-segment strong'),
    ).toHaveCount(4);
    await expect(
      page.getByRole('link', { name: 'Top up wallet', exact: true }),
    ).toHaveCount(0);
    available = 0;
    await page.evaluate(() =>
      window.dispatchEvent(new Event('auction-ng-wallet-change')),
    );
    await expect(
      page.getByRole('link', { name: 'Top up wallet', exact: true }),
    ).toBeVisible();
    await capture('top-up');
    available = 100000000;
    await page.evaluate(() =>
      window.dispatchEvent(new Event('auction-ng-wallet-change')),
    );
    await expect(
      page.getByRole('link', { name: 'Top up wallet', exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Review pre-bid', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByText('Service charge (15%)', { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText('VAT on fees (7.5%)', { exact: true }),
    ).toBeVisible();
    await capture('fee-review');
    await dialog.getByRole('button', { name: /^Confirm pre-bid/ }).click();
    await expect(
      page.getByText('Your private limit:', { exact: false }),
    ).toBeVisible();
    await input.fill('12000');
    available = 300000;
    await page.evaluate(() =>
      window.dispatchEvent(new Event('auction-ng-wallet-change')),
    );
    await expect(
      page.getByRole('link', { name: 'Top up wallet', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Review pre-bid' }).click();
    insufficient = true;
    await dialog.getByRole('button', { name: /^Confirm pre-bid/ }).click();
    await expect(
      page.getByText('Insufficient available wallet funds.', { exact: false }),
    ).toBeVisible();
    await expect(input).toBeEnabled();
    await page.getByRole('button', { name: 'Review pre-bid' }).click();
    fail = true;
    await dialog.getByRole('button', { name: /^Confirm pre-bid/ }).click();
    await expect(
      dialog.getByText('The result could not be confirmed.', { exact: false }),
    ).toBeVisible();
    const uncertain = submissions.at(-1);
    await capture('retry');
    await dialog.getByRole('button', { name: 'Check pending pre-bid' }).click();
    assert.deepEqual(
      submissions.at(-1),
      uncertain,
      'Retry must reuse the exact operation',
    );
    await expect(dialog).toHaveCount(0);
    await capture('saved-detail');
    await page
      .getByRole('button', { name: 'Cancel pre-bid', exact: true })
      .click();
    await expect(
      page.getByText('Pre-bid cancelled.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Review pre-bid', exact: true }),
    ).toBeEnabled();
    assert.deepEqual(errors, []);
    results.push({
      width,
      passed: true,
      checks: [
        'listing',
        'anonymous detail',
        'fee review',
        'save',
        'insufficient funds',
        'exact retry',
        'edit',
        'cancel',
        'no overflow or page errors',
        'digits-only input and fixed naira prefix',
        'retail estimate and labelled large countdown',
        'top-up only for insufficient available funds',
        'existing reservation counted when editing',
      ],
    });
    await context.close();
  }
  for (const width of process.argv.includes('--detail-only')
    ? []
    : [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    let row = {
        ...lot,
        autoRelistEnabled: false,
        autoRelistCount: 0,
        updatedAt: new Date().toISOString(),
      },
      prior,
      uncertain = true;
    await context.route('http://localhost:4000/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      if (path === '/auth/staff/refresh')
        return json({
          accessToken: randomBytes(32).toString('base64url'),
          expiresInSeconds: 900,
          user: {
            id: randomUUID(),
            name: 'Synthetic administrator',
            email: 'admin@example.test',
            role: 'admin',
            status: 'active',
            emailVerified: true,
            phone: null,
            phoneVerified: false,
            address: null,
            passwordSet: true,
          },
        });
      if (path === '/admin/lots')
        return json({ items: [row], nextCursor: null });
      if (path.endsWith('/schedule')) {
        const body = route.request().postDataJSON();
        if (uncertain) {
          uncertain = false;
          prior = body;
          return json({}, 503);
        }
        if (prior) {
          assert.deepEqual(body, prior);
          prior = undefined;
        }
        row = {
          ...row,
          status: body.action === 'cancel' ? 'cancelled' : 'scheduled',
          startsAt: body.startsAt,
          endsAt: body.endsAt,
          updatedAt: new Date().toISOString(),
        };
        return json({
          lotId: row.id,
          status: row.status,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          updatedAt: row.updatedAt,
        });
      }
      return json({ items: [], nextCursor: null });
    });
    context.setDefaultTimeout(15000);
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3301/');
    const panel = page.getByRole('region', {
      name: 'Schedule ' + lot.lotNumber,
      exact: true,
    });
    await expect(panel).toBeVisible();
    await panel
      .getByLabel('Schedule change reason')
      .fill('Demo schedule verification');
    await panel.screenshot({ path: `${dir}/admin-schedule-${width}.png` });
    await panel.getByRole('button', { name: 'Reschedule auction' }).click();
    await expect(
      panel.getByText('Schedule result is uncertain.', { exact: false }),
    ).toBeVisible();
    await expect(panel.getByLabel('Goes live (WAT)')).toBeDisabled();
    await panel.getByRole('button', { name: 'Retry schedule request' }).click();
    await expect(
      panel.getByRole('button', { name: 'Reschedule auction' }),
    ).toBeVisible();
    await panel
      .getByLabel('Schedule change reason')
      .fill('Cancel demo upcoming auction');
    await panel
      .getByRole('button', { name: 'Cancel upcoming auction' })
      .click();
    await expect(panel).toHaveCount(0);
    assert.deepEqual(errors, []);
    results.push({
      width,
      admin: true,
      passed: true,
      checks: [
        'schedule disclosure',
        'exact retry',
        'pending fields locked',
        'reschedule',
        'cancel',
      ],
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/checks.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
