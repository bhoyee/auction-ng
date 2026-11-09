import { test, expect } from '@playwright/test';
import { signInEmail } from '../../apps/api/src/auth/email-provider';
import { inlineEmailLogo } from '../../apps/api/src/email/branding';
import { mkdir } from 'node:fs/promises';

for (const width of [360, 768, 1280]) {
  test(`sign-in email at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(inlineEmailLogo(signInEmail('012345').HTML));
    await expect(
      page.getByRole('img', { name: 'LotVanta', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Your sign-in code' }),
    ).toBeVisible();
    await expect(page.getByText('012345', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const path = testInfo.outputPath(`sign-in-email-${width}.png`);
    await page.screenshot({ fullPage: true, path });
    await mkdir('docs/design/email-branding', { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: `docs/design/email-branding/sign-in-${width}.png`,
    });
    await testInfo.attach(`sign-in-email-${width}`, {
      path,
      contentType: 'image/png',
    });
  });
}
