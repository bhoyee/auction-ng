import { test, expect, type Page, type Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { suggestLocationCode } from '../../packages/shared/src/lot-setup';

// Lot setup end to end against an in-memory fake of the Lot setup API.
// Synthetic Nigerian demo data only.
const staffUrl = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const now = () => new Date().toISOString();

type Category = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  icon: string;
  description: string | null;
  sortOrder: number;
  isVisible: boolean;
  runTime: number | null;
  minStart: number | null;
  minPhotos: number | null;
  conditions: string[] | null;
  fields: Record<string, unknown>[] | null;
  updatedAt: string;
};
type Location = {
  id: string;
  name: string;
  code: string;
  address: string;
  body: Record<string, unknown>;
  updatedAt: string;
};
type Bin = {
  id: string;
  locationId: string;
  code: string;
  note: string | null;
};

function fake() {
  const deletions: Record<string, string>[] = [];
  const categories: Category[] = [
    {
      id: randomUUID(),
      parentId: null,
      name: 'Phones',
      slug: 'phones',
      icon: 'smartphone',
      description: 'Smartphones, tablets and accessories.',
      sortOrder: 1,
      isVisible: true,
      runTime: 1440,
      minStart: 100000,
      minPhotos: 4,
      conditions: ['new', 'like_new', 'open_box', 'damaged'],
      fields: [],
      updatedAt: now(),
    },
  ];
  const locations: Location[] = [
    {
      id: randomUUID(),
      name: 'Ikeja hub',
      code: 'IKJ',
      address: '14 Oba Akran Avenue, Ikeja, Lagos',
      body: {},
      updatedAt: now(),
    },
  ];
  const bins: Bin[] = [];
  const printed: string[][] = [];
  const hours = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'holiday',
  ].map((day) => ({
    day,
    opens: ['sunday', 'holiday'].includes(day) ? null : '09:00',
    closes: ['sunday', 'holiday'].includes(day) ? null : '18:00',
  }));
  const fieldsWithIds = (f: Record<string, unknown>[] | null) =>
    f?.map((x) => ({ id: randomUUID(), helpText: null, ...x })) ?? null;
  const categoryDetail = (c: Category) => ({
    id: c.id,
    parentId: c.parentId,
    parentName: null,
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    description: c.description,
    isVisible: c.isVisible,
    updatedAt: c.updatedAt,
    editedBy: null,
    subcategories: 0,
    defaults: {
      runTimeMinutes: c.runTime,
      minStartPriceKobo: c.minStart,
      minPhotos: c.minPhotos,
    },
    conditions: c.conditions,
    fields: c.fields,
    effective: {
      runTimeMinutes: c.runTime,
      minStartPriceKobo: c.minStart,
      minPhotos: c.minPhotos,
      conditions: c.conditions ?? [],
      fields: c.fields ?? [],
    },
    stats: {
      liveLots: 0,
      sellThroughPercent: null,
      averageRetailPercent: null,
    },
    lots: 0,
    deleteCheck: { allowed: true },
    canManage: true,
  });
  const locationDetail = (l: Location) => ({
    id: l.id,
    name: l.name,
    code: l.code,
    address: l.address,
    landmark: null,
    phone: null,
    lat: null,
    lng: null,
    status: 'open',
    opensOn: null,
    freeWorkingDays: 5,
    storageFeeKoboPerDay: 100000,
    slotMinutes: 30,
    slotCapacity: 40,
    idRequired: true,
    deliveryEnabled: false,
    binRequiredToPublish: false,
    hours,
    usedOnLots: 0,
    createdAt: l.updatedAt,
    updatedAt: l.updatedAt,
    bins: {
      total: bins.filter((b) => b.locationId === l.id).length,
      inUse: 0,
      lotsStored: 0,
      preview: bins
        .filter((b) => b.locationId === l.id)
        .slice(0, 6)
        .map((b) => ({ code: b.code, lots: 0 })),
    },
    staff: [],
    deleteCheck: { allowed: true },
    canManage: true,
  });
  async function handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    const json = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(value),
      });
    if (path === '/auth/refresh' || path === '/auth/staff/refresh')
      return json({
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id: '00000000-0000-4000-8000-0000000000aa',
          name: 'Olumide Sanni',
          role: 'manager',
          status: 'active',
          email: 'olumide.sanni@lotvanta.example',
          emailVerified: true,
          phone: null,
          phoneVerified: false,
          twoFactorEnabled: false,
        },
      });
    if (path === '/staff/me')
      return json({
        name: 'Olumide Sanni',
        roleName: 'Ops manager',
        permissions: [
          'inventory.read',
          'inventory.write',
          'setup.manage',
          'setup.read',
        ],
      });
    if (path === '/staff/preferences')
      return json({ compactTables: false, reduceMotion: false });
    if (path === '/staff/notifications')
      return json({ items: [], nextCursor: null, unreadCount: 0 });
    if (path === '/staff/activity')
      return json({ id: randomUUID(), message: 'Ok' });
    const setup = '/admin/lot-setup/';
    if (!path.startsWith(setup)) return json({ items: [], nextCursor: null });
    const rest = path.slice(setup.length);
    if (rest === 'summary')
      return json({
        categories: categories.length,
        locations: locations.length,
        conditions: 5,
        suppliers: 0,
        brands: 0,
        canManage: true,
      });
    if (rest === 'categories' && request.method() === 'GET')
      return json({
        canManage: true,
        items: categories.map((c) => ({
          id: c.id,
          parentId: c.parentId,
          name: c.name,
          slug: c.slug,
          icon: c.icon,
          sortOrder: c.sortOrder,
          isVisible: c.isVisible,
          lots: 0,
          live: 0,
        })),
      });
    if (rest === 'deletions')
      return json({ items: deletions, nextCursor: null });
    if (rest === 'categories/delete') {
      const i = categories.findIndex((x) => x.id === body.id);
      const [gone] = i >= 0 ? categories.splice(i, 1) : [];
      if (!gone) return json({}, 404);
      deletions.unshift({
        id: randomUUID(),
        kind: 'category',
        itemId: gone.id,
        name: gone.name,
        deletedBy: 'Adaeze Okafor',
        deletedAt: now(),
      });
      return json({ id: gone.id, message: `${gone.name} deleted.` });
    }
    if (rest.startsWith('categories/') && request.method() === 'GET') {
      const c = categories.find((x) => x.id === rest.split('/')[1]);
      return c ? json(categoryDetail(c)) : json({}, 404);
    }
    if (rest === 'categories') {
      const id = (body.id as string) ?? randomUUID();
      const next: Category = {
        id,
        parentId: (body.parentId as string) ?? null,
        name: body.name as string,
        slug: body.slug as string,
        icon: body.icon as string,
        description: (body.description as string) || null,
        sortOrder: categories.length + 1,
        isVisible: true,
        runTime: (body.defaultRunTimeMinutes as number) ?? null,
        minStart: (body.minStartPriceKobo as number) ?? null,
        minPhotos: (body.minPhotos as number) ?? null,
        conditions: (body.conditions as string[]) ?? null,
        fields: fieldsWithIds(body.fields as Record<string, unknown>[] | null),
        updatedAt: now(),
      };
      const i = categories.findIndex((x) => x.id === id);
      if (i >= 0) categories[i] = next;
      else categories.push(next);
      return json({ id, message: `${next.name} saved.` });
    }
    if (rest === 'locations' && request.method() === 'GET')
      return json({
        canManage: true,
        // The seeded hub has bin limits set; new hubs start without any.
        items: locations.map((l, index) => ({
          id: l.id,
          name: l.name,
          code: l.code,
          address: l.address,
          status: 'open',
          opensOn: null,
          lotsHere: index === 0 ? 7 : 0,
          pickupsToday: 0,
          binsUsedPercent: index === 0 ? 73 : 0,
          itemsStored: index === 0 ? 7 : 0,
          capacityTotal: index === 0 ? 10 : 0,
          spaceUsedPercent: index === 0 ? 70 : null,
        })),
      });
    if (/^locations\/[^/]+$/.test(rest) && request.method() === 'GET') {
      const l = locations.find((x) => x.id === rest.split('/')[1]);
      return l ? json(locationDetail(l)) : json({}, 404);
    }
    if (rest === 'locations') {
      const id = randomUUID();
      locations.push({
        id,
        name: body.name as string,
        // Like the real API: generated from the name, unique.
        code:
          locations.find((l) => l.id === body.id)?.code ??
          suggestLocationCode(
            body.name as string,
            new Set(locations.map((l) => l.code)),
          ),
        address: body.address as string,
        body,
        updatedAt: now(),
      });
      return json({ id, message: `${body.name as string} saved.` });
    }
    if (/^locations\/[^/]+\/bins$/.test(rest)) {
      const locationId = rest.split('/')[1] ?? '';
      const l = locations.find((x) => x.id === locationId);
      const here = bins.filter((b) => b.locationId === locationId);
      return json({
        location: {
          id: locationId,
          name: l?.name ?? '',
          code: l?.code ?? '',
          binRequiredToPublish: false,
          updatedAt: l?.updatedAt ?? now(),
        },
        summary: {
          bins: here.length,
          openForNewLots: here.length,
          lotsInBins: 0,
          lotsAtLocation: 0,
          lotsWithoutBin: 0,
        },
        counts: { all: here.length, in_use: 0, empty: here.length, closed: 0 },
        existingCodes: here.map((b) => b.code),
        items: here.map((b) => ({
          id: b.id,
          code: b.code,
          note: b.note,
          capacity: null,
          acceptsNewLots: true,
          lots: 0,
          full: false,
          status: 'empty',
          updatedAt: now(),
          deleteCheck: { allowed: true },
        })),
        nextCursor: null,
        canManage: true,
      });
    }
    if (/^locations\/[^/]+\/bin-labels$/.test(rest)) {
      const locationId = rest.split('/')[1] ?? '';
      const l = locations.find((x) => x.id === locationId);
      const ids = url.searchParams.get('ids')?.split(',');
      const items = bins
        .filter(
          (b) => b.locationId === locationId && (!ids || ids.includes(b.id)),
        )
        .map((b) => ({
          id: b.id,
          code: b.code,
          note: b.note,
          locationCode: l?.code ?? '',
          locationName: l?.name ?? '',
          qr: `LVBIN:${l?.code ?? ''}:${b.code}:${b.id}`,
        }));
      if (ids) printed.push(items.map((i) => i.code));
      return json({ items });
    }
    if (rest === 'bins/batch') {
      const from = body.from as number;
      const to = body.to as number;
      const codes = Array.from(
        { length: to - from + 1 },
        (_, i) =>
          `${body.prefix as string}${String(from + i).padStart(2, '0')}`,
      );
      for (const code of codes)
        bins.push({
          id: randomUUID(),
          locationId: body.locationId as string,
          code,
          note: (body.note as string) || null,
        });
      return json({
        id: bins.at(-1)?.id,
        message: `Added ${codes.length} bins: ${codes[0]} to ${codes.at(-1)}.`,
      });
    }
    if (rest === 'options')
      return json({
        categories: categories.map((c) => ({
          id: c.id,
          parentId: c.parentId,
          name: c.name,
          path: c.name,
          runTimeMinutes: c.runTime,
          minStartPriceKobo: c.minStart,
          minPhotos: c.minPhotos,
          conditions: c.conditions ?? ['new'],
          fields: c.fields ?? [],
        })),
        locations: locations.map((l) => ({
          id: l.id,
          name: l.name,
          code: l.code,
          binRequiredToPublish: false,
          bins: bins
            .filter((b) => b.locationId === l.id)
            .map((b) => ({
              id: b.id,
              code: b.code,
              full: false,
              held: 0,
              capacity: null,
            })),
        })),
        brands: [],
      });
    return json({ items: [], nextCursor: null, canManage: true });
  }
  return { handle, printed };
}

