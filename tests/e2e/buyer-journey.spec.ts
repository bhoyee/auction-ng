import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  auditHome,
  productionAudit,
  recordScriptBudget,
  trackScriptTransfers,
} from './web-budgets';

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
    });
    await testInfo.attach(`${name}-${width}`, {
      path,
      contentType: 'image/png',
    });
  }
}
test('buyer signs up, pays the disclosed fee, bids, is outbid, wins and opens a private pass', async ({
  page,
}, testInfo) => {
  test.setTimeout(240000);
  await page.clock.install();
  trackScriptTransfers(page);
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
    page.getByRole('heading', { name: 'Today’s auctions' }),
  ).toBeVisible();
  await capture(page, 'home', testInfo);
  await auditHome('http://localhost:3310', testInfo);
  await page.goto('http://localhost:3310/sign-in');
  await capture(page, 'sign-in', testInfo);
  const email = `${randomUUID()}@example.test`;
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByLabel('Six-digit code')).toBeVisible();
  await capture(page, 'email-code', testInfo);
  const code = await control('code', email);
  if (typeof code !== 'string') throw new Error('Missing fixture email');
  await page.getByLabel('Six-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your account' }),
  ).toBeVisible();
  await expect(
    page.getByText('Phone verification required before bidding'),
  ).toBeVisible();
  await control('verify-phone', email);
  await page.reload();
  await expect(page.getByText('Phone verified', { exact: true })).toBeVisible();
  // Approach renewal before opening the request so its 10-second timeout
  // does not expire when the browser clock advances across the refresh timer.
  await page.clock.fastForward(14 * 60 * 1000 + 29 * 1000);
  await page.getByLabel('Your name', { exact: true }).fill('Chiamaka Okafor');
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
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
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
  await expect(page.getByText('Your name has been saved.')).toBeVisible();
  await page.unroute('http://localhost:4400/auth/profile');
  await capture(page, 'account', testInfo);
  await page.getByRole('link', { name: /^Wallet/ }).click();
  await expect(
    page.getByText('Available to bid', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Amount to pay').fill('10000');
  await page.getByLabel('Payment method').selectOption('local');
  await page
    .getByRole('button', { name: 'Show fee and wallet credit' })
    .click();
  await expect(page.getByText('₦9,750', { exact: true })).toBeVisible();
  await page.route('https://checkout.paystack.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<p>Isolated test checkout complete.</p><a href="http://localhost:3310/wallet">Return to wallet</a>',
    }),
  );
  await page.getByRole('button', { name: 'Accept fee and pay' }).click();
  await page.getByRole('link', { name: 'Return to wallet' }).click();
  await page
    .getByRole('button', { name: 'Check pending card payment' })
    .click();
  await expect(
    page.getByText('Payment confirmed. Your wallet has been credited.'),
  ).toBeVisible();
  await capture(page, 'wallet', testInfo);
  await page
    .getByRole('button', { name: 'Set up personal transfer account' })
    .click();
  await expect(page.getByLabel('Your bank', { exact: true })).toBeEnabled();
  await page.getByLabel('Your bank', { exact: true }).selectOption('007');
  await capture(page, 'transfer-account-setup', testInfo);
  await page.getByLabel('First name', { exact: true }).fill('Chiamaka');
  await page.getByLabel('Last name', { exact: true }).fill('Okafor');
  await page
    .getByLabel('Nigerian phone number', { exact: true })
    .fill('08031234567');
  await page.getByLabel('BVN', { exact: true }).fill('12345678901');
  await page
    .getByLabel('Your existing bank account number', { exact: true })
    .fill('0123456789');
  await page.getByRole('checkbox').check();
  await page
    .getByRole('button', {
      name: 'Request personal transfer account',
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      'The account could not be created. Check your details or try again when bank verification is available.',
    ),
  ).toBeVisible();
  await expect(page.getByLabel('BVN', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page
    .getByRole('link', { name: 'Auction NG home', exact: true })
    .click();
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
  await page.getByRole('link', { name: 'Watchlist', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Hisense electric kettle', exact: true }),
  ).toBeVisible();
  // The card-funding and catalogue visits above deliberately exercise SPA
  // navigation. Measure this route as a cold document rather than counting
  // JavaScript retained from those earlier routes.
  if (productionAudit) await page.reload();
  await capture(page, 'watchlist', testInfo);
  await page
    .getByRole('button', { name: 'Remove from watchlist', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'No saved lots yet', exact: true }),
  ).toBeVisible();
  await page.goto(`http://localhost:3310/lots/${lotId}`);
  await expect(
    page.getByRole('button', { name: 'Review bid', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Your bid amount').fill('1000');
  await page.context().setOffline(true);
  await expect(
    page.getByRole('button', { name: 'Review bid', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('You’re offline. Reconnect to see prices and place a bid.'),
  ).toBeVisible();
  await capture(page, 'lot-offline', testInfo);
  await page.context().setOffline(false);
  await expect(
    page.getByRole('button', { name: 'Review bid', exact: true }),
  ).toBeEnabled();
  await capture(page, 'lot', testInfo);
  await page.getByRole('button', { name: 'Review bid', exact: true }).click();
  await capture(page, 'bid-confirm', testInfo);
  await page
    .getByRole('button', { name: 'Place bid ₦1,000', exact: true })
    .click();
  await expect(
    page.locator('.agn-badge').filter({ hasText: /^You’re winning$/ }),
  ).toBeVisible();
  await control('outbid');
  await expect(
    page.locator('.agn-badge').filter({ hasText: /^You’re winning$/ }),
  ).toBeHidden();
  await page.getByLabel('Your bid amount').fill('3000');
  await page.getByRole('button', { name: 'Review bid', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place bid ₦3,000', exact: true })
    .click();
  await expect(
    page.locator('.agn-badge').filter({ hasText: /^You’re winning$/ }),
  ).toBeVisible();
  const settlement = (await control('close')) as {
    status: string;
    invoiceId: string;
  };
  expect(settlement.status).toBe('paid');
  for (const [path, heading, name] of [
    ['/watchlist', 'Watchlist', 'watchlist-empty'],
    ['/my-bids', 'My bids', 'my-bids'],
    ['/invoices', 'Invoices', 'invoices'],
    [`/invoices/${settlement.invoiceId}`, undefined, 'invoice'],
    [
      `/invoices/${settlement.invoiceId}/pickup-pass`,
      'Your pickup pass',
      'pickup-pass',
    ],
    [`/categories/${categoryId}`, 'Category auctions', 'category'],
    ['/categories', 'Browse categories', 'categories'],
    ['/ending-soon', 'Ending soon', 'ending-soon'],
    ['/locations', 'Pickup locations', 'locations'],
    ['/help', 'How bidding works', 'help'],
    ['/search?q=kettle', 'Search: kettle', 'search'],
  ] as const) {
    await page.goto(`http://localhost:3310${path}`);
    if (heading)
      await expect(
        page.getByRole('heading', { name: heading, exact: true }),
      ).toBeVisible();
    if (name === 'pickup-pass')
      await expect(page.getByAltText('Private pickup QR code')).toBeVisible();
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
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await page.goto('http://localhost:3310/wallet');
  await expect(
    page.getByRole('heading', {
      name: 'Sign in to view your account',
      exact: true,
    }),
  ).toBeVisible();
  await capture(page, 'private-sign-in', testInfo);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([
    'auction-ng-device',
  ]);
});
