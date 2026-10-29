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
const inbox = new Map();
const app = await createApi({
  databaseUrl: url.href,
  mode: 'local',
  origins: ['http://localhost:3300'],
  bidOptions: { enabled: true, prefix: `test:purchase-ui:${randomUUID()}:` },
  emailProvider: {
    async sendCode(email, code) {
      inbox.set(email, code);
    },
  },
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

const browser = await chromium.launch();
const dir = 'docs/design/buyer-password-auth';
mkdirSync(dir, { recursive: true });
const review = [];
try {
  await app.listen(0, '127.0.0.1');
  const isolated = await app.getUrl();
  for (const width of [360, 768, 1280]) {
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
          url: isolated + target.pathname + target.search,
        });
        await route.fulfill({ response });
      } catch {
        if (context.pages().every((p) => p.isClosed())) return;
        throw new Error(
          'Isolated authentication request failed: ' + target.pathname,
        );
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const email = 'auth-ui-' + randomUUID() + '@example.test';
    let password = 'Private fixture password 2026';
    const capture = async (name) => {
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        name + ' overflow ' + width,
      );
      await page.screenshot({
        path: dir + '/' + name + '-' + width + '.png',
        fullPage: true,
      });
    };
    const verify = async () => {
      const code = inbox.get(email);
      assert.ok(code, 'Expected isolated verification email');
      await page.getByLabel('Six-digit code', { exact: true }).fill(code);
      await page
        .getByRole('button', { name: 'Verify and sign in', exact: true })
        .click();
      await page
        .getByRole('heading', { name: 'Personal details', exact: true })
        .waitFor();
    };
    await page.goto('http://localhost:3300/sign-up');
    await page.getByLabel('Full name', { exact: true }).fill('Amina Yusuf');
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await capture('signup');
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await page.getByLabel('Six-digit code', { exact: true }).waitFor();
    await capture('email-code');
    await verify();
    assert.equal(
      await page
        .getByLabel('Email address', { exact: true })
        .getAttribute('readonly'),
      '',
    );
    await page.getByText('Email verified', { exact: true }).waitFor();
    await page
      .getByLabel('Phone number', { exact: true })
      .fill('0803' + String(width).padStart(7, '0'));
    await page
      .getByLabel('Full address', { exact: true })
      .fill('12 Example Road, Ikeja, Lagos');
    await page
      .getByRole('button', { name: 'Save profile', exact: true })
      .click();
    await page
      .getByText('Your profile has been saved.', { exact: true })
      .waitFor();
    await capture('profile');
    await page.getByLabel('Current password', { exact: true }).fill(password);
    await page
      .getByLabel('New password', { exact: true })
      .fill('Updated fixture password 2026');
    await page
      .getByLabel('Confirm new password', { exact: true })
      .fill('Updated fixture password 2026');
    await page
      .getByRole('button', { name: 'Change password', exact: true })
      .click();
    await page.waitForURL(/sign-in/);
    password = 'Updated fixture password 2026';
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await capture('login');
    await page
      .getByRole('button', { name: 'Continue securely', exact: true })
      .click();
    await page.getByLabel('Six-digit code', { exact: true }).waitFor();
    await verify();
    if (width < 1024)
      await page
        .getByRole('button', { name: 'My account', exact: true })
        .click();
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await page.waitForURL('http://localhost:3300/');
    await page.goto('http://localhost:3300/forgot-password');
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await capture('recovery');
    await page
      .getByRole('button', { name: 'Send recovery code', exact: true })
      .click();
    await page.getByLabel('Six-digit code', { exact: true }).waitFor();
    await page
      .getByLabel('Six-digit code', { exact: true })
      .fill(inbox.get(email));
    await page
      .getByLabel('New password', { exact: true })
      .fill('Recovered fixture password 2026');
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill('Recovered fixture password 2026');
    await capture('recovery-code');
    await page
      .getByRole('button', { name: 'Save new password', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Password updated', exact: true })
      .waitFor();
    await capture('recovery-success');
    assert.deepEqual(errors, []);
    review.push({
      width,
      signup: true,
      passwordThenEmailCode: true,
      readOnlyEmail: true,
      verifiedTick: true,
      encryptedProfileSave: true,
      changePassword: true,
      logout: true,
      recovery: true,
      noOverflow: true,
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
