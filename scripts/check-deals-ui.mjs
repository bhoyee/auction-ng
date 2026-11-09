import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
/* global localStorage,document,innerWidth,getComputedStyle */
const dir = 'docs/design/deals-heading-assets';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const review = [];
try {
  for (const width of [360, 768, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const errors = [];
    const headingSizes = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    for (const [path, title] of [
      ['deals', 'ALL DEALS'],
      ['top-deals', 'TOP DEALS'],
      ['ending-soon', 'ENDING SOON'],
    ]) {
      await page.goto(`http://localhost:3300/${path}`);
      await page.getByRole('heading', { name: title, exact: true }).waitFor();
      headingSizes.push(
        await page
          .getByRole('heading', { name: title, exact: true })
          .evaluate((el) => getComputedStyle(el).fontSize),
      );
      const artwork = page.locator('.agn-deals-heading-image:visible').first();
      await artwork.evaluate((image) => image.decode());
      await expect(
        page.getByText('Updating auctions...', { exact: true }),
      ).toHaveCount(0);
      if (await page.locator('.agn-lot:visible').count())
        await page
          .locator('.agn-lot:visible .agn-countdown-segment')
          .first()
          .waitFor();
      assert.equal(
        await page
          .getByRole('button', { name: 'Apply filters', exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page.getByText('Pickup location', { exact: true }).count(),
        0,
      );
      await page.screenshot({
        path: `${dir}/${path}-${width}.png`,
        fullPage: true,
      });
    }
    assert.equal(new Set(headingSizes).size, 1);
    await page.goto('http://localhost:3300/deals');
    if (
      await page.getByRole('button', { name: 'Next page', exact: true }).count()
    ) {
      await page
        .getByRole('button', { name: 'Next page', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Previous page', exact: true })
        .waitFor();
      await page
        .getByRole('button', { name: 'Previous page', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Previous page', exact: true }),
      ).toHaveCount(0);
    }
    const condition = page.locator('.agn-checkbox-filter:visible').filter({
      has: page.locator('summary').filter({ hasText: /^Condition/ }),
    });
    await condition.locator('summary').click();
    const bounds = await condition.locator('fieldset').boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.equal(
      await condition.getByRole('checkbox', { checked: true }).count(),
      5,
    );
    await condition
      .getByRole('checkbox', { name: 'Like new', exact: true })
      .uncheck();
    await condition
      .getByRole('checkbox', { name: 'Damaged', exact: true })
      .uncheck();
    const [response] = await Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/browse-lots' &&
          new URL(response.url()).searchParams.get('conditions') ===
            'new,open_box',
      ),
      condition
        .getByRole('checkbox', { name: 'Untested', exact: true })
        .uncheck(),
    ]);
    const data = await response.json();
    assert.equal(
      await condition
        .getByRole('checkbox', { name: 'New', exact: true })
        .evaluate((el) => getComputedStyle(el.closest('label')).color),
      'rgb(18, 122, 85)',
    );
    assert.ok(
      data.items.every((item) => ['new', 'open_box'].includes(item.condition)),
    );
    await expect(
      condition.getByRole('checkbox', { name: 'New', exact: true }),
    ).toBeChecked();
    await expect(
      condition.getByRole('checkbox', { name: 'Open box', exact: true }),
    ).toBeChecked();
    await page.screenshot({ path: `${dir}/condition-menu-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(condition).not.toHaveAttribute('open', '');
    await page.reload();
    await condition.locator('summary').click();
    await expect(
      condition.getByRole('checkbox', { name: 'New', exact: true }),
    ).toBeChecked();
    await expect(
      condition.getByRole('checkbox', { name: 'Open box', exact: true }),
    ).toBeChecked();
    await page.keyboard.press('Escape');
    const price = page.locator('.agn-checkbox-filter:visible').filter({
      has: page.locator('summary').filter({ hasText: /^Current bid/ }),
    });
    await price.locator('summary').click();
    await price.getByRole('checkbox', { name: /Under.*30,000/ }).check();
    const [priceResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/browse-lots' &&
          new URL(response.url()).searchParams.get('prices') ===
            'under-100000,under-30000',
      ),
      price.getByRole('checkbox', { name: /Under.*100,000/ }).check(),
    ]);
    assert.equal(priceResponse.status(), 200);
    await page.keyboard.press('Escape');
    const end = page.locator('.agn-checkbox-filter:visible').filter({
      has: page.locator('summary').filter({ hasText: /^Auction ends/ }),
    });
    await end.locator('summary').click();
    await end.getByRole('checkbox', { name: /Ends tomorrow/ }).check();
    const endResponse = await page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/browse-lots' &&
        new URL(response.url()).searchParams.get('ends') === 'tomorrow',
    );
    assert.equal(endResponse.status(), 200);
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: 'Clear filters', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Clear filters', exact: true }),
    ).toHaveCount(0);
    await condition.locator('summary').click();
    await expect(
      condition.getByRole('checkbox', { checked: true }),
    ).toHaveCount(5);
    for (const name of ['New', 'Like new', 'Open box', 'Damaged', 'Untested'])
      await condition.getByRole('checkbox', { name, exact: true }).uncheck();
    await page
      .getByRole('heading', { name: 'No matching auctions', exact: true })
      .waitFor();
    await page.keyboard.press('Escape');
    await page.reload();
    await condition.locator('summary').click();
    await expect(
      condition.getByRole('checkbox', { checked: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: 'Clear filters', exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    review.push({
      width,
      multiCondition: true,
      autoFilter: true,
      urlRestoration: true,
      multiGroup: true,
      escape: true,
      noPickupOrApply: true,
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
