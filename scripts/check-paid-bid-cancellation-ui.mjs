import { chromium, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global document,innerWidth,localStorage */
const dir = 'docs/design/paid-bid-cancellation';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch(),
  results = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    context.setDefaultTimeout(15000);
    const user = {
      id: randomUUID(),
      name: 'Tunde Ade',
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
    const conversation = {
      id: randomUUID(),
      number: 'SUP-A7X9K3M2',
      subject: 'Bid cancellation request · LOT-M4A7P2X9',
      topic: 'bidding',
      reference: 'LOT-M4A7P2X9',
      status: 'open',
      mode: 'human',
      version: 1,
      buyerName: 'Amina Yusuf',
      assigneeName: null,
      assignedToMe: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const quote = {
      conversationId: conversation.id,
      lotId: randomUUID(),
      lotNumber: conversation.reference,
      buyerName: 'Amina Yusuf',
      priceKobo: 600000,
      premiumBps: 1500,
      feeKobo: 90000,
      streamId: '7-0',
      isLeader: true,
      status: 'available',
      endsAt: new Date(Date.now() + 3600000).toISOString(),
    };
    let consent = false,
      fail = true,
      prior,
      approvals = 0;
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
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
      if (path === '/support/availability')
        return json({ available: true, attachmentsEnabled: false });
      if (path === '/support/conversations')
        return json({ items: [conversation], nextCursor: null });
      if (path === '/support/conversations/' + conversation.id)
        return json(conversation);
      if (path === '/support/conversations/' + conversation.id + '/messages')
        return json({
          items: [
            {
              id: randomUUID(),
              author: 'buyer',
              authorName: 'Amina Yusuf',
              text: 'I selected the wrong item. I accept the disclosed fee if staff complete cancellation.',
              internal: false,
              createdAt: new Date().toISOString(),
              attachments: [],
            },
          ],
          nextCursor: null,
        });
      if (path === '/admin/bid-cancellations/' + conversation.id)
        return consent ? json(quote) : json({}, 409);
      if (path === '/admin/bid-cancellations/' + conversation.id + '/approve') {
        const body = route.request().postDataJSON();
        approvals++;
        assert.equal(body.expectedFeeKobo, 90000);
        assert.equal(body.expectedStreamId, '7-0');
        if (prior) assert.deepEqual(body, prior);
        prior = body;
        if (fail) {
          fail = false;
          return json({}, 503);
        }
        quote.status = 'completed';
        return json({
          id: randomUUID(),
          status: 'completed',
          feeKobo: 90000,
          reopened: true,
        });
      }
      if (path === '/admin/wallet-controls')
        return json({
          depositsEnabled: true,
          withdrawalsEnabled: true,
          revision: 0,
          updatedAt: new Date().toISOString(),
        });
      if (path === '/admin/auction-fees')
        return json({
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
        });
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3301/');
    const desk = page.getByRole('region', {
      name: 'Staff support desk',
      exact: true,
    });
    await desk
      .getByRole('button', { name: /Bid cancellation request/ })
      .click();
    const panel = page.getByRole('region', {
      name: 'Staff bid cancellation approval',
      exact: true,
    });
    await expect(
      panel.getByText('Approval unavailable.', { exact: false }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Review and approve cancellation' }),
    ).toHaveCount(0);
    consent = true;
    await panel
      .getByRole('button', { name: 'Refresh cancellation quote' })
      .click();
    await expect(
      panel.getByText('Cancellation fee (15%)', { exact: true }),
    ).toBeVisible();
    await panel
      .getByLabel('Approval reason')
      .fill('Approved after checking the buyer request and item details.');
    await panel.screenshot({ path: `${dir}/admin-quote-${width}.png` });
    await panel
      .getByRole('button', { name: 'Review and approve cancellation' })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Approve paid bid cancellation',
      exact: true,
    });
    await expect(dialog.getByText(/Charge ₦900/)).toBeVisible();
    await dialog.screenshot({ path: `${dir}/admin-confirmation-${width}.png` });
    await dialog
      .getByRole('button', { name: 'Charge fee and complete cancellation' })
      .click();
    await expect(
      dialog.getByText('The approval result could not be confirmed.', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(panel.getByLabel('Approval reason')).toBeDisabled();
    await dialog.getByRole('button', { name: 'Retry same approval' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      panel.getByText('Cancellation completed', { exact: true }),
    ).toBeVisible();
    assert.equal(approvals, 2);
    await panel.screenshot({ path: `${dir}/admin-completed-${width}.png` });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      'Admin overflow',
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      passed: true,
      checks: [
        'legacy consent blocks approval',
        'fee percentage and amount',
        'explicit confirmation',
        'exact lost-response retry',
        'pending reason locked',
        'completed status',
        'no overflow or page errors',
      ],
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(
  `${dir}/admin-checks.json`,
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify(results));
