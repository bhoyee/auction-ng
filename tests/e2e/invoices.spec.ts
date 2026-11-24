import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { staffPermissionsFor } from '../../packages/shared/src/index';

// Invoices against the real staff API on a throwaway database. Only the
// sign-in answers are synthetic; every other request reaches the API.
test.describe.configure({ mode: 'serial' });
const staffUrl = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const shots = process.env.INVOICE_SCREENSHOTS;
type Role = 'admin' | 'manager' | 'finance' | 'warehouse';
type Session = { token: string; device: string; id: string };
const names: Record<Role, string> = {
  admin: 'Olumide Sanni',
  manager: 'Funke Bello',
  finance: 'Ngozi Eze',
  warehouse: 'Musa Ibrahim',
};
let backend: ChildProcess;
let api = '';
let sessions: Record<Role, Session>;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  backend = spawn(
    process.execPath,
    ['scripts/batches-test-server.mjs', 'tests/invoices-server.ts'],
    { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'inherit', 'ipc'] },
  );
  await new Promise<void>((resolve, reject) => {
    backend.once('exit', () => reject(new Error('Invoice API exited.')));
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

async function open(page: Page, path: string, role: Role = 'admin') {
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
          name: names[role],
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
        name: names[role],
        roleName: role,
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
        body: request.postData() ?? undefined,
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
  await page.screenshot({ path: `${shots}/${name}.png` });
};
/** What sticks out past the screen, so a failure names it. */
const wide = (page: Page) =>
  page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth
      ? []
      : Array.from(document.querySelectorAll('main *'))
          .filter((e) => e.getBoundingClientRect().right > window.innerWidth)
          .map((e) => `${e.tagName}.${e.className}`)
          .slice(0, 20),
  );
const codes = (page: Page) => page.locator('.lv-inv-table .lv-batch-code');

test('finds an invoice and reads it beside the list', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const problems = await open(page, '/orders/invoices');
  await expect(codes(page)).toHaveCount(16, { timeout: 60_000 });
  const first = (await codes(page).nth(0).textContent()) ?? '';
  const second = (await codes(page).nth(1).textContent()) ?? '';
  await codes(page).nth(0).click();
  const drawer = page.locator('.lv-inv-drawer');
  await expect(drawer.getByRole('heading', { name: first })).toBeVisible();
  await expect(drawer.getByText('Total paid')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`invoice=${first}`));
  await shot(page, 'list-drawer-1440');
  await page.keyboard.press('ArrowDown');
  await expect(page).toHaveURL(new RegExp(`invoice=${second}`));
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await page.getByLabel('Status').selectOption('pick:collected');
  await expect(page.getByText('No invoices match.')).toBeVisible();
  await page.getByLabel('Status').selectOption('');
  await page.getByRole('button', { name: /^Collected/ }).click();
  await expect(
    page.getByText('Nothing collected in these dates.'),
  ).toBeVisible();
  await page.getByRole('button', { name: /^All/ }).click();
  const search = page.getByPlaceholder('Invoice number, buyer name or phone');
  await search.fill('0817 555 1120');
  await expect(codes(page)).toHaveCount(4);
  await search.fill('nothing here');
  await expect(page.getByText('No invoices match.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(codes(page)).toHaveCount(16);
  expect(problems).toEqual([]);
});

test('one person asks for a refund, a manager then an admin approve it', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const problems = await open(page, '/orders/invoices', 'finance');
  await expect(codes(page)).toHaveCount(16, { timeout: 60_000 });
  const number = (await codes(page).nth(1).textContent()) ?? '';
  await codes(page).nth(1).click();
  await page.getByRole('button', { name: 'Request refund' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Amount for/).fill('99999999');
  await dialog.getByLabel('Reason').selectOption('damaged');
  await dialog.getByLabel('Note for the approver').fill('Jug is cracked');
  await expect(dialog.getByRole('alert')).toContainText('left to refund');
  await dialog.getByLabel(/^Amount for/).fill('2500');
  await expect(dialog.getByText('This is a partial refund')).toBeVisible();
  await shot(page, 'refund-request-1440');
  await dialog
    .getByRole('button', { name: 'Request refund of ₦2,500.00' })
    .click();
  await expect(page.getByText('others must approve')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
  });
  const path = `/orders/invoices/${number}`;
  const boss = await context.newPage();
  const manager = await open(boss, path, 'manager');
  await expect(boss.getByText('waiting for a manager (1 of 2)')).toBeVisible({
    timeout: 60_000,
  });
  await boss.getByRole('button', { name: 'Approve' }).click();
  const yes = boss.getByRole('dialog');
  await yes.getByLabel('Note').fill('Seen the crack');
  await yes.getByLabel(/send this to an admin/).fill('APPROVE');
  await yes.getByRole('button', { name: 'Approve ₦2,500.00' }).click();
  await expect(boss.getByText('waiting for an admin (2 of 2)')).toBeVisible();
  await expect(boss.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await boss.close();

  const other = await context.newPage();
  const more = await open(other, path);
  await expect(other.getByText('waiting for an admin (2 of 2)')).toBeVisible({
    timeout: 60_000,
  });
  await shot(other, 'refund-admin-step-1440');
  await other.getByRole('button', { name: 'Approve' }).click();
  const decide = other.getByRole('dialog');
  await decide.getByLabel('Note').fill('Checked the photos');
  const pay = decide.getByRole('button', { name: 'Approve ₦2,500.00' });
  await expect(pay).toBeDisabled();
  await decide.getByLabel(/Type APPROVE/).fill('APPROVE');
  await pay.click();
  await expect(other.getByText('Partly refunded').first()).toBeVisible();
  await expect(other.getByText('+₦2,500.00')).toBeVisible();
  await shot(other, 'full-page-1440');
  // The first person's screen shows it without a reload.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.locator('.lv-inv-drawer').getByText('Refunded to wallet'),
  ).toBeVisible({ timeout: 90_000 });
  expect([...problems, ...manager, ...more]).toEqual([]);
  await context.close();
});

