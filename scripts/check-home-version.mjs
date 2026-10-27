import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = 'http://localhost:3300';
const response = await fetch(base + '/api/web-version');
assert.equal(response.ok, true);
assert.match(response.headers.get('cache-control'), /no-store/);
const { version } = await response.json();
assert.ok(version && version !== 'development');
const browser = await chromium.launch();
const page = await browser.newPage();
let changed = false;
let changesServed = 0;
let navigation = 0;
let reads = 0;
page.on('request', (request) => {
  if (request.isNavigationRequest() && request.frame() === page.mainFrame())
    navigation++;
});
await page.route('**/api/web-version', (route) => {
  reads++;
  if (changed) {
    changed = false;
    changesServed++;
    return route.fulfill({
      json: { version: 'new-build-fixture' },
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return route.continue();
});
try {
  await page.goto(base);
  await page.locator('[data-buyer-ready="true"]').waitFor();
  await page.waitForTimeout(400);
  const initial = navigation;
  const input = page
    .locator('input[aria-label="Search auctions"]:visible')
    .first();
  await input.focus();
  changed = true;
  await page.locator('body').evaluate((body) => {
    const view = body.ownerDocument.defaultView;
    view.dispatchEvent(new view.Event('focus'));
  });
  await page.waitForTimeout(500);
  assert.equal(navigation, initial, 'Do not reload while typing');
  await input.blur();
  changed = true;
  const reload = page.waitForEvent('framenavigated', {
    predicate: (frame) => frame === page.mainFrame(),
  });
  await page.locator('body').evaluate((body) => {
    const view = body.ownerDocument.defaultView;
    view.dispatchEvent(new view.Event('focus'));
  });
  await reload;
  await page.locator('[data-buyer-ready="true"]').waitFor();
  await page.waitForTimeout(500);
  assert.equal(navigation, initial + 1);
  await page.goto(base + '/help');
  await page.waitForTimeout(300);
  const readsOnHelp = reads;
  await page.locator('body').evaluate((body) => {
    const view = body.ownerDocument.defaultView;
    view.dispatchEvent(new view.Event('focus'));
  });
  await page.waitForTimeout(400);
  assert.equal(reads, readsOnHelp, 'No build checks outside home');
  const result = {
    sameVersionDoesNotReload: true,
    typingDefersReload: true,
    changedVersionReloadsOnce: true,
    noBuildChecksOutsideHome: true,
    changesServed,
  };
  fs.mkdirSync('docs/design/home-version', { recursive: true });
  fs.writeFileSync(
    'docs/design/home-version/review.json',
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(result);
} finally {
  await browser.close();
}
