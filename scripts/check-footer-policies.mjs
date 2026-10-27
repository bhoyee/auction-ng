import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const dir = 'docs/design/footer-policies';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const review = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3300/');
    const notice = page.getByRole('region', { name: 'Cookie notice' });
    await notice.waitFor();
    await notice.screenshot({ path: `${dir}/cookie-notice-${width}.png` });
    await notice
      .getByRole('button', { name: 'Cookie details', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Cookie settings' });
    await dialog.waitFor();
    await dialog.screenshot({ path: `${dir}/cookie-settings-${width}.png` });
    await dialog
      .getByRole('button', { name: 'Use necessary cookies', exact: true })
      .click();
    assert.equal(await notice.count(), 0);
    const saved = await page.evaluate(() =>
      localStorage.getItem('auction-ng-cookie-notice'),
    );
    assert.ok(saved);
    await page.reload();
    await page.locator('[data-buyer-ready="true"]').waitFor();
    await page.waitForTimeout(150);
    assert.equal(await notice.count(), 0);
    const footer = page.locator('footer:visible').first();
    await footer.scrollIntoViewIfNeeded();
    await page.addStyleTag({
      content: '.agn-header-stack--compact{visibility:hidden !important;}',
    });
    await footer.screenshot({ path: `${dir}/footer-${width}.png` });
    assert.equal(
      await footer.getByRole('button', { name: 'Cookie settings' }).count(),
      0,
    );
    await footer.getByRole('heading', { name: 'Legal', exact: true }).waitFor();
    await footer.getByRole('heading', { name: 'Help', exact: true }).waitFor();
    await footer
      .getByRole('link', { name: 'Condition grades', exact: true })
      .click();
    await page.locator('#condition-grades').waitFor();
    const paths = [
      ['/terms-of-use', 'Terms of Use'],
      ['/privacy-policy', 'Privacy Policy'],
      ['/cookie-policy', 'Cookie Policy'],
    ];
    for (const [path, title] of paths) {
      await page.goto('http://localhost:3300' + path);
      await page
        .getByRole('heading', { level: 1, name: title, exact: true })
        .waitFor();
      assert.ok(
        await page
          .locator('main')
          .getByRole('link', { name: 'info@auctionng.com', exact: true })
          .count(),
      );
      assert.equal(
        await page.getByRole('region', { name: 'Cookie notice' }).count(),
        0,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({ path: `${dir}/${path.slice(1)}-${width}.png` });
    }
    await page
      .locator('main')
      .getByRole('button', { name: 'Cookie settings', exact: true })
      .click();
    await page.getByRole('dialog', { name: 'Cookie settings' }).waitFor();
    assert.deepEqual(errors, []);
    review.push({
      width,
      noticeInitiallyVisible: true,
      persistsAfterReload: true,
      reopensFromPolicy: true,
      policyPages: 3,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      errors,
    });
    await context.close();
  }
  console.log(JSON.stringify(review, null, 2));
  fs.writeFileSync(
    `${dir}/review.json`,
    JSON.stringify(review, null, 2) + '\n',
  );
} finally {
  await browser.close();
}
/* global localStorage, document, innerWidth */
