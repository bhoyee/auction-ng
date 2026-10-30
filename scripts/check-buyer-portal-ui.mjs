import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
if (existsSync('.env')) process.loadEnvFile('.env');
const req = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Pool } = req('pg');
const url = new URL(
  process.env.TEST_DATABASE_ADMIN_URL ?? process.env.DATABASE_URL,
);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Local isolated UI database required.');
const pool = new Pool({ connectionString: url.href });
const name = `auction_ng_test_${randomBytes(8).toString('hex')}`;
await pool.query(`CREATE DATABASE "${name}"`);
await pool.end();
url.pathname = `/${name}`;
Object.assign(process.env, {
  DATABASE_URL: url.href,
  NODE_ENV: 'test',
  AUTH_MODE: 'local',
  BIDS_ENABLED: 'false',
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PII_HASH_KEY: randomBytes(32).toString('base64'),
});
const migrate = spawnSync(
  process.execPath,
  ['scripts/database.mjs', 'migrate'],
  { env: process.env, stdio: 'inherit' },
);
if (migrate.status !== 0) throw new Error('Migration failed.');
const { createApi } = await import('../apps/api/dist/app.js');
const { LedgerService } =
  await import('../apps/api/dist/ledger/ledger-service.js');
const { encryptPii, hashPii } =
  await import('../apps/api/dist/security/pii.js');
const app = await createApi({
  databaseUrl: url.href,
  mode: 'local',
  origins: ['http://localhost:3300'],
  bidOptions: { enabled: true, prefix: `test:purchase-ui:${randomUUID()}:` },
  emailProvider: { async sendCode() {} },
  paymentProvider: {
    async initializeCard() {
      return { authorizationUrl: 'https://checkout.paystack.com/synthetic' };
    },
    verifySignature() {
      return true;
    },
    async assignAccount() {},
    async getAccount() {
      return null;
    },
    async verifyTransfer() {
      throw new Error('No provider payment in this browser check.');
    },
    async listTransfers() {
      return [];
    },
  },
});
const ledger = app.get(LedgerService);
const db = ledger.db;

