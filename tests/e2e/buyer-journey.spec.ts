import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { pauseFixture } from './buyer-pause-fixture';
import {
  auditHome,
  productionAudit,
  recordScriptBudget,
  trackScriptTransfers,
} from './web-budgets';
test.describe.configure({ mode: 'default' });

let backend: ChildProcess;
let lotId: string;
let categoryId: string;
const replies = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
function control(command: string, email?: string) {
  return new Promise<unknown>((resolve, reject) => {
    const requestId = randomUUID();
    const timer = setTimeout(() => {
      replies.delete(requestId);
      reject(new Error('Browser fixture command timed out.'));
    }, 30000);
    replies.set(requestId, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    backend.send({ requestId, command, email });
  });
}
test.beforeAll(async () => {
  test.setTimeout(240000);
  backend = spawn(process.execPath, ['scripts/web-buyer-test-server.mjs'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  backend.stdout?.on('data', () => {});
  backend.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Isolated buyer backend did not start.')),
      180000,
    );
    backend.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('Isolated buyer backend exited.'));
    });
    backend.on('message', (message) => {
      if (!message || typeof message !== 'object') return;
      const value = message as {
        ready?: boolean;
        phase?: string;
        lotId?: string;
        categoryId?: string;
        requestId?: string;
        result?: unknown;
        error?: string;
      };
      if (value.phase) console.log(value.phase);
      if (value.ready && value.lotId && value.categoryId) {
        clearTimeout(timer);
        lotId = value.lotId;
        categoryId = value.categoryId;
        resolve();
      }
      if (value.requestId) {
        const reply = replies.get(value.requestId);
        replies.delete(value.requestId);
        if (value.error) reply?.reject(new Error(value.error));
        else reply?.resolve(value.result);
      }
    });
  });
});
test.afterAll(async () => {
  test.setTimeout(45000);
  if (backend?.connected) {
    await control('stop').catch(() => {});
    if (backend.exitCode === null)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Isolated test server did not close.')),
          10000,
        );
        backend.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
  }
});
async function capture(page: Page, name: string, testInfo: TestInfo) {
  await expect(page.locator('[data-buyer-ready="true"]')).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await recordScriptBudget(page, name, testInfo);
  for (const width of [360, 768, 1280]) {
    await expect(page.locator('[data-buyer-ready="true"]')).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const path = testInfo.outputPath(`${name}-${width}.png`);
    await page.screenshot({
      path,
      fullPage: !['bid-confirm', 'transfer-account-setup'].includes(name),
      animations: 'disabled',
      mask: [
        page.locator(
          'img[alt="Private pickup QR code"], img[alt="Private check-in QR code"], .agn-visit-code',
        ),
      ],
      maskColor: '#EEF0FA',
    });
    await testInfo.attach(`${name}-${width}`, {
      path,
      contentType: 'image/png',
    });
  }
}
// Pause checks run first, while the isolated lot is still open.
test('freezes homepage card countdowns without removing the cards', async ({
  page,
}) => {
  const controls = await pauseFixture(page, 'http://localhost:4400');
  await page.goto('http://localhost:3310');
  const card = page.locator('.agn-lot').first();
  const action = card.locator('.agn-lot-body > .agn-button');
  await expect(action).toHaveText('Bid now');
  controls.pause();
  await page
    .getByRole('dialog', { name: 'Bidding is temporarily paused', exact: true })
    .getByRole('button', { name: 'Continue browsing', exact: true })
    .click();
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
  const controls = await pauseFixture(page, 'http://localhost:4400');
  await page.goto('http://localhost:3310/search');
  const card = page.locator('.agn-lot').first();
  await expect(
    card.getByRole('button', { name: 'Bid now', exact: true }),
  ).toBeEnabled();
  controls.pause();
  await page
    .getByRole('dialog', { name: 'Bidding is temporarily paused', exact: true })
    .getByRole('button', { name: 'Continue browsing', exact: true })
    .click();
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
}) => {
  const controls = await pauseFixture(page, 'http://localhost:4400');
  await page.goto(`http://localhost:3310/lots/${lotId}`);
  await page.getByLabel('Your bid amount', { exact: true }).fill('5000');
  const bid = page
    .getByRole('region', { name: 'Auction bidding', exact: true })
    .getByRole('button', { name: 'Bid now', exact: true });
  await expect(bid).toBeEnabled();
  controls.pause();
  await page
    .getByRole('dialog', { name: 'Bidding is temporarily paused', exact: true })
    .getByRole('button', { name: 'Continue browsing', exact: true })
    .click();
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
test('buyer signs up, pays the disclosed fee, bids, is outbid, wins and opens a private pass', async ({
  page,
}, testInfo) => {
  test.setTimeout(240000);
  await page.clock.install();
  page.on('pageerror', (error) =>
    console.log(`Buyer page error: ${error.message}`),
  );
  trackScriptTransfers(page);
  let reservations = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `/lots/${lotId}/bid-preparations`
    )
      reservations++;
  });
  if (productionAudit) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  }
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/auth/') && response.status() >= 400)
      console.log(`Auth ${url.pathname}: ${response.status()}`);
  });
  await expect(async () => {
    const response = await fetch('http://localhost:3310', {
      signal: AbortSignal.timeout(5000),
    });
    const html = await response.text();
    expect(html).toContain(lotId);
    expect(html).toContain(`/categories/${categoryId}`);
  }).toPass({ timeout: 45000, intervals: [1000, 2000, 5000] });
  await page.goto('http://localhost:3310');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Big upgrade. Smart move.|Bid. Win. Save.|Bid. Win. Make it yours./,
    }),
  ).toBeVisible();
  await capture(page, 'home', testInfo);
  await auditHome('http://localhost:3310', testInfo);
  // Sign-up returns to ?next (home by default); continue on the profile page.
  await page.goto('http://localhost:3310/sign-up?next=/account');
  await capture(page, 'sign-in', testInfo);
  const email = `${randomUUID()}@example.test`;
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Full name', { exact: true }).fill('Chiamaka Demo');
  await page
    .getByLabel('Password', { exact: true })
    .fill('Synthetic fixture password 42');
  await page
    .getByLabel('Confirm password', { exact: true })
    .fill('Synthetic fixture password 42');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page.getByLabel('Six-digit code')).toBeVisible();
  await capture(page, 'email-code', testInfo);
  const code = await control('code', email);
  if (typeof code !== 'string') throw new Error('Missing fixture email');
  await page.getByLabel('Six-digit code').pressSequentially(code);
  // Freeze before the session schedules renewal so slow CI requests cannot
  // cross that timer before the response listener is installed.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  // The account screen loads on demand, and React reveals it on a short
  // timer. Step the frozen clock until it appears; the session re-arms its
  // renewal timer as it settles, so the steps are not deducted below.
  const profile = page.getByRole('heading', { name: 'Profile', exact: true });
  // Sign-in has completed (and scheduled renewal) once the page moves on.
  await expect(page).toHaveURL(/\/account$/);
  await expect
    .poll(
      async () => {
        if (await profile.isVisible()) return true;
        await page.clock.runFor(50);
        return false;
      },
      { timeout: 30000 },
    )
    .toBe(true);
  await expect(page.getByText('Email verified', { exact: true })).toBeVisible();
  // Approach renewal before opening the request so its 10-second timeout
  // does not expire when the browser clock advances across the refresh timer.
  await page.clock.fastForward(14 * 60 * 1000 + 29 * 1000);
  await page.getByLabel('Full name', { exact: true }).fill('Chiamaka Okafor');
  let releaseSave: () => void = () => {};
  let savedOnServer: () => void = () => {};
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const persisted = new Promise<void>((resolve) => {
    savedOnServer = resolve;
  });
  await page.route('http://localhost:4400/auth/profile', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    savedOnServer();
    await saveGate;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await persisted;
  const walletCredentials: string[] = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === '/wallet' &&
      request.method() === 'GET'
    )
      walletCredentials.push(request.headers().authorization ?? '');
  });
  const rotated = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/auth/refresh' &&
      response.status() === 200,
  );
  await page.clock.fastForward(1000);
  const renewed: unknown = await (await rotated).json();
  if (
    !renewed ||
    typeof renewed !== 'object' ||
    !('accessToken' in renewed) ||
    typeof renewed.accessToken !== 'string'
  )
    throw new Error('Missing test token renewal.');
  await expect
    .poll(() => walletCredentials.includes(`Bearer ${renewed.accessToken}`))
    .toBe(true);
  releaseSave();
  await expect(page.getByText('Your profile has been saved.')).toBeVisible();
  await page.clock.resume();
  await page.unroute('http://localhost:4400/auth/profile');
  // Sign-up reached this route by SPA navigation from home and sign-up.
  // Measure it as a cold document, as for the watchlist below.
  if (productionAudit) await page.reload();
  await capture(page, 'account', testInfo);
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await expect(
    page.getByText('Available to spend', { exact: true }).last(),
  ).toBeVisible();
  await page.getByLabel('Amount to Fund').fill('10000');
  await page.getByRole('button', { name: /^Payment method/ }).click();
  await page.getByText('Nigerian card', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Show fee and wallet credit' })
    .click();
  // Buyers cover the processing fee, so the wallet receives the full amount.
  await expect(page.getByText('Your wallet receives')).toBeVisible();
  await expect(page.getByText('₦10,000', { exact: true }).last()).toBeVisible();
  await page.route('https://checkout.paystack.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<p>Isolated test checkout complete.</p><a href="http://localhost:3310/wallet">Return to wallet</a>',
    }),
  );
  await page.getByRole('button', { name: /^Accept fee and pay/ }).click();
  await page.getByRole('link', { name: 'Return to wallet' }).click();
  await page
    .getByRole('button', { name: 'Check status', exact: true })
    .first()
    .click();
  await expect(
    page.getByText('Payment confirmed. Your wallet has been credited.'),
  ).toBeVisible();
  await capture(page, 'wallet', testInfo);
  await page.getByRole('link', { name: 'LotVanta home', exact: true }).click();
  // Wait for hydration so the watch click is handled by the client.
  await expect(page.locator('[data-buyer-ready="true"]')).toBeVisible();
  await page
    .getByRole('button', { name: 'Watch Hisense electric kettle', exact: true })
    .first()
    .click();
  await expect(
    page.getByText('Lot saved to your watchlist.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Watch Hisense electric kettle',
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .locator('header')
    .getByRole('link', { name: /^Watchlist/ })
    .click();
  await expect(
    page.getByRole('link', { name: 'Hisense electric kettle', exact: true }),
  ).toBeVisible();
  // The card-funding and catalogue visits above deliberately exercise SPA
  // navigation. Measure this route as a cold document rather than counting
  // JavaScript retained from those earlier routes.
  if (productionAudit) await page.reload();
  await capture(page, 'watchlist', testInfo);
  await page
    .getByRole('button', {
      name: 'Unwatch Hisense electric kettle',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'No active items saved', exact: true }),
  ).toBeVisible();
  await page.goto(`http://localhost:3310/lots/${lotId}`);
  await expect(
    page
      .getByRole('region', { name: 'Auction bidding', exact: true })
      .getByRole('button', { name: 'Bid now', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Your bid amount').fill('1000');
  await expect(
    page
      .getByRole('region', { name: 'Auction bidding', exact: true })
      .getByRole('button', { name: 'Bid now', exact: true }),
  ).toBeEnabled();
  await page.context().setOffline(true);
  await expect(
    page
      .getByRole('region', { name: 'Auction bidding', exact: true })
      .getByRole('button', { name: 'Bid now', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('You’re offline. Reconnect to see prices and place a bid.'),
  ).toBeVisible();
  await capture(page, 'lot-offline', testInfo);
  await page.context().setOffline(false);
  await expect(
    page
      .getByRole('region', { name: 'Auction bidding', exact: true })
      .getByRole('button', { name: 'Bid now', exact: true }),
  ).toBeEnabled();
  await capture(page, 'lot', testInfo);
  await page
    .getByRole('region', { name: 'Auction bidding', exact: true })
    .getByRole('button', { name: 'Bid now', exact: true })
    .click();
  await capture(page, 'bid-confirm', testInfo);
  expect(reservations).toBe(0);
  await page
    .getByRole('button', { name: 'Place bid ₦1,000', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Auction bidding', exact: true })
      .getByRole('status')
      .filter({ hasText: /^You’re winning$/ }),
  ).toBeVisible();
  expect(reservations).toBeGreaterThan(0);
  await control('outbid');
  await expect(
    page
      .getByRole('region', { name: 'Auction bidding', exact: true })
      .getByRole('status')
      .filter({ hasText: /^You’re winning$/ }),
  ).toBeHidden();
  await page.getByLabel('Your bid amount').fill('3000');
  await page
    .getByRole('region', { name: 'Auction bidding', exact: true })
    .getByRole('button', { name: 'Bid now', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Place bid ₦3,000', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Auction bidding', exact: true })
      .getByRole('status')
      .filter({ hasText: /^You’re winning$/ }),
  ).toBeVisible();
  const settlement = (await control('close')) as {
    status: string;
    invoiceId: string;
  };
  expect(settlement.status).toBe('paid');
  for (const [path, heading, name] of [
    ['/watchlist', 'Watchlist', 'watchlist-empty'],
    ['/my-bids', 'Bid history', 'my-bids'],
    ['/invoices', 'Invoices', 'invoices'],
    [`/invoices/${settlement.invoiceId}`, undefined, 'invoice'],
    [
      `/invoices/${settlement.invoiceId}/pickup-pass`,
      'Check-in',
      'pickup-pass',
    ],
    [`/categories/${categoryId}`, 'Home appliances', 'category'],
    ['/categories', 'Browse categories', 'categories'],
    ['/ending-soon', 'Ending soon', 'ending-soon'],
    ['/locations', 'Pickup locations', 'locations'],
    ['/help', 'Help centre', 'help'],
    ['/search?q=kettle', 'Search: kettle', 'search'],
  ] as const) {
    await page.goto(`http://localhost:3310${path}`);
    // Some page titles are styled in capitals (e.g. category names).
    if (heading)
      await expect(
        page.getByRole('heading', {
          name: new RegExp(
            `^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
          ),
        }),
      ).toBeVisible();
    if (name === 'pickup-pass')
      await expect(page.getByAltText('Private check-in QR code')).toBeVisible();
    await capture(page, name, testInfo);
  }
  await page.goto(`http://localhost:3310/invoices/${randomUUID()}`);
  await expect(
    page.getByRole('heading', { name: 'Invoice unavailable', exact: true }),
  ).toBeVisible();
  await capture(page, 'invoice-error', testInfo);
  const cookies = await page.context().cookies('http://localhost:4400/auth');
  expect(
    cookies.find((cookie) => cookie.name === 'auction_refresh')?.httpOnly,
  ).toBe(true);
  await page.goto('http://localhost:3310/account');
  if (
    await page
      .getByRole('button', { name: 'My account', exact: true })
      .isVisible()
  )
    await page.getByRole('button', { name: 'My account', exact: true }).click();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3310/');
  await page.goto('http://localhost:3310/wallet');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fwallet/);
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  await capture(page, 'private-sign-in', testInfo);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([
    'auction-ng-device',
  ]);
});

test('email signup collects the buyer name and safely returns to the requested private page', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  trackScriptTransfers(page);
  await page.goto('http://localhost:3310/wallet');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fwallet/);
  await expect(page.locator('header').getByRole('combobox')).toHaveCount(0);
  await page
    .getByRole('link', { name: 'Create an account', exact: true })
    .click();
  await expect(page).toHaveURL(/\/sign-up\?next=%2Fwallet/);
  await capture(page, 'signup', testInfo);
  const email = `${randomUUID()}@example.test`;
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Full name', { exact: true }).fill('Chiamaka Demo');
  await page
    .getByLabel('Password', { exact: true })
    .fill('Synthetic fixture password 42');
  await page
    .getByLabel('Confirm password', { exact: true })
    .fill('Synthetic fixture password 42');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page.getByLabel('Six-digit code')).toBeVisible();
  const code = await control('code', email);
  if (typeof code !== 'string')
    throw new Error('Missing isolated signup code.');
  await page.getByLabel('Six-digit code').pressSequentially(code);
  await page.getByRole('button', { name: 'Verify and sign in' }).click();

  await expect(page).toHaveURL('http://localhost:3310/wallet');
  await expect(
    page.getByText('Available to spend', { exact: true }).last(),
  ).toBeVisible();
  await page.goto('http://localhost:3310/account');
  await expect(page.getByLabel('Full name')).toHaveValue('Chiamaka Demo');
  await expect(page.getByText('Email verified')).toBeVisible();
});
