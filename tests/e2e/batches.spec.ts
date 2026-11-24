import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { staffPermissionsFor } from '../../packages/shared/src/index';

// Inventory batches against the real staff API on a throwaway database. Only
// the sign-in answers are synthetic; every other request reaches the API.
test.describe.configure({ mode: 'serial' });
const staffUrl = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const shots = process.env.BATCH_SCREENSHOTS;
type Session = { token: string; device: string; id: string };
let backend: ChildProcess;
let api = '';
let sessions: Record<'admin' | 'intake', Session>;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  backend = spawn(process.execPath, ['scripts/batches-test-server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, BATCHES_SEED: shots ? 'true' : 'false' },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  await new Promise<void>((resolve, reject) => {
    backend.once('exit', () => reject(new Error('Batch API exited.')));
    backend.on('message', (message) => {
      const m = message as {
        ready?: boolean;
        url: string;
        sessions: typeof sessions;
      };
      if (!m.ready) return;
      api = m.url;
      sessions = m.sessions;
      resolve();
    });
  });
});
test.afterAll(() => {
  backend?.send({ command: 'stop' });
});
const sell = (hammer: number, premium: number) =>
  new Promise<void>((resolve, reject) => {
    backend.once('message', (m) => {
      const { error } = m as { error?: string };
      if (error) reject(new Error(error));
      else resolve();
    });
    backend.send({ command: 'sell', args: [hammer, premium] });
  });

async function open(
  page: Page,
  path: string,
  role: 'admin' | 'intake' = 'admin',
) {
  const session = sessions[role];
  const problems: string[] = [];
  await page.route(/http:\/\/localhost:(4000|4400)\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (/^\/auth\/(staff\/)?refresh$/.test(url.pathname))
      return json({
        accessToken: session.token,
        expiresInSeconds: 900,
        user: {
          id: session.id,
          name: role === 'admin' ? 'Olumide Sanni' : 'Intake Tester',
          role,
          status: 'active',
          email: 'staff@example.test',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: false,
        },
      });
    if (url.pathname === '/staff/me')
      return json({
        name: role === 'admin' ? 'Olumide Sanni' : 'Intake Tester',
        roleName: role === 'admin' ? 'Admin' : 'Intake',
        permissions: staffPermissionsFor(role),
      });
    if (request.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': new URL(staffUrl).origin,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': '*, authorization, x-device-id',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH',
        },
      });
    const { host, origin, ...headers } = request.headers();
    void host;
    void origin;
    const send = () =>
      fetch(api + url.pathname + url.search, {
        method: request.method(),
        headers: {
          ...headers,
          authorization: `Bearer ${session.token}`,
          'x-device-id': session.device,
        },
        body: request.postDataBuffer() ?? undefined,
      });
    // A reused local connection can drop; every write has its own retry key.
    const response = await send()
      .catch(send)
      .catch(() => null);
    // The page can still be polling while the test ends.
    if (!response) return route.abort().catch(() => undefined);
    if (response.status >= 500)
      problems.push(`${url.pathname} ${response.status}`);
    await route
      .fulfill({
        status: response.status,
        headers: {
          'content-type': response.headers.get('content-type') ?? '',
          'Access-Control-Allow-Origin': new URL(staffUrl).origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: Buffer.from(await response.arrayBuffer()),
      })
      .catch(() => undefined);
  });
  await page.goto(staffUrl + path);
  return problems;
}
const shot = async (page: Page, name: string) => {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};
const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );

