import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
/* global localStorage,document,innerWidth,window,getComputedStyle */
const dir = 'docs/design/lot-detail-information';
mkdirSync(dir, { recursive: true });
const { items } = await (
  await fetch('http://localhost:4000/lots?limit=50')
).json();
const lot = items.find(
  (item) =>
    item.lotNumber.startsWith('DEMO-') && item.thumbnail && !item.bidCount,
);
assert.ok(lot, 'An empty photographic demo lot is required.');
const browser = await chromium.launch();
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
    await page.goto(`http://localhost:3300/lots/${lot.id}`);
    const aside = page.locator('.agn-lot-detail-aside:visible').first();
    const history = aside.locator('[aria-label="Bid history"]');
    await history.getByText('Demo history preview', { exact: true }).waitFor();
    assert.equal(await history.locator('tbody tr').count(), 10);
    const first = await history.locator('tbody tr').first().textContent();
    await history
      .getByRole('button', { name: 'Next page', exact: true })
      .click();
    assert.equal(await history.locator('tbody tr').count(), 10);
    assert.notEqual(
      await history.locator('tbody tr').first().textContent(),
      first,
    );
    await history
      .getByRole('button', { name: 'Next page', exact: true })
      .click();
    assert.equal(await history.locator('tbody tr').count(), 3);
    assert.equal(
      await history
        .getByRole('button', { name: 'Next page', exact: true })
        .count(),
      0,
    );
    await history
      .getByRole('button', { name: 'Previous page', exact: true })
      .click();
    await history
      .getByRole('button', { name: 'Previous page', exact: true })
      .click();
    assert.equal(
      await history.locator('tbody tr').first().textContent(),
      first,
    );
    const sections = aside.locator('.agn-detail-information');
    if (width === 360) {
      const historyUrl = `http://localhost:4000/lots/${lot.id}/bid-history?*`;
      await page.route(historyUrl, (route) =>
        route.fulfill({ status: 503, body: '{}' }),
      );
      await history
        .getByRole('button', { name: 'Refresh bid history', exact: true })
        .click();
      await history
        .getByText('Bid history could not be loaded', { exact: true })
        .waitFor();
      assert.equal(await history.locator('tbody tr').count(), 0);
      await page.unroute(historyUrl);
      await history
        .getByRole('button', { name: 'Try again', exact: true })
        .click();
      await history
        .getByText('Demo history preview', { exact: true })
        .waitFor();
      assert.equal(await history.locator('tbody tr').count(), 10);
    }
    assert.equal(await sections.count(), 4);
    const labels = await sections.locator('summary h2').allTextContents();
    assert.deepEqual(labels, [
      'Description',
      'Condition',
      'Pickup and delivery',
      'Auction policies',
    ]);
    const positions = await aside.evaluate((el) =>
      Array.from(el.children).map((child) =>
        child.textContent?.trim().slice(0, 60),
      ),
    );
    const descriptionIndex = positions.findIndex((value) =>
      value?.startsWith('Description'),
    );
    const historyIndex = positions.findIndex((value) =>
      value?.startsWith('Bid History'),
    );
    const conditionIndex = positions.findIndex((value) =>
      value?.startsWith('Condition'),
    );
    assert.ok(
      descriptionIndex >= 0 &&
        historyIndex > descriptionIndex &&
        conditionIndex > historyIndex,
    );
    await sections.nth(2).locator('summary').click();
    await expect(sections.nth(2)).toHaveAttribute('open', '');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${dir}/page-${width}.png`, fullPage: true });
    const gallery = page.locator('.agn-detail-gallery-column:visible').first();
    if (width >= 1024) {
      await history.scrollIntoViewIfNeeded();
      assert.equal(
        await gallery.evaluate((el) => getComputedStyle(el).position),
        'sticky',
      );
      const bounds = await gallery.boundingBox();
      assert.ok(bounds && bounds.y >= 90 && bounds.y <= 105);
      await page.screenshot({ path: `${dir}/sticky-${width}.png` });
    } else
      assert.equal(
        await gallery.evaluate((el) => getComputedStyle(el).position),
        'static',
      );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.ok(
      await page
        .getByRole('heading', { name: 'Similar items', exact: true })
        .count(),
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      sectionOrder: true,
      demoPages: [10, 10, 3],
      previousPage: true,
      stickyDesktop: width >= 1024,
      overflow: false,
      browserErrors: [],
    });
    await page.close();
  }
  writeFileSync(
    `${dir}/layout-review.json`,
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
