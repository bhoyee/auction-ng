import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage,window,document */

const dir = 'docs/design/invoice-document';
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
    const orders = Array.from({ length: 11 }, (_, index) => ({
      id: randomUUID(),
      number: `ANG-${index === 0 ? 'X7Q9M2K4' : `Q8M2K4P${index}`}`,
      status: 'paid',
      saleType: index % 2 ? 'fixed_price' : 'auction',
      hammerTotalKobo: 1000000,
      premiumKobo: 150000,
      lotFeeKobo: 30000,
      vatKobo: 13500,
      totalKobo: 1193500,
      createdAt: '2026-10-31T12:00:00.000Z',
    }));
    let fail = false,
      empty = false;
    const requests = [];
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const url = new URL(route.request().url());
      const json = (value, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
        });
      if (url.pathname === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (url.pathname === '/buyers/invoices/' + orders[0].id) {
        if (fail) return json({}, 503);
        return json({
          ...orders[0],
          saleType: empty ? 'fixed_price' : 'auction',
          premiumKobo: empty ? 0 : 150000,
          lotFeeKobo: empty ? 0 : 30000,
          vatKobo: empty ? 75000 : 13500,
          totalKobo: empty ? 1075000 : 1193500,
          pickup: { location: 'Lekki collection centre', status: 'ready' },
          lines: [
            {
              lot: {
                id: orders[1].id,
                lotNumber: 'Y8P4Q2M7',
                title: 'Sony wireless noise-cancelling headphones',
                status: 'closed',
              },
              totalKobo: empty ? 1075000 : 1193500,
            },
          ],
        });
      }
      if (url.pathname === '/buyers/collections') {
        assert.equal(url.searchParams.get('limit'), '10');
        const cursor = url.searchParams.get('cursor');
        requests.push(cursor);
        if (fail) return json({}, 503);
        return json({
          items: empty ? [] : cursor ? orders.slice(10) : orders.slice(0, 10),
          nextCursor: !empty && !cursor ? 'older-orders' : null,
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
        return json({ unread: 0, awaitingPickup: 11 });
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.invoicePrintCalls = 0;
      window.print = () => {
        window.invoicePrintCalls++;
      };
    });
    await page.goto('http://localhost:3300/invoices/' + orders[0].id);
    const invoice = page.getByRole('article', {
      name: 'Invoice ' + orders[0].number,
      exact: true,
    });
    await expect(invoice).toBeVisible();
    await expect(invoice).toContainText('Amina Yusuf');
    await expect(invoice).toContainText('Service charge');
    await expect(invoice.locator('.agn-invoice-total')).toContainText('11,935');
    await expect(invoice.locator('.agn-invoice-status')).toHaveText('Paid');
    const metadata = await invoice
      .locator('.agn-invoice-details dl')
      .evaluate((list) => {
        const edge = list.getBoundingClientRect().right;
        return [...list.querySelectorAll('dd')].every(
          (value) =>
            window.getComputedStyle(value).textAlign === 'right' &&
            Math.abs(value.getBoundingClientRect().right - edge) < 1,
        );
      });
    assert.equal(metadata, true, 'Invoice metadata values align to the right');
    await expect(
      page.getByRole('link', { name: 'Back to awaiting pickup', exact: true }),
    ).toHaveAttribute('href', '/awaiting-pickup');
    await expect(
      invoice.getByRole('link', { name: 'Open pickup pass', exact: true }),
    ).toHaveAttribute('href', '/invoices/' + orders[0].id + '/pickup-pass');
    await page
      .getByRole('button', { name: 'Print / Save as PDF', exact: true })
      .click();
    assert.equal(await page.evaluate(() => window.invoicePrintCalls), 1);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: dir + '/invoice-' + width + '.png',
      fullPage: true,
    });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.agn-invoice-toolbar')).toBeHidden();
    await expect(page.locator('.agn-portal-sidebar')).toBeHidden();
    await expect(page.locator('.agn-header-region')).toBeHidden();
    await expect(page.locator('footer')).toBeHidden();
    await expect(invoice).toBeVisible();
    if (width === 1280) {
      const pdf = await page.pdf({
        path: dir + '/sample-invoice.pdf',
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
      assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
      await page.screenshot({
        path: dir + '/print-preview.png',
        fullPage: true,
      });
    }
    await page.emulateMedia({ media: 'screen' });
    empty = true;
    await page.reload();
    await expect(invoice).toContainText('Fixed item price');
    await expect(invoice).not.toContainText('Service charge');
    await expect(invoice.locator('.agn-invoice-total')).toContainText('10,750');
    await page.screenshot({
      path: dir + '/buy-now-' + width + '.png',
      fullPage: true,
    });
    fail = true;
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Invoice unavailable', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Print / Save as PDF', exact: true }),
    ).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(invoice).toBeVisible();
    assert.deepEqual(errors, []);
    results.push({
      width,
      itemisedInvoice: true,
      recordedAmounts: true,
      buyNowLabels: true,
      backAndPrivatePass: true,
      printAction: true,
      printOnlyInvoice: true,
      errorRetry: true,
      noHorizontalOverflow: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(dir + '/review.json', JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
