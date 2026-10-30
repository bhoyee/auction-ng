import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
/* global localStorage,document,innerWidth */
const dir = 'docs/design/auction-policies';
mkdirSync(dir, { recursive: true });
const { items } = await (
  await fetch('http://localhost:4000/lots?limit=50')
).json();
const lot = items.find((item) => item.fixedPriceKobo && item.thumbnail);
assert.ok(lot, 'A priced demo lot is required.');
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
    const section = page
      .locator('.agn-detail-information:visible')
      .filter({
        has: page.getByRole('heading', {
          name: 'Auction policies',
          exact: true,
        }),
      })
      .first();
    await expect(section).toHaveAttribute('open', '');
    assert.equal(
      await section.evaluate(
        (el) =>
          el.previousElementSibling?.querySelector('summary h2')?.textContent,
      ),
      'Pickup and delivery',
    );
    const text = await section.textContent();
    for (const phrase of [
      '15%',
      '\u20a6300',
      '7.5%',
      'before accepting it and taking it away',
      'Returns are not accepted after an item leaves',
      'paid from your wallet',
      'No auction buyer premium or lot fee applies',
    ])
      assert.ok(text.includes(phrase), phrase);
    assert.doesNotMatch(
      text,
      /\$|credit card on file|no reserve|Restocking|November 2/,
    );
    assert.equal(await section.locator('.agn-badge').count(), 5);
    assert.equal(
      await section
        .getByRole('link', { name: 'Terms of Use', exact: true })
        .getAttribute('href'),
      '/terms-of-use',
    );
    const policyBounds = await section.boundingBox();
    assert.ok(policyBounds);
    await page.setViewportSize({
      width,
      height: Math.ceil(policyBounds.height) + 160,
    });
    await section.screenshot({
      path: `${dir}/policy-${width}.png`,
      style: '.agn-header-stack--compact { visibility: hidden; }',
    });
    await page.setViewportSize({ width, height: 1000 });
    await section.locator('summary').click();
    await expect(section).not.toHaveAttribute('open', '');
    await section.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(section).toHaveAttribute('open', '');
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.goto('http://localhost:3300/help#returns');
    await page
      .locator('#returns')
      .getByText(/Returns are not accepted after an item leaves/)
      .waitFor();
    await page.goto('http://localhost:3300/terms-of-use');
    await page
      .getByText(/Returns are not accepted after an item leaves/)
      .waitFor();
    assert.deepEqual(errors, []);
    results.push({
      width,
      order: true,
      currentFees: true,
      collectionInspection: true,
      noReturnsAfterCollection: true,
      helpAndTermsAligned: true,
      keyboardToggle: true,
      overflow: false,
      browserErrors: [],
    });
    await page.close();
  }
  writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
