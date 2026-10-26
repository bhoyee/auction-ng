import { test, expect } from '@playwright/test';

for (const [app, port, heading] of [
  ['web', 3310, 'Today’s auctions'],
  ['admin', 3301, 'Staff workspace'],
] as const) {
  for (const width of [360, 768, 1280]) {
    test(`${app} placeholder at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`http://localhost:${port}`);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator('body')).toHaveCSS(
        'background-color',
        'rgb(245, 246, 248)',
      );
      expect(
        (
          await page
            .locator('body')
            .evaluate((element) => getComputedStyle(element).fontFamily)
        ).toLowerCase(),
      ).toContain('schibsted');
      const screenshot = testInfo.outputPath(`${app}-${width}.png`);
      await page.screenshot({ fullPage: true, path: screenshot });
      await testInfo.attach(`${app}-${width}`, {
        path: screenshot,
        contentType: 'image/png',
      });
    });
  }
}
