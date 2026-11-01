import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
/* global document,innerWidth */
const dir = 'docs/design/auction-fees';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch(),
  results = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const user = {
      id: randomUUID(),
      name: 'Synthetic administrator',
      email: 'admin@example.test',
      role: 'admin',
      status: 'active',
      emailVerified: true,
      phone: null,
      phoneVerified: false,
      address: null,
      passwordSet: true,
    };
    const token = randomBytes(32).toString('base64url');
    let settings = {
        policy: {
          version: 'auction-fees-v1',
          serviceChargeEnabled: true,
          premiumBps: 1500,
          lotFeeEnabled: true,
          lotFeeKobo: 30000,
          vatEnabled: true,
          vatBps: 750,
        },
        revision: 0,
        applied: true,
      },
      uncertain = true,
      prior;
    await context.route('http://localhost:4000/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      if (path === '/auth/staff/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (path === '/admin/auction-fees') {
        if (route.request().method() === 'POST') {
          const input = route.request().postDataJSON();
          if (uncertain) {
            uncertain = false;
            prior = input;
            return json({}, 503);
          }
          assert.deepEqual(input, prior);
          assert.equal(input.premiumBps, 1250);
          assert.equal(input.lotFeeEnabled, false);
          assert.equal(input.vatBps, 750);
          settings = {
            policy: {
              version: 'af-' + randomUUID(),
              serviceChargeEnabled: input.serviceChargeEnabled,
              premiumBps: input.premiumBps,
              lotFeeEnabled: input.lotFeeEnabled,
              lotFeeKobo: input.lotFeeKobo,
              vatEnabled: input.vatEnabled,
              vatBps: input.vatBps,
            },
            revision: 1,
            applied: true,
          };
        }
        return json(settings);
      }
      if (path === '/admin/wallet-controls')
        return json({
          depositsEnabled: true,
          withdrawalsEnabled: true,
          revision: 0,
          updatedAt: new Date().toISOString(),
        });
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3301/');
    const panel = page.getByRole('region', {
      name: 'Auction fee settings',
      exact: true,
    });
    await expect(
      panel.getByRole('textbox', { name: 'Service charge (%)', exact: true }),
    ).toHaveValue('15');
    await panel
      .getByRole('textbox', { name: 'Service charge (%)', exact: true })
      .fill('12.5');
    await panel
      .getByRole('checkbox', { name: 'Enable lot fee', exact: true })
      .uncheck();
    await panel
      .getByRole('textbox', { name: 'Reason for change', exact: true })
      .fill('Adjust fees for unbid auctions');
    await panel
      .getByRole('button', { name: 'Save auction fees', exact: true })
      .click();
    await expect(
      panel.getByText(
        'The update could not be confirmed. Retry this same save before editing.',
      ),
    ).toBeVisible();
    await expect(
      panel.getByRole('textbox', { name: 'Service charge (%)', exact: true }),
    ).toBeDisabled();
    await panel
      .getByRole('button', { name: 'Retry fee update', exact: true })
      .click();
    await expect(
      panel.getByText(
        'Auction fees updated. Auctions with accepted bids retain their agreed fees.',
      ),
    ).toBeVisible();
    await expect(
      panel.getByRole('checkbox', { name: 'Enable lot fee', exact: true }),
    ).not.toBeChecked();
    await panel.screenshot({ path: `${dir}/admin-${width}.png` });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false);
    assert.deepEqual(errors, []);
    results.push({ width, overflow, errors });
    await context.close();
  }
  writeFileSync(dir + '/checks.json', JSON.stringify(results, null, 2) + '\n');
} finally {
  await browser.close();
}