test('buys a batch, adds its lots, sells one and sees the money back', async ({
  page,
}) => {
  test.skip(!!shots, 'Runs on an empty database.');
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const problems = await open(page, '/batches');
  await expect(
    page.getByText('No open batches. Add the first one.'),
  ).toBeVisible({ timeout: 120_000 });

  // A lot can't be created before its batch.
  await page.getByRole('button', { name: 'Add batch' }).first().click();
  await expect(page.getByRole('heading', { name: /^Add batch/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save batch' }).click();
  await expect(page.getByText('Pick a supplier.')).toBeVisible();
  await expect(
    page.getByText('Enter what the batch cost. It must be more than ₦0.'),
  ).toBeVisible();

  // Create the supplier without leaving the page.
  await page.getByRole('button', { name: 'Add a new supplier' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a new supplier' });
  await dialog.getByLabel('Supplier name').fill('Konga returns');
  await dialog.getByLabel('Phone').fill('12');
  await dialog.getByRole('button', { name: 'Add supplier' }).click();
  await expect(dialog.getByText(/Nigerian number/)).toBeVisible();
  await dialog.getByLabel('Phone').fill('0803 555 0198');
  await dialog.getByRole('button', { name: 'Add supplier' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('combobox', { name: 'Supplier', exact: true }),
  ).toHaveValue(/[0-9a-f-]{36}/);

  await page.getByLabel('Batch name').fill('Konga returns, November');
  await page.getByLabel('Expected on').fill('2099-11-27');
  await page.getByLabel('Number of items (about)').fill('3');
  await page.getByLabel('What you paid the supplier (₦)').fill('9000');
  await page.getByLabel('Transport to the hub (₦)').fill('800');
  await page.getByLabel('Customs or clearing (₦)').fill('150');
  await page.getByLabel('Other (loaders, packaging) (₦)').fill('50');
  await expect(page.locator('.lv-batch-total')).toContainText('₦10,000');
  await page.setInputFiles('input[type=file]', {
    name: 'invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test'),
  });
  await page.getByRole('button', { name: 'Save and start intake' }).click();

  // Intake opens with the batch already picked; three lots go in.
  for (let n = 1; n <= 3; n++) {
    await expect(page).toHaveURL(/\/lots\/new/, { timeout: 30_000 });
    const picker = page.getByRole('combobox', { name: 'Batch' });
    await expect(picker).toContainText('B-0001');
    await expect(picker).toHaveValue(/[0-9a-f-]{36}/, { timeout: 30_000 });
    const form = page.locator('.lv-lot-form');
    await form.getByLabel('Title buyers will see').fill(`Blender ${n}`);
    await form.getByLabel('Description').fill('Returned, works well.');
    await form
      .getByLabel('Category', { exact: true })
      .selectOption({ label: 'Kitchen' });
    await form.getByRole('button', { name: /Like new/ }).click();
    await form.getByLabel('Start price (₦)').fill('5000');
    await form.getByLabel('Retail estimate (₦)').fill('20000');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page).toHaveURL(/\/lots\/[0-9a-f-]{36}$/, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole('button', { name: 'B-0001 · Konga returns, November' }),
    ).toBeVisible();
    // The worker shares the cost a moment later.
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.getByText('Unit cost', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    if (n < 3) await page.goto(staffUrl + '/lots/new');
  }

  // Sell one for ₦12,000 + 15%: more than the batch cost. The open page
  // follows on the staff refresh signal, without a reload.
  await page.goto(staffUrl + '/batches');
  await expect(page.getByRole('row', { name: /B-0001/ })).toContainText(
    'Arriving',
  );
  await sell(1_200_000, 180_000);
  await page.waitForTimeout(2000);
  await page.evaluate(() =>
    window.dispatchEvent(new Event('giddydeal:staff-refresh')),
  );
  const row = page.getByRole('row', { name: /B-0001/ });
  await expect(row).toContainText('33%', { timeout: 30_000 });
  await expect(row).toContainText('₦13,800');
  await expect(row).toContainText('+₦3,800');
  await expect(row).toContainText('Selling');
  await expect(
    page.getByText('cost recovered on day 0', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('2 of 3 items unsold')).toBeVisible();
  await page.getByRole('button', { name: 'Attachments' }).click();
  await expect(
    page.getByRole('button', { name: 'invoice.pdf', exact: true }),
  ).toBeVisible();

  // The supplier's "Got back" follows.
  await page.goto(staffUrl + '/?section=lot-setup&tab=suppliers');
  const card = page.locator('.lv-supplier-card', { hasText: 'Konga returns' });
  await expect(card).toContainText('1 batch', { timeout: 30_000 });
  await expect(card).toContainText('138%');
  await expect(
    page.getByText('Suppliers with batches can’t be deleted', {
      exact: false,
    }),
  ).toBeVisible();

  // A silent refresh keeps what is being typed.
  const notes = page.getByLabel('Notes');
  await notes.fill('Ask for the item list');
  await page.evaluate(() =>
    window.dispatchEvent(new Event('giddydeal:staff-refresh')),
  );
  await page.waitForTimeout(1500);
  await expect(notes).toHaveValue('Ask for the item list');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Konga returns saved.')).toBeVisible();

  // Pause: it can't be bought from again.
  await page.getByRole('button', { name: 'Pause supplier' }).click();
  await expect(card).toContainText('Paused');
  expect(problems).toEqual([]);
});

test('intake staff see batches without costs', async ({ page }) => {
  test.skip(!!shots, 'Runs on an empty database.');
  test.setTimeout(120_000);
  await open(page, '/batches', 'intake');
  const row = page.getByRole('row', { name: /B-0001/ });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.lv-batches').first()).not.toContainText('₦');
  await expect(page.getByRole('button', { name: 'Add batch' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Update item count' }).click();
  await page.getByLabel('How many items arrived?').fill('3');
  await page.getByRole('button', { name: 'Save item count' }).click();
  await expect(page.getByText('B-0001 received: 3 items.')).toBeVisible();
});

test('menu names stay on one line', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await open(page, '/batches');
  const labels = page.locator(
    '.lv-staff-sidebar nav button > span:first-of-type',
  );
  await expect(labels.filter({ hasText: 'Inventory batches' })).toBeVisible({
    timeout: 60_000,
  });
  for (const label of await labels.all()) {
    const box = await label.boundingBox();
    expect(box?.height ?? 0).toBeLessThan(26);
    expect(
      await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  }
});

for (const width of [360, 768, 1280, 1440])
  test(`fits ${width} px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, ready, name] of [
      ['/batches', '.lv-batch-table tbody tr, .lv-setup-state', 'batches'],
      ['/batches/new', '.lv-batch-dark', 'batch-new'],
      [
        '/?section=lot-setup&tab=suppliers',
        '.lv-supplier-card, .lv-setup-state',
        'suppliers',
      ],
    ] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await open(page, path);
      await expect(page.locator(ready).first()).toBeVisible({
        timeout: 60_000,
      });
      if (shots) {
        if (name === 'batches')
          await page.getByRole('button', { name: 'Show B-0318' }).click();
        if (name === 'suppliers')
          await page
            .locator('.lv-supplier-card', { hasText: 'Konga returns' })
            .click();
        await page.waitForTimeout(2500);
      }
      expect([name, await fits(page)]).toEqual([name, true]);
      await shot(page, `${name}-${width}`);
    }
  });
