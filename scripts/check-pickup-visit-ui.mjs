import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
/* global localStorage,window,Event,document,navigator */
const dir = 'docs/design/pickup-visit';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch(),
  results = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const buyer = {
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
    const token = randomBytes(32).toString('base64url'),
      location = {
        id: randomUUID(),
        name: 'Lekki collection centre',
        address: '14 Admiralty Road, Lekki, Lagos',
      },
      passId = randomUUID();
    let visit = null,
      passToken = 'ANGP1_' + randomBytes(32).toString('base64url'),
      expiresAt = new Date(Date.now() + 600000).toISOString(),
      noOrders = false,
      failScan = true,
      loseConfirmation = true;
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: randomUUID(),
      lotId: randomUUID(),
      itemNumber: `A7Q9M2${String(i).padStart(2, '0')}`,
      title:
        i === 0
          ? 'Wireless noise-cancelling headphones'
          : `Demo pickup item ${i + 1}`,
      invoiceNumber: i < 6 ? 'ANG-Q8M2P4K7' : 'ANG-X9R4K2M8',
    }));
    const remaining = new Map(rows.map((row) => [row.id, row])),
      receipts = new Map(),
      attempts = [];
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname,
        json = (value, status = 200) =>
          route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(value),
          });
      if (path === '/auth/refresh')
        return json({ accessToken: token, expiresInSeconds: 900, user: buyer });
      if (path === '/auth/staff/refresh')
        return json({
          accessToken: token,
          expiresInSeconds: 900,
          user: {
            ...buyer,
            id: location.id,
            name: 'Warehouse staff',
            role: 'warehouse',
          },
        });
      if (path === '/wallet')
        return json({
          id: buyer.id,
          userId: buyer.id,
          currency: 'NGN',
          availableKobo: 0,
          heldKobo: 0,
          totalKobo: 0,
        });
      if (path === '/buyers/watchlist/count') return json({ count: 0 });
      if (path === '/buyers/notifications/summary')
        return json({ unread: 0, awaitingPickup: 2 });
      if (path === '/pickup/centres')
        return json({
          items: noOrders ? [] : [{ ...location, orderCount: 2 }],
          nextCursor: null,
        });
      if (path === '/pickup/visit-pass') {
        const input = route.request().postDataJSON();
        assert.equal(input.locationId, location.id);
        if (input.renew) {
          visit = null;
          passToken = 'ANGP1_' + randomBytes(32).toString('base64url');
          expiresAt = new Date(Date.now() + 600000).toISOString();
        }
        return json({
          id: passId,
          token: passToken,
          code: 'ABCD2345',
          expiresAt,
          serverTime: new Date().toISOString(),
          location,
          visit,
        });
      }
      if (path === '/pickup/visit-pass/' + passId)
        return json({
          id: passId,
          token: passToken,
          code: 'ABCD2345',
          expiresAt,
          serverTime: new Date().toISOString(),
          location,
          visit,
        });
      if (path === '/pickup/visits/scan') {
        const code = route.request().postDataJSON().code;
        assert.ok(['ABCD2345', passToken].includes(code));
        if (failScan) {
          failScan = false;
          return json({}, 503);
        }
        visit ??= {
          id: randomUUID(),
          buyerName: buyer.name,
          locationId: location.id,
          location: location.name,
          status: 'waiting',
          createdAt: new Date().toISOString(),
          finishedAt: null,
        };
        return json(visit);
      }
      if (path === '/pickup/visits')
        return json({
          items: visit?.status === 'waiting' ? [visit] : [],
          nextCursor: null,
        });
      if (path.endsWith('/items') && path.startsWith('/pickup/visits/')) {
        const number = url.searchParams.get('itemNumber'),
          cursor = url.searchParams.get('cursor');
        const all = Array.from(remaining.values()).filter(
            (row) => !number || row.itemNumber === number,
          ),
          start = cursor ? 10 : 0,
          limit = Number(url.searchParams.get('limit') ?? 10);
        return json({
          visit,
          items: all.slice(start, start + limit),
          nextCursor: !cursor && all.length > limit ? rows[9].id : null,
        });
      }
      if (path.endsWith('/collect')) {
        const input = route.request().postDataJSON();
        attempts.push(input);
        let receipt = receipts.get(input.idempotencyKey);
        if (!receipt) {
          assert.deepEqual(input.lineIds, [rows[0].id]);
          receipt = {
            id: input.idempotencyKey,
            visitId: visit.id,
            lineIds: input.lineIds,
            finishVisit: input.finishVisit,
            createdAt: new Date().toISOString(),
          };
          receipts.set(receipt.id, receipt);
          input.lineIds.forEach((id) => remaining.delete(id));
          if (input.finishVisit)
            visit = {
              ...visit,
              status: 'completed',
              finishedAt: new Date().toISOString(),
            };
        }
        if (loseConfirmation) {
          loseConfirmation = false;
          return json({}, 503);
        }
        return json(receipt);
      }
      return json({ items: [], nextCursor: null });
    });
    const page = await context.newPage(),
      staff = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    staff.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3300/check-in');
    await expect(
      page.getByRole('img', { name: 'Private check-in QR code', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('ABCD 2345', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Your arrivals', exact: true }),
    ).toHaveCount(0);
    assert.equal(visit, null);
    await page.screenshot({
      path: `${dir}/buyer-pass-${width}.png`,
      fullPage: true,
    });
    await staff.goto('http://localhost:3301/');
    const scan = staff.getByRole('region', {
      name: 'Check in a buyer',
      exact: true,
    });
    await scan
      .getByRole('textbox', { name: 'Scan pass or enter code', exact: true })
      .fill('ABCD2345');
    await scan
      .getByRole('button', { name: 'Register arrival', exact: true })
      .click();
    await expect(
      staff.getByText(/Pass could not be accepted/).filter({ visible: true }),
    ).toBeVisible();
    await scan
      .getByRole('button', { name: 'Register arrival', exact: true })
      .click();
    const checklist = staff.getByRole('region', {
      name: 'Collection checklist',
      exact: true,
    });
    await expect(
      checklist.getByRole('checkbox', { name: /^Collect / }),
    ).toHaveCount(10);
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page.getByRole('heading', { name: "You're checked in", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Private check-in QR code', exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `${dir}/buyer-checked-in-${width}.png`,
      fullPage: true,
    });
    await staff.bringToFront();
    await staff.screenshot({
      path: `${dir}/staff-queue-${width}.png`,
      fullPage: true,
    });
    await checklist.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(
      checklist.getByRole('checkbox', { name: /^Collect / }),
    ).toHaveCount(1);
    await checklist
      .getByRole('button', { name: 'Previous', exact: true })
      .click();
    await expect(
      checklist.getByRole('checkbox', { name: /^Collect / }),
    ).toHaveCount(10);
    await checklist
      .getByRole('textbox', { name: 'Scan or enter item ID', exact: true })
      .fill(rows[0].itemNumber);
    await checklist
      .getByRole('button', { name: 'Add item to collection', exact: true })
      .click();
    await expect(
      checklist.getByRole('checkbox', {
        name: 'Collect ' + rows[0].itemNumber,
        exact: true,
      }),
    ).toBeChecked();
    await checklist
      .getByRole('button', { name: 'Confirm collection (1)', exact: true })
      .click();
    const dialog = staff.getByRole('dialog', {
      name: 'Confirm item handover',
      exact: true,
    });
    await expect(dialog).toContainText(rows[0].title);
    await dialog
      .getByRole('button', { name: 'Confirm handover', exact: true })
      .click();
    await expect(
      dialog.getByText(/Collection could not be confirmed/),
    ).toBeVisible();
    await staff.screenshot({ path: `${dir}/confirmation-retry-${width}.png` });
    await dialog
      .getByRole('button', { name: 'Retry same confirmation', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(staff.getByText(/1 item confirmed collected/)).toBeVisible();
    assert.equal(receipts.size, 1);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
    assert.equal(remaining.size, 10);
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page.getByRole('heading', { name: 'Collection confirmed', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `${dir}/buyer-completed-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Prepare another visit pass', exact: true })
      .click();
    await expect(
      page.getByRole('img', { name: 'Private check-in QR code', exact: true }),
    ).toBeVisible();
    expiresAt = new Date(Date.now() - 1000).toISOString();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText('Pass expired', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: 'Refresh pass', exact: true })
      .click();
    await expect(
      page.getByRole('img', { name: 'Private check-in QR code', exact: true }),
    ).toBeVisible();
    noOrders = true;
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: 'Nothing awaiting pickup',
        exact: true,
      }),
    ).toBeVisible();
    if (width === 1280) {
      await context.addInitScript(() => {
        Object.defineProperty(window, 'BarcodeDetector', {
          configurable: true,
          value: class {
            async detect() {
              return [];
            }
          },
        });
        const media = document.createElement('canvas').captureStream(1);
        window.cameraStops = 0;
        for (const track of media.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            window.cameraStops++;
            stop();
          };
        }
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
          configurable: true,
          value: () =>
            new Promise((resolve) => {
              window.releaseTestCamera = () => resolve(media);
            }),
        });
      });
      await staff.bringToFront();
      await staff.reload();
      await staff
        .getByRole('button', { name: 'Scan with camera', exact: true })
        .click();
      const camera = staff.getByRole('dialog', {
        name: 'Scan buyer check-in pass',
        exact: true,
      });
      await camera
        .getByRole('button', { name: 'Close dialog', exact: true })
        .click();
      await staff.evaluate(() => window.releaseTestCamera());
      await expect.poll(() => staff.evaluate(() => window.cameraStops)).toBe(1);
      await expect(camera).not.toBeVisible();
    }
    assert.deepEqual(errors, []);
    results.push({
      width,
      singlePrivatePass: true,
      noArrivalBeforeStaffScan: true,
      staffScanRetry: true,
      itemPagination: true,
      itemScanSelection: true,
      sameReceiptRetryAfterLostResponse: true,
      partialCollection: true,
      visitCompletedAutomatically: true,
      expiryRefresh: true,
      emptyState: true,
      lateCameraPermissionStopsStream: width === 1280 ? true : undefined,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
