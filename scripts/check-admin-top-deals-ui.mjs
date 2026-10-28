import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
if (existsSync('.env')) process.loadEnvFile('.env');
const requireApi = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const pg = requireApi('pg');
const adminUrl = new URL(
  process.env.TEST_DATABASE_ADMIN_URL ?? process.env.DATABASE_URL,
);
if (!['localhost', '127.0.0.1'].includes(adminUrl.hostname))
  throw new Error('Use local PostgreSQL for the isolated UI check.');
const pool = new pg.Pool({ connectionString: adminUrl.href });
const databaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
await pool.query(`CREATE DATABASE "${databaseName}"`);
await pool.end();
adminUrl.pathname = `/${databaseName}`;
Object.assign(process.env, {
  DATABASE_URL: adminUrl.href,
  NODE_ENV: 'test',
  AUTH_MODE: 'local',
  BIDS_ENABLED: 'false',
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PII_HASH_KEY: randomBytes(32).toString('base64'),
});
const migration = spawnSync(
  process.execPath,
  ['scripts/database.mjs', 'migrate'],
  { env: process.env, stdio: 'inherit' },
);
if (migration.status !== 0)
  throw new Error('Isolated UI database migration failed.');
const importTs = (specifier) =>
  import(
    new URL(
      specifier.replace('/src/', '/dist/').replace(/\.ts$/, '.js'),
      import.meta.url,
    ).href
  );
const { createApi } = await importTs('../apps/api/src/app.ts');
const { createDatabase } = await importTs('../apps/api/src/database/client.ts');
const { encryptPii, hashPii } = await importTs(
  '../apps/api/src/security/pii.ts',
);
const { hashStaffPassword, newTotpSecret, totpCode } = await importTs(
  '../apps/api/src/auth/staff-crypto.ts',
);
const frozenTime = Date.now();
const app = await createApi({
  databaseUrl: adminUrl.href,
  mode: 'local',
  origins: ['http://localhost:3301', 'http://localhost:3300'],
  now: () => frozenTime,
  emailProvider: { async sendCode() {} },
});
const db = createDatabase(adminUrl.href);
const browser = await chromium.launch();
const dir = 'docs/design/admin-top-deals';
mkdirSync(dir, { recursive: true });
const results = [];
try {
  await app.listen(0, '127.0.0.1');
  const isolatedUrl = await app.getUrl();
  const category = await db.category.create({
    data: { name: 'Phones', slug: `ui-${randomUUID()}` },
  });
  const location = await db.location.create({
    data: {
      name: 'Synthetic test warehouse',
      code: randomUUID().slice(0, 8),
      address: 'Test address',
      hours: {},
      capacityPerSlot: 5,
    },
  });
  const password = `Test-only staff password ${randomUUID()}`;
  const passwordHash = await hashStaffPassword(password);
  const lots = [];
  for (const [index, title] of [
    'Samsung Galaxy phone',
    'Wireless noise-cancelling headphones',
    'Apple Watch',
    'Portable Bluetooth speaker',
    'Gaming monitor',
    'Laptop',
  ].entries())
    lots.push(
      await db.lot.create({
        data: {
          title,
          description: 'Isolated UI fixture',
          lotNumber: `LOT-UI-${index}`,
          condition: 'open_box',
          retailPriceKobo: 10000000n,
          startPriceKobo: 500000n,
          categoryId: category.id,
          locationId: location.id,
          startAt: new Date(frozenTime - 3600000),
          endAt: new Date(frozenTime + 7200000 + index * 60000),
          status: 'open',
        },
      }),
    );
  for (const width of [360, 768, 1280]) {
    const email = `staff-ui-${randomUUID()}@example.test`;
    const secret = newTotpSecret();
    await db.user.create({
      data: {
        name: 'Test administrator',
        role: 'admin',
        emailHash: hashPii(email, 'email'),
        emailCiphertext: encryptPii(email, 'email'),
        emailVerifiedAt: new Date(),
        staffCredential: {
          create: {
            passwordHash,
            totpSecretCiphertext: encryptPii(secret, 'staff-totp'),
          },
        },
      },
    });
    await db.lot.updateMany({ data: { isTopDeal: false, topDealOrder: 0 } });
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    await context.route('http://localhost:4000/**', async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({
        url: `${isolatedUrl}${url.pathname}${url.search}`,
      });
      await route.fulfill({ response });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3301/');
    await page.getByRole('heading', { name: 'Staff sign in' }).waitFor();
    await page.screenshot({ path: `${dir}/sign-in-${width}.png` });
    await page.getByLabel('Staff email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page
      .getByLabel('Authenticator code', { exact: true })
      .fill(totpCode(secret, Math.floor(frozenTime / 30000)));
    await page
      .getByRole('button', { name: 'Sign in to staff workspace' })
      .click();
    await page
      .getByRole('heading', { name: 'Top Deals', exact: true })
      .waitFor();
    await page.locator('.agn-admin-lot-editor').first().waitFor();
    await page.screenshot({ path: `${dir}/manager-${width}.png` });
    const target = lots[0];
    assert.ok(target);
    await page.getByLabel('Find by lot reference').fill(target.lotNumber);
    await page.getByRole('button', { name: 'Find lot', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll('.agn-admin-lot-editor').length === 1,
    );
    const editor = page.locator('.agn-admin-lot-editor').first();
    await editor.getByLabel('Feature in Top Deals').check();
    await editor.getByLabel('Display order').fill('2');
    await editor.getByRole('button', { name: 'Save selection' }).click();
    await page
      .getByText('Top Deals selection saved.', { exact: false })
      .waitFor();
    const saved = await db.lot.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(saved.isTopDeal, true);
    assert.equal(saved.topDealOrder, 2);
    await page.screenshot({ path: `${dir}/saved-${width}.png` });
    const cookies = await context.cookies(
      'http://localhost:4000/auth/staff/refresh',
    );
    assert.ok(
      cookies.some(
        (cookie) => cookie.name === 'auction_staff_refresh' && cookie.httpOnly,
      ),
    );
    const buyer = await context.newPage();
    await buyer.addInitScript(() =>
      localStorage.setItem(
        'auction-ng-cookie-notice',
        JSON.stringify({ version: 1, acknowledgedAt: Date.now() }),
      ),
    );
    await buyer.goto('http://localhost:3300/');
    await buyer
      .locator('#top-deals')
      .getByText(target.title, { exact: true })
      .waitFor();
    await page
      .locator('.agn-admin-lot-editor')
      .first()
      .getByLabel('Feature in Top Deals')
      .uncheck();
    await page.getByRole('button', { name: 'Save selection' }).click();
    await buyer
      .locator('#top-deals')
      .getByText(target.title, { exact: true })
      .waitFor({ state: 'hidden', timeout: 25000 });
    await page.context().setOffline(true);
    await page
      .getByText('You are offline. Reconnect before saving changes.')
      .waitFor();
    await page.context().setOffline(false);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('heading', { name: 'Staff sign in' }).waitFor();
    results.push({
      width,
      signedInWithBothFactors: true,
      savedSelection: true,
      displayOrder: 2,
      buyerAddedAndRemovedWithoutReload: true,
      httpOnlyCookie: true,
      offlineNotice: true,
      signOut: true,
      overflow: false,
      browserErrors: [],
    });
    await context.close();
  }
  writeFileSync(`${dir}/review.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await app.close();
  await db.$disconnect();
}
/* global localStorage, document, innerWidth */
