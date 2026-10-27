import { chromium } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
const base = (await (await fetch('http://localhost:4000/lots?limit=1')).json())
  .items[0];
if (!base) throw Error('No catalogue fixture source');
const dir = 'docs/design/home-live';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const start = Date.now();
let now = start;
let reads = 0;
const sockets = [];
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const make = (title, ms) => ({
  ...base,
  id: randomUUID(),
  title,
  lotNumber: 'TEST-' + title.replaceAll(' ', '-'),
  status: 'open',
  endsAt: new Date(start + ms).toISOString(),
  thumbnail: null,
  secondaryThumbnailUrl: null,
});
let items = [
  make('Boundary auction', 1202000),
  make('Expiry auction', 6000),
  make('Extended auction', 4000),
];
const extended = items[2];
const live = (lot) => ({
  lotId: lot.id,
  currentPriceKobo: lot.startPriceKobo,
  endsAt: lot.endsAt,
  streamId: '1-0',
  serverTime: new Date(now).toISOString(),
  isLeader: false,
});
await page.clock.install({ time: new Date(start) });
await page.clock.pauseAt(new Date(start));
await page.route('http://localhost:4000/lots?*', (route) => {
  reads++;
  return route.fulfill({
    json: { items, nextCursor: null, serverTime: new Date(now).toISOString() },
  });
});
await page.route('http://localhost:4000/time', (route) =>
  route.fulfill({ json: { serverTime: new Date(now).toISOString() } }),
);
await page.routeWebSocket(/localhost:4001\/socket.io\//, (ws) => {
  sockets.push(ws);
  ws.send(
    '0' +
      JSON.stringify({
        sid: randomUUID(),
        upgrades: [],
        pingInterval: 25000,
        pingTimeout: 20000,
      }),
  );
  ws.onMessage((message) => {
    const text = String(message);
    if (text.startsWith('40/public'))
      ws.send('40/public,' + JSON.stringify({ sid: randomUUID() }));
    const match = text.match(/^42\/public,(\d+)(\[.*)$/);
    if (match) {
      const [event, input] = JSON.parse(match[2]);
      let response;
      if (event === 'lot:subscribe') {
        const lot = items.find((l) => l.id === input.lotId);
        response = lot ? { ok: true, lot: live(lot) } : { ok: false };
      }
      if (event === 'clock:sync')
        response = { serverTime: new Date(now).toISOString() };
      if (response)
        ws.send('43/public,' + match[1] + JSON.stringify([response]));
    }
  });
});
const advance = async (ms) => {
  now += ms;
  await page.clock.runFor(ms);
  await new Promise((r) => setTimeout(r, 150));
};
const count = async (selector, title) =>
  page
    .locator(selector)
    .getByRole('button', { name: title, exact: true })
    .count();
const review = {};
try {
  await page.goto('http://localhost:3300/');
  await advance(1000);
  await page.locator('[data-buyer-ready="true"]').waitFor();
  await page.addStyleTag({
    content: '.agn-header-stack--compact { visibility: hidden !important; }',
  });
  await advance(500);
  review.initial = {
    topBoundary: await count('#top-deals', 'Boundary auction'),
    closingExpiry: await count('.agn-closing-band', 'Expiry auction'),
  };
  extended.endsAt = new Date(start + 30 * 60000).toISOString();
  for (const ws of sockets)
    ws.send(
      '42/public,' +
        JSON.stringify(['lot:update', { ...live(extended), streamId: '2-0' }]),
    );
  await advance(1000);
  review.extension = {
    topExtended: await count('#top-deals', 'Extended auction'),
    closingExtended: await count('.agn-closing-band', 'Extended auction'),
  };
  await advance(1000);
  review.boundary = {
    topBoundary: await count('#top-deals', 'Boundary auction'),
    closingBoundary: await count('.agn-closing-band', 'Boundary auction'),
  };
  await advance(4000);
  review.expiry = {
    expiryCards: await count('main', 'Expiry auction'),
    extendedCards: await count('main', 'Extended auction'),
  };
  items = [
    ...items.filter((l) => l.title !== 'Expiry auction'),
    make('Newly published auction', 60 * 60000),
  ];
  await advance(15000);
  review.refresh = {
    newCards: await count('#top-deals', 'Newly published auction'),
    catalogueReads: reads,
  };
  review.errors = errors;
  const top = page.locator('#top-deals:visible').first();
  const closing = page.locator('.agn-closing-band:visible').first();
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await top.scrollIntoViewIfNeeded();
    await top.screenshot({ path: `${dir}/top-${width}.png` });
    await closing.scrollIntoViewIfNeeded();
    await closing.screenshot({ path: `${dir}/closing-${width}.png` });
  }
  review.colours = {
    top: await top
      .locator('.agn-countdown')
      .first()
      .evaluate(
        (e) => e.ownerDocument.defaultView.getComputedStyle(e).backgroundColor,
      ),
    closing: await closing
      .locator('.agn-countdown')
      .first()
      .evaluate(
        (e) => e.ownerDocument.defaultView.getComputedStyle(e).backgroundColor,
      ),
  };
  items.push(make('Clock outage auction', now - start + 65000));
  await advance(15000);
  await page.route('http://localhost:4000/time', (route) => route.abort());
  await advance(70000);
  review.clockResyncOutage = {
    expiredCards: await count('main', 'Clock outage auction'),
  };
  fs.writeFileSync(
    `${dir}/review.json`,
    JSON.stringify(review, null, 2) + '\n',
  );
  console.log(JSON.stringify(review, null, 2));
  if (
    review.initial.topBoundary !== 1 ||
    review.initial.closingExpiry !== 1 ||
    review.extension.topExtended !== 1 ||
    review.extension.closingExtended !== 0 ||
    review.boundary.topBoundary !== 0 ||
    review.boundary.closingBoundary !== 1 ||
    review.expiry.expiryCards !== 0 ||
    review.expiry.extendedCards !== 1 ||
    review.refresh.newCards !== 1 ||
    review.clockResyncOutage.expiredCards !== 0 ||
    errors.length
  )
    throw Error('Home live review failed');
} finally {
  await browser.close();
}
