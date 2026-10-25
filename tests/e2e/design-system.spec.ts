import { test, expect } from '@playwright/test';

for (const width of [360, 768, 1280]) {
  test(`design system at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://localhost:3310/design');
    await page.evaluate(() => document.fonts.ready);
    await expect(
      page.getByRole('heading', { name: 'The Auction NG toolkit' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'The lot card', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const sizes = await page
      .locator('button, input, select')
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.getBoundingClientRect().width > 0)
          .map((element) => ({
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
            label: element.textContent,
          })),
      );
    for (const size of sizes) {
      expect(size.height, size.label ?? 'input').toBeGreaterThanOrEqual(44);
      expect(size.width, size.label ?? 'input').toBeGreaterThanOrEqual(44);
    }
    const offline = page
      .locator('article')
      .filter({ hasText: 'Russell Hobbs kettle' });
    await expect(offline.getByText('Updating price…')).toBeVisible();
    await expect(offline.getByText('₦3,500', { exact: true })).toHaveCount(0);
    await expect(
      offline.getByRole('button', { name: 'Reconnecting…' }),
    ).toBeDisabled();
    const image = testInfo.outputPath(`design-${width}.png`);
    await page.screenshot({ path: image, fullPage: true });
    await testInfo.attach(`design-${width}`, {
      path: image,
      contentType: 'image/png',
    });
    await page.screenshot({
      path: testInfo.outputPath(`overview-${width}.png`),
    });
    await page
      .locator('section')
      .filter({
        has: page.getByRole('heading', { name: 'The lot card', exact: true }),
      })
      .screenshot({ path: testInfo.outputPath(`lots-${width}.png`) });
    const trigger = page.getByRole('button', {
      name: 'Open bottom sheet preview',
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const sheet = testInfo.outputPath(`sheet-${width}.png`);
    await page.screenshot({ path: sheet });
    await testInfo.attach(`sheet-${width}`, {
      path: sheet,
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
}

test('form hints, errors, amount precision and OTP autofill stay accessible', async ({
  page,
}) => {
  await page.goto('http://localhost:3310/design');
  await expect(page.getByLabel('Email address')).toHaveAttribute(
    'autocomplete',
    'email',
  );
  await expect(page.getByLabel('Phone number')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  const otp = page.getByLabel('Six-digit sign-in code');
  await expect(otp).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(otp).toHaveAttribute('inputmode', 'numeric');
  await otp.fill('123456');
  await expect(otp).toHaveValue('123456');
  const amount = page.getByLabel('Bid amount (₦)');
  await amount.fill('12.345');
  await expect(
    page.getByText('Enter an amount with up to two decimal places.'),
  ).toBeVisible();
  await amount.fill('12500.50');
  await expect(
    page.getByText(
      'Amount entered. The full cost is shown before confirmation.',
    ),
  ).toBeVisible();
});

test('tabs support keyboard selection and dialog traps focus then restores it', async ({
  page,
}) => {
  await page.goto('http://localhost:3310/design');
  const tab = page.getByRole('tab', { name: 'Winning', exact: true });
  await tab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: 'Outbid', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText(
    'Someone has placed a higher bid',
  );
  await page.keyboard.press('End');
  await expect(
    page.getByRole('tab', { name: 'Won', exact: true }),
  ).toBeFocused();
  const trigger = page.getByRole('button', {
    name: 'Open dialog preview',
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('button', { name: 'Close pickup preview', exact: true })
    .focus();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Close dialog', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('watch toggles and price updates respect reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://localhost:3310/design');
  const watch = page.getByRole('button', {
    name: 'Watch Hisense 20-litre microwave',
    exact: true,
  });
  await watch.click();
  await expect(
    page.getByRole('button', {
      name: 'Unwatch Hisense 20-litre microwave',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: 'Preview a price update', exact: true })
    .click();
  const price = page.locator('.agn-price').filter({ hasText: '₦12,750' });
  await expect(price).toBeVisible();
  await expect(price).toHaveCSS('animation-name', 'none');
});