test('adds a note, keeps typing through refreshes and fits every width', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const problems = await open(page, '/orders/invoices');
  await expect(codes(page)).toHaveCount(16, { timeout: 60_000 });
  const number = (await codes(page).nth(2).textContent()) ?? '';
  await codes(page).nth(2).click();
  await page.getByRole('button', { name: 'Open full page' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/invoices/${number}$`));
  await page.getByLabel('More actions').click();
  await page.getByRole('button', { name: 'Add note' }).click();
  const dialog = page.getByRole('dialog');
  const note = dialog.getByLabel('Internal note');
  await note.fill('Buyer will come on Saturday');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('giddydeal:staff-refresh'));
  });
  await page.waitForTimeout(1500);
  await expect(note).toHaveValue('Buyer will come on Saturday');
  await dialog.getByRole('button', { name: 'Add note' }).click();
  await page.getByRole('button', { name: /^Notes/ }).click();
  await expect(page.getByText('Buyer will come on Saturday')).toBeVisible();
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => wide(page)).toEqual([]);
    await shot(page, `full-page-${width}`);
  }
  await page.goBack();
  await page.getByRole('button', { name: 'Close invoice' }).click();
  await expect(codes(page)).toHaveCount(16);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => wide(page)).toEqual([]);
    await shot(page, `list-${width}`);
  }
  expect(problems).toEqual([]);
});

test('saves company details and hides money from the pickup desk', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const problems = await open(page, '/?section=finance&tab=company');
  const phone = page.getByLabel(/phone/i);
  await phone.fill('0800 000 0000');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.locator('.lv-setup-toast')).toContainText('aved');
  await shot(page, 'company-1280');
  await page.reload();
  await expect(phone).toHaveValue('0800 000 0000');

  const list = await fetch(`${api}/admin/invoices`, {
    headers: {
      authorization: `Bearer ${sessions.admin.token}`,
      'x-device-id': sessions.admin.device,
    },
  });
  const { items } = (await list.json()) as { items: { number: string }[] };
  const context = await browser.newContext();
  const desk = await context.newPage();
  const path = `/orders/invoices/${items[0]?.number}`;
  const more = await open(desk, path, 'warehouse');
  await expect(
    desk.getByRole('heading', { name: items[0]?.number }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(desk.locator('main')).not.toContainText('₦');
  expect([...problems, ...more]).toEqual([]);
  await context.close();
});