async function open(page: Page) {
  const api = fake();
  await page.addInitScript(() => {
    (window as unknown as { printCalls: number }).printCalls = 0;
    window.print = () => {
      (window as unknown as { printCalls: number }).printCalls++;
    };
  });
  await page.route(/http:\/\/localhost:(4000|4400)\//, (route) =>
    api.handle(route),
  );
  return api;
}

test('creates a category with fields, a location with five bins, prints labels and offers both on Create lot', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const api = await open(page);
  await page.goto(staffUrl + '/?section=lot-setup&tab=categories');
  await expect(
    page.getByRole('heading', { name: 'Categories', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Lot setup sections' }),
  ).toContainText('Categories1');

  // 1. Category with two custom fields
  await page.getByRole('button', { name: 'New category' }).first().click();
  await page.getByLabel('Name', { exact: true }).fill('Small appliances');
  await expect(page.getByLabel('Web address')).toHaveValue('small-appliances');
  for (const [name, type] of [
    ['Model', 'Short text'],
    ['Wattage', 'Number'],
  ] as const) {
    await page.getByRole('button', { name: '+ Add field' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Field name').fill(name);
    await dialog.getByLabel('Type').selectOption({ label: type });
    await dialog.getByRole('button', { name: 'Add field' }).click();
  }
  await expect(
    page.getByRole('cell', { name: 'Wattage', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create category' }).click();
  await expect(page.getByText('Small appliances saved.')).toBeVisible();

  // 2. Location
  await page
    .getByRole('navigation', { name: 'Lot setup sections' })
    .getByRole('button', { name: /Pickup locations/ })
    .click();
  await page.getByRole('button', { name: 'New location' }).first().click();
  await page.getByLabel('Name buyers see').fill('Yaba hub');
  await expect(page.getByLabel('Short code')).toHaveValue(
    'Set automatically when you save',
  );
  await expect(page.getByLabel('Latitude')).toHaveCount(0);
  await expect(page.getByLabel('Slot length')).toHaveCount(0);
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.screenshot({
      path: testInfo.outputPath(`location-form-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByLabel('Address').fill('21 Herbert Macaulay Way, Yaba, Lagos');
  await page.getByRole('button', { name: 'Create location' }).click();
  await expect(page.getByText('Yaba hub saved.')).toBeVisible();

  // 3. Five bins at once, then print their labels
  await page.getByRole('button', { name: 'Manage bins' }).click();
  await expect(
    page.getByRole('heading', { name: 'Bins · Yaba hub' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Several at once' }).click();
  await page.getByLabel('Start of name').fill('S-');
  await page.getByLabel('Numbers').fill('6');
  await page.getByLabel('To', { exact: true }).fill('10');
  await expect(
    page.getByRole('status').filter({ hasText: 'Adds 5 bins' }),
  ).toContainText('S-10');
  await page.getByRole('button', { name: 'Add 5 bins' }).click();
  await expect(page.getByText('Added 5 bins: S-06 to S-10.')).toBeVisible();
  await expect(page.locator('.lv-setup-bin-code')).toHaveText([
    'S-06',
    'S-07',
    'S-08',
    'S-09',
    'S-10',
  ]);
  await expect
    .poll(() => api.printed.at(-1))
    .toEqual(['S-06', 'S-07', 'S-08', 'S-09', 'S-10']);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { printCalls: number }).printCalls,
      ),
    )
    .toBeGreaterThan(0);

  // 4. Both appear on the Create lot form
  await page.goto(staffUrl + '/?section=inventory');
  await page.getByRole('button', { name: 'Add item' }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByLabel('Category')).toContainText('Small appliances');
  await expect(form.getByLabel('Pickup centre')).toContainText(
    'Yaba hub · YHU',
  );
  await form
    .getByLabel('Pickup centre')
    .selectOption({ label: 'Yaba hub · YHU' });
  await expect(form.getByLabel('Bin')).toContainText('S-06');
  await form.getByLabel('Category').selectOption({ label: 'Small appliances' });
  await expect(form.getByLabel('Wattage (optional)')).toBeVisible();
});

test('deletes a category only after typing DELETE and lists who deleted it and when', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await page.goto(staffUrl + '/?section=lot-setup&tab=categories');
  await page.locator('.lv-setup-tree-main', { hasText: 'Phones' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Delete category?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Phones will be permanently deleted.');
  const confirm = dialog.getByRole('button', { name: 'Delete category' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Type DELETE to confirm').fill('delet');
  await expect(confirm).toBeDisabled();
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: testInfo.outputPath(`delete-confirm-${width}.png`),
    });
  }
  // Cancelling leaves the category in place.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.locator('.lv-setup-tree-main', { hasText: 'Phones' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await dialog.getByLabel('Type DELETE to confirm').fill('delete');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(
    page.locator('.lv-setup-tree-main', { hasText: 'Phones' }),
  ).toHaveCount(0);

  await page
    .getByRole('navigation', { name: 'Lot setup sections' })
    .getByRole('button', { name: 'Deleted items' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Deleted items', level: 1 }),
  ).toBeVisible();
  const row = page.getByRole('row', { name: /Phones/ });
  await expect(row).toContainText('Category');
  await expect(row).toContainText('Adaeze Okafor');
  await expect(row).toContainText('WAT');
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: testInfo.outputPath(`deleted-items-${width}.png`),
    });
  }
});

test('location cards show bins in use and space used against bin limits', async ({
  page,
}, testInfo) => {
  await open(page);
  await page.goto(staffUrl + '/?section=lot-setup&tab=locations');
  const card = page.locator('.lv-setup-location').first();
  await expect(card).toContainText('Bins in use');
  await expect(card).toContainText('73%');
  await expect(card).toContainText('Space used');
  await expect(card).toContainText('70%');
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: testInfo.outputPath(`location-cards-${width}.png`),
    });
  }
});
