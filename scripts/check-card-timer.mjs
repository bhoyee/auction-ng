import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser = await chromium.launch();
const dir = 'docs/design/card-image-timer';
fs.mkdirSync(dir, { recursive: true });
const results = [];
try {
  for (const width of [360, 768, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await page.goto('http://localhost:3300/');
    const card = page.locator('#top-deals:visible .agn-lot').first();
    await card.locator('.agn-countdown-segment').first().waitFor();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    assert.equal(await card.locator('.agn-countdown-segment').count(), 4);
    assert.equal(await card.locator('.agn-lot-bid-count').count(), 0);
    const clock = card.locator('.agn-countdown');
    const before = await clock.textContent();
    await page.waitForTimeout(1100);
    assert.notEqual(await clock.textContent(), before);
    const photoBox = await card.locator('.agn-lot-photo').boundingBox();
    const timerBox = await clock.boundingBox();
    assert.ok(
      photoBox &&
        timerBox &&
        timerBox.y >= photoBox.y &&
        timerBox.y + timerBox.height <= photoBox.y + photoBox.height &&
        timerBox.x >= photoBox.x &&
        timerBox.x + timerBox.width <= photoBox.x + photoBox.width,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await card.screenshot({ path: `${dir}/card-${width}.png` });
    await page.screenshot({ path: `${dir}/home-${width}.png` });
    if (width === 1280) {
      await card.locator('.agn-lot-title').click();
      await page.getByRole('tab', { name: /^Bid history \(\d+\)$/ }).waitFor();
    }
    assert.deepEqual(errors, []);
    results.push({
      width,
      fourSegments: true,
      ticking: true,
      insideImage: true,
      bidCountRemoved: true,
      overflow: false,
      browserErrors: [],
    });
    await page.close();
  }
  fs.writeFileSync(
    `${dir}/review.json`,
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
/* global localStorage, document, innerWidth */
