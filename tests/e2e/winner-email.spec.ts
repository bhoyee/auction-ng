import { test, expect } from '@playwright/test';
import { winnerEmail } from '../../apps/api/src/closing/winner-email';
for (const width of [360, 768, 1280]) {
  test(`winner receipt at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1100 });
    const mail = winnerEmail({
      invoiceNumber: 'INV-R8V3N6TZ',
      title: 'Hisense 20-litre microwave',
      lotNumber: 'LOT-K7M4X9Q2',
      hammerKobo: 500000,
      premiumKobo: 75000,
      lotFeeKobo: 30000,
      vatKobo: 7875,
      totalKobo: 612875,
      location: 'Ikeja pickup hub',
      address: '12 Test Road, Ikeja, Lagos',
      status: 'paid',
      deadline: null,
    });
    await page.setContent(mail.HTML);
    await expect(
      page.getByRole('heading', { name: 'You won this lot' }),
    ).toBeVisible();
    await expect(page.getByText('Paid from your wallet')).toBeVisible();
    await expect(
      page.getByText('Lot LOT-K7M4X9Q2', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Invoice INV-R8V3N6TZ/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const path = testInfo.outputPath(`winner-email-${width}.png`);
    await page.screenshot({ fullPage: true, path });
    await testInfo.attach(`winner-email-${width}`, {
      path,
      contentType: 'image/png',
    });
  });
}
