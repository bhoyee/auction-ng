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
const { BidService } = await import('../apps/api/dist/bids/bid-service.js');
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
const sources = (
  await (
    await fetch('http://localhost:4000/lots?topDeals=true&limit=50')
  ).json()
).items.filter((lot) => lot.fixedPriceKobo);
if (sources.length < 3)
  throw new Error('Three visible fixed-price demo sources required.');
const browser = await chromium.launch();
const historyOnly = process.argv.includes('--history-only');
const dir = historyOnly
  ? process.argv.includes('--information')
    ? 'docs/design/lot-detail-information'
    : 'docs/design/lot-history'
  : 'docs/design/premium-lot-detail';
mkdirSync(dir, { recursive: true });
const review = [];
try {
  await app.listen(0, '127.0.0.1');
  const isolated = await app.getUrl();
  const category = await db.category.create({
    data: { name: 'Synthetic phones', slug: randomUUID() },
  });
  const location = await db.location.create({
    data: {
      name: 'Synthetic Lagos pickup',
      code: randomUUID().slice(0, 12),
      address: 'Test only',
      hours: {},
      capacityPerSlot: 10,
    },
  });
  for (const [index, width] of [360, 768, 1280].entries()) {
    const source = sources[index];
    await db.lot.create({
      data: {
        id: source.id,
        lotNumber: source.lotNumber,
        title: source.title,
        description: 'Isolated checkout fixture',
        condition: source.condition,
        categoryId: category.id,
        locationId: location.id,
        startPriceKobo: BigInt(source.startPriceKobo),
        retailPriceKobo: BigInt(source.retailPriceKobo),
        fixedPriceKobo: BigInt(source.fixedPriceKobo),
        startAt: new Date(Date.now() - 60000),
        endAt: new Date(source.endsAt),
        status: 'open',
      },
    });
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await context.route('http://localhost:4000/**', async (route) => {
      const target = new URL(route.request().url());
      try {
        const response = await route.fetch({
          url: `${isolated}${target.pathname}${target.search}`,
        });
        await route.fulfill({ response });
      } catch {
        // Pending refresh requests can finish after a fixture context closes.
        if (context.pages().every((page) => page.isClosed())) return;
        throw new Error(`Isolated API proxy failed for ${target.pathname}.`);
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://localhost:3300/lots/${source.id}`);
    await page
      .getByRole('link', { name: 'Join Now to Bid', exact: true })
      .first()
      .waitFor();
    await page
      .locator('.agn-lot-detail-aside:visible')
      .first()
      .screenshot({ path: `${dir}/signed-out-${width}.png` });
    const device = randomUUID(),
      refresh = randomBytes(32).toString('base64url'),
      token = randomBytes(32).toString('base64url');
    const email = `purchase-ui-${randomUUID()}@example.test`;
    const user = await db.user.create({
      data: {
        name: 'Synthetic checkout buyer',
        emailHash: hashPii(email, 'email'),
        emailCiphertext: encryptPii(email, 'email'),
        emailVerifiedAt: new Date(),
      },
    });
    const wallet = await ledger.openWallet(user.id);
    await ledger.topup({
      walletId: wallet.id,
      amountKobo: 100000000n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    });
    await db.authSession.create({
      data: {
        userId: user.id,
        familyId: randomUUID(),
        deviceHash: hashPii(`web:${device}`, 'auth-device'),
        client: 'web',
        accessHash: hashPii(token, 'auth-token'),
        refreshHash: hashPii(refresh, 'auth-token'),
        accessExpiresAt: new Date(Date.now() + 900000),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await context.addInitScript(
      (id) => localStorage.setItem('auction-ng-device', id),
      device,
    );
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
    await page.reload();
    if (historyOnly) {
      await page
        .getByRole('button', { name: 'Buy Now', exact: true })
        .first()
        .waitFor();
      const engine = app.get(BidService);
      const key = randomUUID();
      const privateMaximum = source.startPriceKobo * 2;
      const prepared = await engine.prepare(
        {
          userId: user.id,
          sessionId: (
            await db.authSession.findFirstOrThrow({
              where: { userId: user.id, revokedAt: null },
              orderBy: { createdAt: 'desc' },
            })
          ).id,
        },
        source.id,
        { maxKobo: privateMaximum, mode: 'automatic', idempotencyKey: key },
        token,
        device,
      );
      const accepted = await engine.accept(
        source.id,
        { preparationId: prepared.preparationId, idempotencyKey: key },
        token,
        device,
      );
      await engine.persist([accepted.streamId]);
      for (let index = 1; index <= 10; index++) {
        const retryKey = randomUUID();
        const proof = await engine.prepare(
          {
            userId: user.id,
            sessionId: (
              await db.authSession.findFirstOrThrow({
                where: { userId: user.id, revokedAt: null },
                orderBy: { createdAt: 'desc' },
              })
            ).id,
          },
          source.id,
          {
            maxKobo: privateMaximum + index * 10000,
            mode: 'automatic',
            idempotencyKey: retryKey,
          },
          token,
          device,
        );
        const raised = await engine.accept(
          source.id,
          { preparationId: proof.preparationId, idempotencyKey: retryKey },
          token,
          device,
        );
        await engine.persist([raised.streamId]);
      }
      const publicResponse = await fetch(
        `${isolated}/lots/${source.id}/bid-history`,
      );
      assert.equal(publicResponse.status, 200);
      const history = await publicResponse.json();
      assert.equal(history.items.length, 11);
      assert.equal(history.items[0].currentPriceKobo, source.startPriceKobo);
      assert.doesNotMatch(
        JSON.stringify(history),
        new RegExp(`${user.id}|${privateMaximum}|maxKobo|bidderId|email`),
      );
      const historyPanel = page
        .locator('[aria-label="Bid history"]:visible')
        .first();
      await historyPanel
        .getByRole('cell', { name: /Buyer [A-F0-9]{6}/ })
        .first()
        .waitFor();
      assert.equal(await historyPanel.locator('tbody tr').count(), 10);
      await historyPanel
        .getByRole('button', { name: 'Next page', exact: true })
        .click();
      await historyPanel
        .getByText('Page 2 · 10 rows per page', { exact: true })
        .waitFor();
      assert.equal(await historyPanel.locator('tbody tr').count(), 1);
      await historyPanel
        .getByRole('button', { name: 'Previous page', exact: true })
        .click();
      await historyPanel
        .getByText('Page 1 · 10 rows per page', { exact: true })
        .waitFor();
      await historyPanel
        .getByRole('button', { name: 'Your Bid', exact: true })
        .click();
      await historyPanel.getByRole('cell', { name: /You/ }).first().waitFor();
      assert.equal(await historyPanel.locator('tbody tr').count(), 10);
      await historyPanel.screenshot({ path: `${dir}/your-bid-${width}.png` });
      await historyPanel
        .getByRole('button', { name: 'Winning Bid', exact: true })
        .click();
      await historyPanel
        .getByRole('cell', { name: /Buyer [A-F0-9]{6}/ })
        .first()
        .waitFor();
      await historyPanel.screenshot({
        path: `${dir}/signed-in-history-${width}.png`,
      });
      await context.clearCookies();
      await page.reload();
      await page
        .getByRole('link', { name: 'Join Now to Bid', exact: true })
        .first()
        .waitFor();
      await historyPanel
        .getByRole('cell', { name: /Buyer [A-F0-9]{6}/ })
        .first()
        .waitFor();
      assert.equal(
        await historyPanel
          .getByRole('button', { name: 'Your Bid', exact: true })
          .isDisabled(),
        true,
      );
      await historyPanel.screenshot({
        path: `${dir}/public-history-${width}.png`,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.deepEqual(errors, []);
      review.push({
        width,
        publicHistory: true,
        privateMaximumHidden: true,
        ownHistory: true,
        guestPersonalDisabled: true,
        overflow: false,
        browserErrors: [],
      });
      await context.close();
      continue;
    }
    await page
      .getByRole('button', { name: 'Buy Now', exact: true })
      .first()
      .waitFor();
    await page
      .locator('.agn-detail-columns:visible')
      .first()
      .screenshot({ path: `${dir}/signed-in-${width}.png` });
    await page
      .getByRole('button', { name: 'Buy Now', exact: true })
      .first()
      .click();
    const panel = page
      .locator('[aria-label="Instant purchase"]:visible')
      .first();
    await panel
      .getByRole('radio', { name: 'Wallet funds', exact: true })
      .waitFor();
    if (width === 360) {
      await ledger.debit({
        walletId: wallet.id,
        amountKobo: 100000000n,
        idempotencyKey: randomUUID(),
        reference: randomUUID(),
      });
      await panel.getByRole('button', { name: /Buy now/ }).click();
      await panel
        .getByText(
          'Your available wallet funds are too low. Check your wallet or choose card or transfer.',
          { exact: true },
        )
        .waitFor();
      await ledger.topup({
        walletId: wallet.id,
        amountKobo: 100000000n,
        idempotencyKey: randomUUID(),
        reference: randomUUID(),
      });
    }
    await panel
      .getByRole('radio', { name: 'Nigerian card', exact: true })
      .check();
    await panel.screenshot({ path: `${dir}/card-quote-${width}.png` });
    await panel
      .getByRole('radio', { name: 'Bank transfer', exact: true })
      .check();
    await panel.getByRole('button', { name: /Reserve and pay/ }).click();
    await panel
      .getByRole('link', { name: 'Continue to secure payment', exact: true })
      .waitFor();
    await panel.screenshot({ path: `${dir}/reservation-${width}.png` });
    await panel
      .getByRole('button', { name: 'Cancel reservation', exact: true })
      .click();
    await panel
      .getByRole('button', { name: 'Start a new purchase', exact: true })
      .waitFor();
    await panel
      .getByRole('button', { name: 'Start a new purchase', exact: true })
      .click();
    await panel
      .getByRole('radio', { name: 'Wallet funds', exact: true })
      .check();
    const activeSession = await db.authSession.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const engine = app.get(BidService),
      bidKey = randomUUID();
    const prepared = await engine.prepare(
      { userId: user.id, sessionId: activeSession.id },
      source.id,
      {
        maxKobo: source.startPriceKobo,
        mode: 'direct',
        idempotencyKey: bidKey,
      },
      token,
      device,
    );
    await engine.accept(
      source.id,
      { preparationId: prepared.preparationId, idempotencyKey: bidKey },
      token,
      device,
    );
    await panel.getByRole('button', { name: /Buy now/ }).click();
    await panel
      .getByText(
        'Your purchase is paid. The item is yours and bidding has stopped.',
        { exact: true },
      )
      .waitFor();
    await panel.screenshot({ path: `${dir}/paid-${width}.png` });
    assert.equal(
      await db.invoiceLine.count({ where: { lotId: source.id } }),
      1,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    await page.goto('http://localhost:3300/my-bids');
    await page
      .locator('.agn-badge:visible')
      .filter({ hasText: /^Cancelled$/ })
      .first()
      .waitFor();
    await page.screenshot({
      path: `${dir}/cancelled-bids-${width}.png`,
      fullPage: true,
    });
    const invoice = await db.invoiceLine.findUniqueOrThrow({
      where: { lotId: source.id },
    });
    await page.goto(`http://localhost:3300/invoices/${invoice.invoiceId}`);
    await page.getByText('Fixed item price', { exact: true }).waitFor();
    await page.getByText('Tax (7.5%)', { exact: true }).waitFor();
    await page.screenshot({
      path: `${dir}/invoice-${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    review.push({
      width,
      signedOut: true,
      cardQuote: true,
      transferReservation: true,
      cancel: true,
      walletPurchase: true,
      cancelledBidHistory: true,
      fixedPriceInvoice: true,
      oneInvoice: true,
      overflow: false,
      browserErrors: [],
    });
    await context.close();
  }
  writeFileSync(`${dir}/review.json`, JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify(review));
} finally {
  await browser.close();
  await app.close();
}
/* global localStorage,document,innerWidth */
