import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
/* global localStorage,document,innerWidth,getComputedStyle */
const history = process.argv.includes('--history');
const dir = history
  ? 'docs/design/lot-history'
  : 'docs/design/premium-lot-detail';
mkdirSync(dir, { recursive: true });
const lots = (
  await (
    await fetch('http://localhost:4000/lots?topDeals=true&limit=50')
  ).json()
).items;
const lot = lots.find((l) => l.fixedPriceKobo);
assert.ok(lot, 'A visible fixed-price demo lot is required.');
const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await page.goto(`http://localhost:3300/lots/${lot.id}`);
    await page
      .locator('.agn-detail-summary:visible .agn-countdown-segment')
      .first()
      .waitFor({ timeout: 30000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    if (history) {
      const panel = page
        .locator('[aria-label="Auction bidding"]:visible')
        .first();
      await panel.getByText('Item ID', { exact: true }).waitFor();
      assert.equal(
        await panel
          .getByRole('button', { name: 'Save to watchlist', exact: true })
          .count(),
        1,
      );
      assert.equal(
        await panel
          .getByRole('button', { name: 'Share lot', exact: true })
          .count(),
        1,
      );
      const join = panel.getByRole('link', {
        name: 'Join Now to Bid',
        exact: true,
      });
      const initial = await join.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      await join.hover();
      assert.notEqual(
        await join.evaluate((el) => getComputedStyle(el).backgroundColor),
        initial,
      );
      const discount = panel.locator('.agn-detail-discount');
      assert.equal(
        await discount.evaluate((el) => getComputedStyle(el).color),
        'rgb(200, 52, 28)',
      );
      assert.ok(
        Number(
          await page
            .getByRole('link', { name: 'Buy Now', exact: true })
            .first()
            .evaluate((el) => getComputedStyle(el).fontWeight),
        ) >= 700,
      );
    }
    await page.screenshot({
      path: `${dir}/page-${width}.png`,
      fullPage: true,
    });
    console.log(JSON.stringify({ width, url: page.url(), live: true }));
    await page.close();
  }
} finally {
  await browser.close();
}
