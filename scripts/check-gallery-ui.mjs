import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
/* global localStorage, document, innerWidth, getComputedStyle */
const dir = 'docs/design/gallery-image-viewer';
mkdirSync(dir, { recursive: true });
const { items } = await (
  await fetch('http://localhost:4000/lots?limit=20')
).json();
const lot = items.find((item) => item.thumbnail);
assert.ok(lot, 'A photographic demo lot is required.');
const browser = await chromium.launch();
const review = [];
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
    await page.goto(`http://localhost:3300/lots/${lot.id}`);
    const photo = page.locator('.agn-gallery-main:visible').first();
    await photo.locator('img').evaluate((img) => img.decode());
    assert.equal(
      await page.getByText('View larger', { exact: true }).count(),
      0,
    );
    const frame = await photo.boundingBox(),
      image = await photo.locator('img').boundingBox();
    assert.ok(frame && image);
    assert.ok(
      Math.abs(frame.height - image.height) <= 2 &&
        Math.abs(frame.width - image.width) <= 2,
    );
    assert.equal(
      await photo
        .locator('img')
        .evaluate((img) => getComputedStyle(img).objectFit),
      'cover',
    );
    await photo.screenshot({ path: `${dir}/gallery-${width}.png` });
    await photo.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.locator('img').evaluate((img) => img.decode());
    const close = dialog.getByRole('button', { name: 'Close dialog' });
    const closeBox = await close.boundingBox(),
      dialogBox = await dialog.boundingBox();
    assert.ok(
      closeBox && dialogBox && closeBox.x > dialogBox.x + dialogBox.width / 2,
    );
    assert.equal(
      await dialog
        .locator('img')
        .evaluate((img) => getComputedStyle(img).objectFit),
      'contain',
    );
    await page.screenshot({ path: `${dir}/enlarged-${width}.png` });
    await close.click();
    await dialog.waitFor({ state: 'hidden' });
    await photo.focus();
    await page.keyboard.press('Enter');
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await expect(photo).toBeFocused();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    review.push({
      width,
      frameFilled: true,
      imageOpens: true,
      topRightClose: true,
      keyboardAndEscape: true,
      focusRestored: true,
      overflow: false,
      browserErrors: [],
    });
    await page.close();
  }
  writeFileSync(`${dir}/review.json`, JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify(review));
} finally {
  await browser.close();
}
