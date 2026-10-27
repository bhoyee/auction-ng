import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const dir = 'docs/design/past-auctions';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const review = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/');
    const footer = page.locator('footer:visible').first();
    const email = footer
      .locator('nav[aria-label="Buyer help"]')
      .getByRole('link', { name: 'info@auctionng.com', exact: true });
    await email.waitFor();
    assert.equal(
      await email.evaluate((node) => getComputedStyle(node).fontWeight),
      '700',
    );
    await footer.scrollIntoViewIfNeeded();
    await page.addStyleTag({
      content: '.agn-header-stack--compact{visibility:hidden !important;}',
    });
    await footer.screenshot({ path: `${dir}/footer-${width}.png` });
    await footer
      .getByRole('link', { name: 'Past Auctions', exact: true })
      .click();
    await page
      .getByRole('heading', { level: 1, name: 'Past Auctions', exact: true })
      .waitFor();
    const count = await page.locator('.agn-past-auction-card').count();
    if (!count)
      await page
        .getByRole('heading', { name: 'No completed purchases to show' })
        .waitFor();
    assert.equal(
      await page.locator('main').getByRole('button', { name: /bid/i }).count(),
      0,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${dir}/past-auctions-${width}.png` });
    review.push({
      width,
      emailUnderHelp: true,
      boldEmail: true,
      footerLinkWorks: true,
      purchasedLots: count,
      overflow: false,
      errors,
    });
    await context.close();
  }
  fs.writeFileSync(
    `${dir}/review.json`,
    JSON.stringify(review, null, 2) + '\n',
  );
  console.log(JSON.stringify(review, null, 2));
} finally {
  await browser.close();
}
/* global localStorage, getComputedStyle, document, innerWidth */
