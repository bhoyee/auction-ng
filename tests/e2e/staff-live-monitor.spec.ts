import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { STAFF_PERMISSIONS } from '../../packages/shared/src/staff-permissions';
const origin = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const id = (n: number) =>
  '10000000-0000-4000-8000-' + n.toString().padStart(12, '0');
async function fixture(
  page: Page,
  options: {
    failure?: boolean;
    empty?: boolean;
    legacy?: boolean;
    thresholds?: boolean;
  } = {},
) {
  let clock = Date.now();
  const initialClock = clock;
  let price = 8600000;
  let firstClosed = false;
  let paused = false;
  let controlRevision = 'live:initial';
  let issueCount = 0;
  await page.routeWebSocket(/socket\.io/, (socket) => {
    socket.send(
      '0' +
        JSON.stringify({
          sid: 'live-review',
          upgrades: [],
          pingInterval: 25000,
          pingTimeout: 20000,
          maxPayload: 1000000,
        }),
    );
    socket.onMessage((message) => {
      const text = String(message);
      if (text.startsWith('40'))
        socket.send('40' + JSON.stringify({ sid: 'live-review' }));
      const ack = /^42(\d+)\["admin:live:subscribe"/.exec(text);
      if (ack)
        socket.send(
          '43' +
            ack[1] +
            JSON.stringify([
              { ok: true, serverTime: new Date(clock).toISOString() },
            ]),
        );
    });
    const timer = setInterval(() => {
      clock += 3000;
      socket.send(
        '42' +
          JSON.stringify([
            'serverTime',
            { serverTime: new Date(clock).toISOString() },
          ]),
      );
    }, 3000);
    socket.onClose(() => clearInterval(timer));
  });
  await page.route('http://localhost:4000/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      stamp = new Date(clock).toISOString();
    let body: unknown = { items: [], nextCursor: null };
    if (path === '/auth/staff/refresh')
      body = {
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id: id(999),
          name: 'Ada Okafor',
          role: 'admin',
          status: 'active',
          email: 'staff@example.test',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: false,
        },
      };
    else if (path === '/staff/me')
      body = {
        name: 'Ada Okafor',
        roleName: 'Admin',
        permissions: STAFF_PERMISSIONS,
      };
    else if (path === '/staff/preferences')
      body = { compactTables: false, reduceMotion: false };
    else if (path === '/staff/activity')
      body = { id: id(999), message: 'Recorded' };
    else if (path === '/staff/live-monitor/history')
      body = { id: id(1), message: 'History inspection recorded' };
    else if (path === '/staff/live-monitor/message')
      body = { id: id(1), message: 'Message queued for this item’s bidders.' };
    else if (path === '/staff/live-monitor/control') {
      const input = route.request().postDataJSON() as {
        operation: string;
        expectedRevision: string;
        idempotencyKey: string;
      };
      if (input.expectedRevision !== controlRevision) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: '{}',
        });
        return;
      }
      paused = input.operation === 'pause_all';
      controlRevision = `${paused ? 'paused' : 'live'}:${input.idempotencyKey}`;
      body = { id: id(1), message: 'Bidding control recorded.' };
    } else if (path === '/staff/notifications')
      body = {
        items: [],
        nextCursor: null,
        unreadCount: 0,
        serverTime: stamp,
        emailMode: 'preview',
      };
    else if (path.startsWith('/staff/live-monitor/')) {
      const part = path.split('/').at(-1);
      if (options.failure && part === 'issues') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{}',
        });
        return;
      }
      if (part === 'summary')
        body = {
          serverTime: stamp,
          revision: clock,
          observedSince: stamp,
          paused,
          phase: paused ? 'paused' : 'live',
          controlRevision,
          liveCount: options.empty ? 0 : 3000,
          closing15Count: 74,
          closing30Count: 148,
          endingHourCount: 148,
          endedTodayCount: 412,
          soldTodayCount: 369,
          gmvTodayKobo: 186000000,
          bidsPerMinute: 386,
          bidsPeak: 412,
          bidsPeakAt: stamp,
          onlineBuyers: null,
          onlineBidBuyers: null,
          extensionCount: 58,
          extendedLotCount: 42,
        };
      if (part === 'series')
        body = {
          serverTime: stamp,
          points: Array.from({ length: 60 }, (_, i) => ({
            at: new Date(clock - (59 - i) * 60000).toISOString(),
            value: 80 + i * 5 + Math.round(Math.sin(i / 8) * 30),
          })),
        };
      if (part === 'issues')
        body = {
          serverTime: stamp,
          observedSince: stamp,
          items: [
            {
              kind: 'wallet',
              label: 'Bids rejected for low wallet balance',
              context:
                'Confirmed bid-preparation rejections today (WAT), once per request.',
              count: issueCount,
              tone: 'warning',
            },
            {
              kind: 'release',
              label: 'Bid holds with release errors',
              context:
                'Distinct bid holds with a failed ledger release today (WAT). Includes recovered errors.',
              count: issueCount,
              tone: 'info',
            },
            {
              kind: 'connections',
              label: 'Connections dropped and recovered',
              context: 'Measured gateway telemetry pending.',
              count: null,
              tone: 'info',
            },
            {
              kind: 'late',
              label: 'Lots closed late > 2 s',
              context: 'Confirmed settlement records.',
              count: 0,
              tone: 'success',
            },
          ],
        };
      if (part === 'filters')
        body = {
          locations: [{ id: id(800), name: 'Lekki' }],
          categories: [{ id: id(801), name: 'Phones' }],
        };
      if (part === 'lots') {
        const offset = Number(url.searchParams.get('cursor') ?? 0),
          limit = Number(url.searchParams.get('limit') ?? 50);
        const titles = [
          'Tecno Camon 30, 256GB',
          'Samsung Galaxy A55',
          'Hisense 43-inch smart TV',
          'Leather trainers, size 43',
          'HP 15 laptop, Core i5',
          '27-inch IPS monitor',
          'Cordless drill, 2 batteries',
          'Wireless earbuds with case',
        ];
        body = {
          serverTime: stamp,
          revision: clock,
          items: options.empty
            ? []
            : Array.from({ length: limit }, (_, i) => ({
                id: id(offset + i + 1),
                reference:
                  'LV8Q' + (offset + i + 1).toString().padStart(4, '0'),
                title: titles[i % titles.length],
                thumbnail: null,
                categoryId: id(801),
                category: 'Phones',
                locationId: id(800),
                location: 'Lekki',
                runTimeMs:
                  options.legacy && i === 0
                    ? null
                    : (12 + (i % 6) * 12) * 3600000,
                endsAt: new Date(
                  options.thresholds
                    ? initialClock +
                        [903000, 303000, 1803000, 1200000][(offset + i) % 4]
                    : clock + 38000 + (offset + i) * 26000,
                ).toISOString(),
                currentPriceKobo: price + (offset + i) * 50000,
                bidCount: 31 + i,
                watchers: 12 + i,
                extensions: i % 4,
                leading: 'Ad***e',
                area: null,
                paused,
                remainingMs: paused ? 38000 + (offset + i) * 26000 : null,
                revision: '1-0',
                streamId: '1-0',
                serverTime: stamp,
              })),
          nextCursor: options.empty ? null : String(offset + limit),
        };
      }
      if (part === 'closed')
        body = {
          serverTime: stamp,
          totalToday: 412,
          items: options.empty
            ? []
            : Array.from({ length: 12 }, (_, i) => ({
                id: id(500 + i),
                reference: 'LVC' + i,
                title: [
                  'Infinix Hot 40i, 128GB',
                  'Silicone utensil set',
                  'Car vacuum cleaner',
                  'Baby bottles, set of 6',
                ][i % 4],
                winner: i === 2 ? null : 'Ok***o',
                bidCount: i === 2 ? 0 : 24,
                status: i === 2 ? 'unsold' : 'sold',
                hammerKobo: i === 2 ? null : 4100000 + i * 50000,
                closedAt: stamp,
              })),
          nextCursor: null,
        };
    }
    if (path === '/staff/live-monitor/lots' && firstClosed) {
      const rows = body as { items: { id: string }[] };
      rows.items = rows.items.filter((row) => row.id !== id(1));
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(origin + '/?section=live-monitor');
  await expect(
    page.getByRole('heading', { name: 'Live monitor', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Running 24/7', { exact: true })).toBeVisible();
  return {
    updatePrice: () => {
      price = 9200000;
    },
    closeFirst: () => {
      firstClosed = true;
    },
    reportIssue: () => {
      issueCount = 3;
    },
  };
}

test('changes countdown badge colours at 30, 15 and 5 minutes without refreshing', async ({
  page,
}) => {
  await fixture(page, { thresholds: true });
  const timers = page.locator('.lv-monitor-table .lv-monitor-timer');
  await expect(
    page.getByText('Live · 148 lots closing in 30 min', { exact: true }),
  ).toBeVisible();
  await expect(timers.nth(0)).toHaveClass(/is-closing/);
  await expect(timers.nth(1)).toHaveClass(/is-warning/);
  await expect(timers.nth(2)).toHaveClass(/is-normal/);
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await expect(timers.nth(0)).toHaveClass(/is-warning/, { timeout: 8000 });
  await expect(timers.nth(1)).toHaveClass(/is-danger/);
  await expect(timers.nth(2)).toHaveClass(/is-closing/);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.screenshot({
      path: `docs/design/admin-live-monitor/urgency-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  expect(navigations).toEqual([]);
});

test('shows a live pulse, explains missing duration and includes the staff footer', async ({
  page,
}) => {
  await fixture(page, { legacy: true });
  const live = page
    .getByRole('region', { name: 'Issues today', exact: true })
    .locator('.lv-monitor-live-status');
  await expect(live).toHaveText('Live');
  await expect(live.locator('i')).toHaveCSS(
    'animation-name',
    'lv-monitor-pulse',
  );
  await expect(page.locator('.lv-monitor-runtime').first()).toHaveText(
    'Not recorded',
  );
  await expect(page.locator('.lv-monitor-runtime').nth(1)).toHaveText('24 h');
  const footer = page.getByRole('contentinfo', { name: 'Staff portal footer' });
  await expect(footer).toContainText('LotVanta');
  await expect(
    footer.getByRole('link', { name: 'Powered by GiddyHost' }),
  ).toHaveAttribute('href', 'https://giddyhost.com/');
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/design/admin-live-monitor/footer-live-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(live.locator('i')).toHaveCSS('animation-name', 'none');
});

test('keeps monitor panels bounded, aligns desktop edges and scrolls closed items', async ({
  page,
}) => {
  await fixture(page);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 1100 });
    const closed = page.getByRole('region', {
      name: 'Recently closed items',
      exact: true,
    });
    await expect(closed.locator('article')).toHaveCount(12);
    const geometry = await closed.evaluate((node) => ({
      height: node.clientHeight,
      content: node.scrollHeight,
      row: node.querySelector('article')?.getBoundingClientRect().height ?? 0,
    }));
    expect(geometry.content).toBeGreaterThan(geometry.height);
    expect(Math.abs(geometry.height / geometry.row - 5)).toBeLessThan(0.05);
    await closed.evaluate((node) => {
      node.scrollTop = 200;
    });
    expect(await closed.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await closed.evaluate((node) => {
      node.scrollTop = 0;
    });
    if (width === 1280) {
      const left = await page
        .getByRole('region', { name: 'Closing next', exact: true })
        .boundingBox();
      const right = await page
        .getByRole('region', { name: 'Just closed', exact: true })
        .boundingBox();
      expect(
        left &&
          right &&
          Math.abs(left.y + left.height - right.y - right.height),
      ).toBeLessThan(2);
    }
    await page.screenshot({
      path: `docs/design/admin-live-monitor/panels-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  const toggle = page.getByRole('button', {
    name: 'View as table',
    exact: true,
  });
  const before = await toggle.evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  );
  await toggle.hover();
  await expect
    .poll(() =>
      toggle.evaluate((node) => getComputedStyle(node).backgroundColor),
    )
    .not.toBe(before);
  await toggle.click();
  await expect(
    page.getByRole('button', { name: 'View chart', exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const card = page.locator('.lv-monitor-kpis .lv-admin-kpi').first();
  await card.hover();
  await expect
    .poll(() => card.evaluate((node) => getComputedStyle(node).transform))
    .toBe('none');
});

test('updates measured issue counts silently and explains the source', async ({
  page,
}) => {
  const changes = await fixture(page);
  const issue = page
    .getByRole('button')
    .filter({ hasText: 'Bids rejected for low wallet balance' });
  await expect(issue.locator('strong')).toHaveText('0');
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  changes.reportIssue();
  await expect(issue.locator('strong')).toHaveText('3', { timeout: 12000 });
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.screenshot({
      path: `docs/design/admin-live-monitor/issues-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await issue.click();
  await expect(
    page.getByRole('dialog', { name: 'Live monitor details', exact: true }),
  ).toContainText('once per request');
  expect(navigations).toEqual([]);
});
test('silently updates prices and removes closed lots without navigation or reload', async ({
  page,
}) => {
  const changes = await fixture(page);
  await expect(
    page.getByRole('cell', { name: '₦86,000', exact: true }),
  ).toBeVisible();
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  changes.updatePrice();
  await expect(
    page
      .getByRole('row')
      .filter({
        has: page.getByRole('button', {
          name: 'Actions for LV8Q0001',
          exact: true,
        }),
      })
      .getByRole('cell', { name: '₦92,000', exact: true }),
  ).toBeVisible({ timeout: 12000 });
  changes.closeFirst();
  await expect(
    page.getByRole('button', { name: 'Actions for LV8Q0001', exact: true }),
  ).toHaveCount(0, { timeout: 12000 });
  expect(navigations).toEqual([]);
});
test('Live monitor matches the reference hierarchy and stays within the viewport', async ({
  page,
}) => {
  await fixture(page);
  await expect(
    page.getByRole('cell', { name: '₦86,000', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Issues today' }),
  ).toBeVisible();
  await expect(page.getByText('Presence tracking unavailable')).toBeVisible();
  await mkdir('docs/design/admin-live-monitor', { recursive: true });
  for (const width of [360, 768, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.screenshot({
      path: `docs/design/admin-live-monitor/${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  }
});
test('uses a bounded visible-row window and shows independent widget errors', async ({
  page,
}) => {
  await fixture(page, { failure: true });
  await expect(
    page.getByRole('region', { name: 'Closing next auctions' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'This section could not be refreshed' }),
  ).toBeVisible();
  expect(
    await page.locator('.lv-monitor-table tbody tr').count(),
  ).toBeLessThanOrEqual(14);
  await page.getByRole('button', { name: 'Show more', exact: true }).click();
  await page.waitForTimeout(1200);
  expect(
    await page.locator('.lv-monitor-table tbody tr').count(),
  ).toBeLessThanOrEqual(14);
});
test('shows an explicit empty state without a fabricated winner', async ({
  page,
}) => {
  await fixture(page, { empty: true });
  await expect(page.getByText('No lots are live right now.')).toBeVisible();
  await expect(page.getByText('No lots have closed today.')).toBeVisible();
});
test('requires a reason before leaving for bid history', async ({ page }) => {
  await fixture(page);
  await page
    .getByRole('button', { name: 'Actions for LV8Q0001', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Actions · LV8Q0001' });
  await expect(
    dialog.getByRole('button', { name: 'View bid history', exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel('Reason for viewing bid history')
    .fill('Investigating a buyer bid query');
  await dialog
    .getByRole('button', { name: 'View bid history', exact: true })
    .click();
  await expect(page).toHaveURL(/section=bid-review&lot=/);
});
test('requires a reason and typed confirmation for pause, and offers resume after silent reconciliation', async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole('button', { name: 'Pause all bidding (emergency)', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Pause all bidding',
    exact: true,
  });
  const confirm = dialog.getByRole('button', {
    name: 'Pause all bidding',
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await dialog
    .getByLabel('Reason', { exact: true })
    .fill('Investigating a marketplace incident');
  await dialog.getByLabel('Type PAUSE to confirm').fill('PAUSE');
  await expect(confirm).toBeEnabled();
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.screenshot({
      path: `docs/design/admin-live-monitor/pause-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await confirm.click();
  await expect(
    page.getByRole('button', { name: 'Resume all bidding', exact: true }),
  ).toBeVisible({ timeout: 12000 });
  const timer = page.locator('.lv-monitor-timer').first();
  const frozen = await timer.textContent();
  await page.waitForTimeout(1200);
  await expect(timer).toHaveText(frozen ?? '');
  await page
    .getByRole('dialog', { name: 'Live monitor details', exact: true })
    .getByRole('button', { name: 'Close dialog' })
    .click();
  await page
    .getByRole('button', { name: 'Resume all bidding', exact: true })
    .click();
  const resume = page.getByRole('dialog', {
    name: 'Resume all bidding',
    exact: true,
  });
  await resume
    .getByLabel('Reason', { exact: true })
    .fill('Incident resolved and approved to resume');
  await resume.getByLabel('Type RESUME to confirm').fill('RESUME');
  await resume
    .getByRole('button', { name: 'Resume all bidding', exact: true })
    .click();
  await expect(page.getByText('Running 24/7', { exact: true })).toBeVisible({
    timeout: 12000,
  });
});
test('messages an item’s bidders with a reason and clear queued confirmation', async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole('button', { name: 'Message bidders on a lot', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Message bidders on a lot',
    exact: true,
  });
  await dialog.getByLabel('Item', { exact: true }).selectOption(id(1));
  await dialog
    .getByLabel('Message to bidders')
    .fill('Please review the updated collection instructions.');
  await dialog
    .getByLabel('Staff reason')
    .fill('Clarifying collection instructions');
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.screenshot({
      path: `docs/design/admin-live-monitor/message-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await dialog
    .getByRole('button', { name: 'Send message to bidders', exact: true })
    .click();
  await expect(
    page.getByText('Message queued for this item’s bidders.', { exact: true }),
  ).toBeVisible();
});