const browser = await chromium.launch();
const dir = 'docs/design/buyer-portal';
mkdirSync(dir, { recursive: true });
const review = [];
try {
  await app.listen(0, '127.0.0.1');
  const isolated = await app.getUrl();
  const email = 'portal-' + randomUUID() + '@example.test';
  const user = await db.user.create({
    data: {
      name: 'Amina Yusuf',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
    },
  });
  const wallet = await ledger.openWallet(user.id);
  await ledger.topup({
    walletId: wallet.id,
    amountKobo: 25000000n,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  const category = await db.category.create({
    data: { name: 'Phones', slug: randomUUID() },
  });
  const location = await db.location.create({
    data: {
      name: 'Lagos collection centre',
      code: randomUUID().slice(0, 12),
      address: '12 Test Road, Lekki, Lagos',
      hours: {},
      capacityPerSlot: 10,
    },
  });
  const lot = await db.lot.create({
    data: {
      title: 'Samsung Galaxy smartwatch',
      description: 'Isolated UI fixture',
      condition: 'open_box',
      categoryId: category.id,
      locationId: location.id,
      startPriceKobo: 50000n,
      retailPriceKobo: 20000000n,
      startAt: new Date(),
      endAt: new Date(Date.now() + 86400000),
      status: 'open',
    },
  });
  await db.watchlist.create({ data: { userId: user.id, lotId: lot.id } });
  const invoice = await db.invoice.create({
    data: {
      userId: user.id,
      status: 'paid',
      hammerTotalKobo: 10000000n,
      premiumKobo: 0n,
      lotFeeKobo: 0n,
      vatKobo: 750000n,
      totalKobo: 10750000n,
    },
  });
  await db.invoiceLine.create({
    data: {
      invoiceId: invoice.id,
      lotId: lot.id,
      hammerKobo: 10000000n,
      premiumKobo: 0n,
      lotFeeKobo: 0n,
      vatKobo: 750000n,
      totalKobo: 10750000n,
    },
  });
  await db.fulfilment.create({
    data: {
      invoiceId: invoice.id,
      userId: user.id,
      locationId: location.id,
      status: 'ready',
    },
  });
  const namespace = 'test:portal:' + randomUUID() + ':';
  await db.bidEngineRuntime.create({
    data: { namespace, redisRunId: randomUUID() },
  });
  await db.purchase.create({
    data: {
      userId: user.id,
      walletId: wallet.id,
      lotId: lot.id,
      namespace,
      requestKey: randomUUID(),
      method: 'wallet',
      status: 'paid',
      priceKobo: 10000000n,
      taxKobo: 750000n,
      totalKobo: 10750000n,
      amountKobo: 10750000n,
      processingFeeKobo: 0n,
      creditKobo: 10750000n,
      expiresAt: new Date(),
      providerRef: randomUUID(),
      invoiceId: invoice.id,
    },
  });
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    const device = randomUUID(),
      refresh = randomBytes(32).toString('base64url'),
      token = randomBytes(32).toString('base64url');
    await db.authSession.create({
      data: {
        buyerMfa: true,
        userId: user.id,
        familyId: randomUUID(),
        deviceHash: hashPii('web:' + device, 'auth-device'),
        client: 'web',
        accessHash: hashPii(token, 'auth-token'),
        refreshHash: hashPii(refresh, 'auth-token'),
        accessExpiresAt: new Date(Date.now() + 900000),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await context.addInitScript((id) => {
      localStorage.setItem('auction-ng-device', id);
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      );
    }, device);
    await context.addCookies([
      {
        name: 'auction_refresh',
        value: refresh,
        domain: 'localhost',
        path: '/auth',
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);
    await context.route('http://localhost:4000/**', async (route) => {
      const target = new URL(route.request().url());
      try {
        const response = await route.fetch({
          url: isolated + target.pathname + target.search,
        });
        await route.fulfill({ response });
      } catch {
        if (context.pages().every((p) => p.isClosed())) return;
        throw new Error(
          'Portal isolated API request failed: ' + target.pathname,
        );
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const screens = [
      ['wallet', 'Wallet'],
      ['account', 'Profile'],
      ['awaiting-pickup', 'Awaiting pickup'],
      ['check-in', 'Check-in'],
      ['shipments', 'Shipments'],
      ['watchlist', 'Watchlist'],
      ['purchase-history', 'Purchase history'],
      ['my-bids', 'Bid history'],
      ['customer-service', 'Customer service'],
    ];
    for (const [path, title] of screens) {
      await page.goto('http://localhost:3300/' + path);
      await page
        .getByRole('heading', { name: title, exact: true })
        .first()
        .waitFor();
      await page
        .locator('.agn-buyer-skeleton:visible')
        .waitFor({ state: 'hidden' });
      if (path === 'wallet')
        await page
          .getByText('Available to spend', { exact: true })
          .last()
          .waitFor();
      if (
        path === 'purchase-history' ||
        path === 'awaiting-pickup' ||
        path === 'check-in'
      )
        await page
          .getByRole('link', { name: invoice.number, exact: true })
          .first()
          .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        path + ' overflow at ' + width,
      );
      await page.screenshot({
        path: dir + '/' + path + '-' + width + '.png',
        fullPage: true,
      });
    }
    if (width === 1280) {
      await page
        .getByRole('button', { name: 'Collapse account sidebar' })
        .click();
      await page
        .getByRole('button', { name: 'Expand account sidebar' })
        .waitFor();
      await page.screenshot({
        path: dir + '/collapsed-1280.png',
        fullPage: true,
      });
      await page
        .getByRole('button', { name: 'Expand account sidebar' })
        .click();
    } else {
      await page
        .getByRole('button', { name: 'My account', exact: true })
        .click();
      await page.getByRole('navigation', { name: 'Buyer account' }).waitFor();
      await page.screenshot({
        path: dir + '/menu-' + width + '.png',
        fullPage: true,
      });
    }
    const nav = page.getByRole('navigation', { name: 'Buyer account' });
    assert.equal(await nav.getByRole('link').count(), 8);
    assert.equal(
      await nav.getByRole('link', { name: 'Transfers', exact: true }).count(),
      0,
    );
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await page.waitForURL('http://localhost:3300/');
    await page.goto('http://localhost:3300/purchase-history');
    await page.waitForURL(/sign-in/);
    assert.equal(await page.locator('.agn-portal-sidebar:visible').count(), 0);
    assert.deepEqual(errors, []);
    review.push({
      width,
      screens: screens.length,
      noOverflow: true,
      menu: true,
      logout: true,
      privateGate: true,
      browserErrors: errors,
    });
    await context.close();
  }
  writeFileSync(dir + '/review.json', JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify(review));
} finally {
  await browser.close();
  await app.close();
}
/* global localStorage,document,innerWidth */
