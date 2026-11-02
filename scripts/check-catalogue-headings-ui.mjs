import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
/* global document, getComputedStyle, innerWidth, localStorage */
const dir = 'docs/design/catalogue-headings';
mkdirSync(dir, { recursive: true });
const categories = await (
  await fetch('http://localhost:4000/categories?limit=50')
).json();
const category = categories.items.sort(
  (a, b) => b.name.length - a.name.length,
)[0];
assert.ok(category, 'A demo category is needed.');
const browser = await chromium.launch(),
  results = [];
try {
  for (const width of [360, 768, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const errors = [];
    await page.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    page.on('pageerror', (error) => errors.push(error.message));
    let reference;
    for (const [name, path, title] of [
      ['all-deals', '/deals', 'ALL DEALS'],
      ['upcoming', '/upcoming-deals', 'UPCOMING DEALS'],
      ['category', '/categories/' + category.id, category.name.toUpperCase()],
    ]) {
      await page.goto('http://localhost:3300' + path);
      const heading = page.getByRole('heading', {
        name: title,
        exact: true,
        level: 1,
      });
      await expect(heading).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const style = await heading.evaluate((element) => {
        const value = getComputedStyle(element);
        return {
          fontSize: value.fontSize,
          fontWeight: value.fontWeight,
          lineHeight: value.lineHeight,
          fontFamily: value.fontFamily,
        };
      });
      reference ??= style;
      assert.deepEqual(
        style,
        reference,
        `${name} must match ALL DEALS typography at ${width}px`,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        'Heading must not overflow',
      );
      await page.screenshot({
        path: `${dir}/${name}-${width}.png`,
        fullPage: true,
      });
      results.push({ width, page: name, ...style, passed: true });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/checks.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
