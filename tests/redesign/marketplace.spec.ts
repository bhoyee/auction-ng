import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  auditHome,
  productionAudit,
  recordScriptBudget,
  trackScriptTransfers,
} from '../e2e/web-budgets';
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
  test.setTimeout(360000);
  backend = spawn(process.execPath, ['scripts/web-buyer-test-server.mjs'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  backend.stdout?.on('data', () => {});
  backend.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Isolated buyer backend did not start.')),
      300000,
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

async function capture(page: Page, name: string, info: TestInfo) {
  await expect(page.locator('[data-buyer-ready="true"]')).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  if (name.endsWith('signed-in'))
    await expect(
      page.locator('.agn-lot').getByText('Updating price…', { exact: true }),
    ).toHaveCount(0, { timeout: 15000 });
  await recordScriptBudget(page, name, info);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const bidAction = page.locator('.agn-lot .agn-button--primary').first();
    if (width <= 768 && (await bidAction.count()))
      await expect(bidAction).toHaveCSS('opacity', '1');
    await page.evaluate(() => {
      // Offscreen horizontal rails never intersect a vertical full-page capture.
      // Load their photos explicitly for evidence; Lighthouse uses a fresh page.
      for (const image of Array.from(document.images)) image.loading = 'eager';
      // Full-page evidence needs regions that a normal viewport skips rendering.
      for (const section of Array.from(
        document.querySelectorAll<HTMLElement>('.agn-home > section'),
      ))
        section.style.contentVisibility = 'visible';
      window.scrollTo(0, 0);
    });
    await expect(async () => {
      expect(
        await page
          .locator('img')
          .evaluateAll((images) =>
            images
              .filter(
                (image) =>
                  image instanceof HTMLImageElement &&
                  image.getClientRects().length &&
                  (!image.complete || !image.naturalWidth),
              )
              .map((image) => image.getAttribute('src')),
          ),
      ).toEqual([]);
    }).toPass({ timeout: 15000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator('img')
        .evaluateAll((images) =>
          images
            .filter(
              (image) =>
                image instanceof HTMLImageElement &&
                image.getClientRects().length &&
                !image.naturalWidth,
            )
            .map((image) => image.getAttribute('src')),
        ),
    ).toEqual([]);
    const path = info.outputPath(`${name}-${width}.png`);
    await page.screenshot({
      path,
      fullPage: true,
      animations: 'disabled',
      mask: [page.getByAltText('Private pickup QR code')],
      maskColor: '#EEF0FA',
    });
    await info.attach(`${name}-${width}`, { path, contentType: 'image/png' });
  }
}

test('photographic marketplace stays usable across buyer routes and viewport sizes', async ({
  page,
}, info) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  const liveConnections = new Set<object>();
  page.on('websocket', (socket) => {
    if (!new URL(socket.url()).pathname.startsWith('/socket.io/')) return;
    liveConnections.add(socket);
    socket.on('close', () => liveConnections.delete(socket));
  });
  trackScriptTransfers(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(async () => {
    const response = await page.request.get('http://localhost:4450/categories');
    expect(response.ok()).toBe(true);
    const categories: unknown = await response.json();
    expect(
      categories &&
        typeof categories === 'object' &&
        'items' in categories &&
        Array.isArray(categories.items)
        ? categories.items.length
        : 0,
    ).toBe(12);
  }).toPass({ timeout: 30000 });
  for (const [path, name] of [
    ['/', 'home-signed-out'],
    ['/categories', 'categories-signed-out'],
    [`/categories/${categoryId}`, 'category-signed-out'],
    ['/ending-soon', 'ending-soon-signed-out'],
    ['/search?q=laptop', 'search-signed-out'],
    [`/lots/${lotId}`, 'lot-signed-out'],
    ['/sign-in', 'sign-in'],
    ['/sign-up', 'sign-up'],
    ['/help', 'help'],
    ['/locations', 'locations'],
  ] as const) {
    await page.goto(`http://localhost:3310${path}`);
    await capture(page, name, info);
    if (name === 'home-signed-out') {
      await expect(page.locator('.agn-announcement')).toHaveCount(0);
      await expect(page.locator('.agn-demo-notice')).toHaveCount(0);
      await expect(page.locator('header .agn-category-menu')).toHaveCount(0);
      const shopping = page.getByRole('navigation', { name: 'Shop auctions' });
      await expect(shopping.locator('.agn-shopping-links a')).toHaveText([
        'All deals',
        'Top deals',
        'Ending soon',
      ]);
      const help = page.locator('.agn-help-menu');
      await help.locator('summary').click();
      await expect(help.locator('a:not(.agn-whatsapp)')).toHaveText([
        'Help centre',
        'FAQs',
        'Contact us',
        'Returns & refunds',
      ]);
      await expect(help.locator('.agn-whatsapp')).toHaveCount(1);
      await expect(
        page.locator('.agn-header-support > .agn-whatsapp'),
      ).toHaveCount(0);
      await help.press('Escape');
      await expect(help).not.toHaveAttribute('open', '');
      await help.locator('summary').click();
      await help.getByRole('link', { name: 'FAQs', exact: true }).click();
      await expect(page).toHaveURL(/\/help#faqs$/);
      await expect(
        page.getByRole('heading', { name: 'Frequently asked questions' }),
      ).toBeVisible();
      await expect(help).not.toHaveAttribute('open', '');
      await page.goto('http://localhost:3310/deals');
      await expect(
        page.getByRole('heading', { level: 1, name: 'All deals', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.agn-lot').first()).toBeVisible();
      await page.goto('http://localhost:3310/');
      const menu = shopping.locator('.agn-category-menu');
      await menu.locator('summary').click();
      await expect(menu.locator('.agn-mega-menu a')).toHaveCount(13);
      await menu.press('Escape');
      await expect(menu).not.toHaveAttribute('open', '');
      await page.getByRole('button', { name: 'Next promotion' }).click();
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Sign up and get in on the auction.',
        }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Next promotion' })
        .press('ArrowLeft');
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Big upgrade. Smart move.',
        }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Next promotion' })
        .press('ArrowRight');
      await page.getByRole('button', { name: 'Previous promotion' }).click();
      const search = page.getByRole('combobox', { name: 'Search auctions' });
      await search.fill('laptop');
      await expect(
        page
          .getByRole('listbox', { name: 'Search suggestions' })
          .getByRole('option')
          .first(),
      ).toBeVisible();
      await search.press('ArrowDown');
      await search.press('Enter');
      await expect(page).toHaveURL(/\/lots\//);
    }
  }
  for (const path of [
    '/wallet',
    '/my-bids',
    '/watchlist',
    '/invoices',
    '/pickup-passes',
    '/account',
  ]) {
    await page.goto(`http://localhost:3310${path}`);
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  }
  await page.goto('http://localhost:3310/sign-in');
  const email = 'demo-buyer-3@example.test';
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByLabel('Six-digit code')).toBeVisible();
  await capture(page, 'email-code', info);
  const code = await control('code', email);
  if (typeof code !== 'string')
    throw new Error('Missing isolated demo email code.');
  await page.getByLabel('Six-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page).toHaveURL('http://localhost:3310/account');
  for (const [path, name] of [
    ['/', 'home-signed-in'],
    ['/categories', 'categories-signed-in'],
    ['/ending-soon', 'ending-soon-signed-in'],
    [`/categories/${categoryId}`, 'category-signed-in'],
    ['/search?q=laptop', 'search-signed-in'],
    [`/lots/${lotId}`, 'lot-signed-in'],
    ['/my-bids', 'my-bids'],
    ['/wallet', 'wallet'],
    ['/watchlist', 'watchlist'],
    ['/account', 'account'],
  ] as const) {
    await page.goto(`http://localhost:3310${path}`);
    await capture(page, name, info);
    if (name === 'home-signed-in') {
      expect(liveConnections.size).toBe(1);
      await page.context().setOffline(true);
      await expect(
        page
          .locator('.agn-lot')
          .getByText('Updating price…', { exact: true })
          .first(),
      ).toBeVisible();
      await expect(page.locator('.agn-lot .agn-badge--win')).toHaveCount(0);
      await expect(page.locator('.agn-lot .agn-discount')).toHaveCount(0);
      await page.context().setOffline(false);
    }
    if (name === 'lot-signed-in') {
      await page.getByRole('tab', { name: 'Bid history', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Recorded bids', exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/^Buyer [A-F0-9]{6}$/)).toHaveCount(3);
    }
  }
  const closed = await control('close');
  if (
    !closed ||
    typeof closed !== 'object' ||
    !('invoiceId' in closed) ||
    typeof closed.invoiceId !== 'string'
  )
    throw new Error('Demo winner did not receive an invoice.');
  for (const [path, name] of [
    ['/invoices', 'invoices'],
    [`/invoices/${closed.invoiceId}`, 'invoice'],
    ['/pickup-passes', 'pickup-passes'],
    [`/invoices/${closed.invoiceId}/pickup-pass`, 'pickup-pass'],
  ] as const) {
    await page.goto(`http://localhost:3310${path}`);
    await capture(page, name, info);
  }
  expect(productionAudit).toBe(true);
});

test('photographic home meets the mobile 4G loading budget', async ({
  browserName,
}, info) => {
  expect(browserName).toBe('chromium');
  test.setTimeout(180000);
  expect(productionAudit).toBe(true);
  await auditHome('http://localhost:3310', info);
});
