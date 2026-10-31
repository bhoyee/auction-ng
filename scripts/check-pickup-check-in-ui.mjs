import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage,window,Event */

const dir = 'docs/design/pickup-check-in';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const user = {
      id: randomUUID(),
      name: 'Amina Yusuf',
      email: 'buyer@example.test',
      role: 'buyer',
      status: 'active',
      emailVerified: true,
      phone: null,
      phoneVerified: false,
      address: null,
      passwordSet: true,
    };
    const token = randomBytes(32).toString('base64url');
    const orders = Array.from({ length: 11 }, (_, index) => ({
      id: randomUUID(),
      number: `ANG-${index === 0 ? 'X7Q9M2K4' : `Q8M2K4P${index}`}`,
      status: 'paid',
      saleType: index % 2 ? 'fixed_price' : 'auction',
      hammerTotalKobo: 1000000,
      premiumKobo: 150000,
      lotFeeKobo: 30000,
      vatKobo: 13500,
      totalKobo: 1193500,
      createdAt: '2026-10-31T12:00:00.000Z',
    }));
    let fail = false,
      empty = false;
    const requests = [];
    let arrival,
      failCheckIn = true;
    const keys = [];
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const url = new URL(route.request().url());
      const json = (value, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
        });
      if (url.pathname === '/auth/staff/refresh')
        return json({
          accessToken: token,
          expiresInSeconds: 900,
          user: {
            ...user,
            id: orders[2].id,
            role: 'warehouse',
            name: 'Warehouse staff',
          },
        });
      if (url.pathname === '/pickup/check-in') {
        const body = route.request().postDataJSON();
        assert.equal(body.invoiceId, orders[0].id);
        keys.push(body.idempotencyKey);
        if (failCheckIn) {
          failCheckIn = false;
          return json({}, 503);
        }
        arrival = {
          id: randomUUID(),
          invoiceId: orders[0].id,
          invoiceNumber: orders[0].number,
          buyerName: user.name,
          location: 'Lekki collection centre',
          status: 'waiting',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return json(arrival);
      }
      if (
        url.pathname === '/pickup/arrivals' ||
        url.pathname === '/pickup/staff/arrivals'
      )
        return json({
          items: arrival && arrival.status !== 'closed' ? [arrival] : [],
          nextCursor: null,
        });
      if (url.pathname.startsWith('/pickup/staff/arrivals/')) {
        const input = route.request().postDataJSON();
        assert.equal(input.expectedStatus, arrival.status);
        arrival = {
          ...arrival,
          status: input.status,
          updatedAt: new Date().toISOString(),
        };
        return json(arrival);
      }
      if (url.pathname === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user });
      if (url.pathname === '/buyers/collections') {
        assert.equal(url.searchParams.get('limit'), '10');
        const cursor = url.searchParams.get('cursor');
        requests.push(cursor);
        if (fail) return json({}, 503);
        return json({
          items: empty ? [] : cursor ? orders.slice(10) : orders.slice(0, 10),
          nextCursor: !empty && !cursor ? 'older-orders' : null,
        });
      }
      if (url.pathname === '/wallet')
        return json({
          id: user.id,
          userId: user.id,
          currency: 'NGN',
          availableKobo: 0,
          heldKobo: 0,
          totalKobo: 0,
        });
      if (url.pathname === '/buyers/watchlist/count') return json({ count: 0 });
      if (url.pathname === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 11 });
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage(),
      staff = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    staff.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3300/check-in');
    const choices = page.getByRole('region', {
      name: 'Choose a pickup order',
      exact: true,
    });
    await expect(
      choices.getByRole('button', { name: 'Check in', exact: true }),
    ).toHaveCount(10);
    await page.screenshot({
      path: dir + '/buyer-' + width + '.png',
      fullPage: true,
    });
    await choices
      .getByRole('button', { name: 'Check in', exact: true })
      .first()
      .click();
    const confirm = page.getByRole('dialog', {
      name: 'Confirm your arrival',
      exact: true,
    });
    await confirm
      .getByRole('button', {
        name: "I'm at the collection centre",
        exact: true,
      })
      .click();
    await expect(
      confirm.getByText(/Check-in could not be confirmed/),
    ).toBeVisible();
    await confirm
      .getByRole('button', {
        name: "I'm at the collection centre",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('region', { name: 'Your arrivals', exact: true }),
    ).toContainText('Waiting for staff');
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    await page.screenshot({
      path: dir + '/checked-in-' + width + '.png',
      fullPage: true,
    });
    await staff.goto('http://localhost:3301/');
    const queue = staff.getByRole('region', {
      name: 'Pickup arrivals',
      exact: true,
    });
    await expect(queue).toContainText(user.name);
    await staff.screenshot({
      path: dir + '/staff-' + width + '.png',
      fullPage: true,
    });
    await queue
      .getByRole('button', { name: 'Acknowledge arrival', exact: true })
      .click();
    await expect(queue).toContainText('Acknowledged by staff');
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page.getByRole('region', { name: 'Your arrivals', exact: true }),
    ).toContainText('Acknowledged by staff');
    await page.screenshot({
      path: dir + '/acknowledged-' + width + '.png',
      fullPage: true,
    });
    await staff.bringToFront();
    await queue
      .getByRole('button', { name: 'Close visit', exact: true })
      .click();
    const closing = staff.getByRole('dialog', {
      name: 'Close arrival visit?',
      exact: true,
    });
    await expect(closing).toContainText(
      'does not mark their order as collected',
    );
    await closing
      .getByRole('button', { name: 'Close visit', exact: true })
      .click();
    await expect(queue).toContainText('No buyers are waiting on this page');
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page.getByRole('region', { name: 'Your arrivals', exact: true }),
    ).toContainText('no active check-in');
    await choices.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(
      choices.getByRole('button', { name: 'Check in', exact: true }),
    ).toHaveCount(1);
    await choices
      .getByRole('button', { name: 'Previous', exact: true })
      .click();
    await expect(
      choices.getByRole('button', { name: 'Check in', exact: true }),
    ).toHaveCount(10);
    assert.deepEqual(errors, []);
    results.push({
      width,
      confirmation: true,
      errorSameKeyRetry: true,
      buyerArrival: true,
      staffQueue: true,
      staffAcknowledgement: true,
      silentStatusRefresh: true,
      closeVisitNotCollection: true,
      orderPagination: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(dir + '/review.json', JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
