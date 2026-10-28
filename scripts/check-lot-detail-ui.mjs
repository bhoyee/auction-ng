import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
/* global localStorage,document,innerWidth */
mkdirSync('docs/design/premium-lot-detail', { recursive: true });
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
    await page.screenshot({
      path: `docs/design/premium-lot-detail/page-${width}.png`,
      fullPage: true,
    });
    console.log(JSON.stringify({ width, url: page.url(), live: true }));
    await page.close();
  }
} finally {
  await browser.close();
}
