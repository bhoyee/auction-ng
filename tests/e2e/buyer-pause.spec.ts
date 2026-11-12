import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { pauseFixture } from './buyer-pause-fixture';
// Playwright serves the buyer site on 3310 with its API at 4400 (see
// playwright.config.ts). The catalogue-backed pause checks live in
// buyer-journey.spec.ts, which runs that isolated API.
const origin = process.env.BUYER_BROWSER_URL ?? 'http://localhost:3310';
const api = process.env.BUYER_API_URL ?? 'http://localhost:4400';
for (const guest of [true, false]) {
  test(`global pause popup on any page for ${guest ? 'guests' : 'signed-in buyers'}`, async ({
    page,
  }) => {
    const controls = await pauseFixture(page, api, { guest, offline: true });
    await page.goto(origin + '/privacy-policy');
    await page
      .getByRole('button', { name: 'Use necessary cookies', exact: true })
      .click();
    controls.pause();
    const dialog = page.getByRole('dialog', {
      name: 'Bidding is temporarily paused',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    if (guest) {
      const close = dialog.getByRole('button', {
        name: 'Close dialog',
        exact: true,
      });
      const red = await close.evaluate((node) => getComputedStyle(node).color);
      await expect(close).toHaveCSS('cursor', 'pointer');
      await close.hover();
      await expect(close).toHaveCSS('background-color', red);
      await expect(close).toHaveCSS('color', 'rgb(255, 255, 255)');
    }
    await expect(dialog).toContainText('any reserved bid funds are preserved');
    await mkdir('docs/design/global-pause-notice', { recursive: true });
    if (guest)
      for (const width of [360, 768, 1280]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.screenshot({
          path: `docs/design/global-pause-notice/${width}.png`,
          animations: 'disabled',
        });
      }
    await dialog
      .getByRole('button', { name: 'Continue browsing', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Read update', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Policies and privacy', exact: true })
      .getByRole('link', { name: 'Terms of Use', exact: true })
      .click();
    await expect(page).toHaveURL(/terms-of-use/);
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Read update', exact: true }),
    ).toBeVisible();
    await expect(dialog).not.toBeVisible();
    controls.resume();
    await expect(
      page.getByText('Bidding has resumed', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Read update', exact: true }),
    ).toHaveCount(0);
    controls.pause();
    await expect(dialog).toBeVisible();
  });
}
