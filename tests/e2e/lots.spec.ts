import { test, expect, type Page, type Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  allowedLotActions,
  lotDeleteRule,
  lotEditLocks,
  lotEditorSchema,
  lotListPageSchema,
  lotViewSchema,
  lotCsvHeaders,
  validateLotCsv,
  type LotForm,
  type LotStage,
} from '../../packages/shared/src/index';

// Lots inventory end to end (T15e) against an in-memory fake of the Lots API
// that applies the real shared rules (delete, locks, CSV). Synthetic Nigerian
// demo data only.
const staffUrl = process.env.STAFF_BROWSER_URL ?? 'http://localhost:3301';
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const ADMIN = '00000000-0000-4000-8000-0000000000aa';
const PERMISSIONS = [
  'dashboard.view',
  'pickup.manage',
  'inventory.read',
  'inventory.write',
  'records.archive',
  'records.purge',
  'lots.delete',
  'lots.relist',
  'auctions.manage',
  'setup.read',
];
// A 1×1 PNG for photo uploads and fake image responses.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

type Photo = {
  id: string;
  url: string;
  thumbnailUrl: string;
  sortOrder: number;
  isDefect: boolean;
};
type Lot = LotForm & {
  id: string;
  lotNumber: string;
  stage: LotStage;
  archived: boolean;
  deletedAt: string | null;
  deleteReason: string | null;
  bids: number;
  watching: number;
  photos: Photo[];
  createdAt: string;
  updatedAt: string;
  startsAt: string;
  endsAt: string;
  comingSoon?: boolean;
  isTopDeal?: boolean;
  topDealOrder?: number;
};

const category = {
  id: '0b6b6f2e-6a0e-4b2a-9b7a-1b2c3d4e5f60',
  parentId: null,
  name: 'Phones',
  path: 'Phones',
  runTimeMinutes: 1440,
  minStartPriceKobo: 100_000,
  minPhotos: 2,
  conditions: ['new', 'like_new', 'open_box', 'damaged'],
  fields: [
    {
      id: randomUUID(),
      name: 'Storage',
      key: 'storage',
      type: 'list' as const,
      options: ['128GB', '256GB'],
      helpText: null,
      required: true,
      showToBuyers: true,
    },
  ],
};
const location = {
  id: '1b6b6f2e-6a0e-4b2a-9b7a-1b2c3d4e5f60',
  name: 'Ikeja hub',
  code: 'IKJ',
  binRequiredToPublish: false,
  bins: [
    {
      id: '2b6b6f2e-6a0e-4b2a-9b7a-1b2c3d4e5f60',
      code: 'S-01',
      full: false,
      held: 3,
      capacity: 20,
    },
  ],
};

function fake() {
  const sent: Record<string, unknown>[] = [];
  const scheduled: Record<string, unknown>[] = [];
  const lots = new Map<string, Lot>();
  let seq = 20400;
  const nextNumber = () => `LOT-E2E${++seq}`;
  const base = (over: Partial<Lot>): Lot => ({
    id: randomUUID(),
    lotNumber: nextNumber(),
    title: 'Tecno Camon 30, 256GB',
    description: 'Returned to seller unused. Powers on and was reset.',
    condition: 'open_box',
    categoryId: category.id,
    locationId: location.id,
    binId: location.bins[0]?.id ?? null,
    brandId: null,
    supplierId: null,
    startPriceKobo: 500_000,
    retailPriceKobo: 21_500_000,
    runTimeMinutes: 1440,
    details: { storage: '256GB' },
    included: ['Phone', 'Charger'],
    defects: [],
    stage: 'draft',
    archived: false,
    deletedAt: null,
    deleteReason: null,
    bids: 0,
    watching: 0,
    photos: [],
    createdAt: iso(),
    updatedAt: iso(),
    startsAt: iso(),
    endsAt: iso(Date.now() + 86_400_000),
    ...over,
  });
  // A live lot with bids, for the "can't be deleted" dialog.
  const live = base({
    title: 'HP 15 laptop, Core i5, 8GB RAM',
    stage: 'live',
    bids: 31,
    watching: 214,
    startsAt: iso(Date.now() - 3_600_000),
    endsAt: iso(Date.now() + 38 * 60_000),
  });
  lots.set(live.id, live);
  /** Add a draft for a test. */
  const addDraft = (over: Partial<Lot> = {}) => {
    const lot = base(over);
    lots.set(lot.id, lot);
    return lot;
  };

  const hasBids = (l: Lot) => l.bids > 0;
  const actions = (l: Lot) =>
    allowedLotActions({
      stage: l.stage,
      hasBids: hasBids(l),
      archived: l.archived,
      deleted: !!l.deletedAt,
      deletedAt: l.deletedAt ? new Date(l.deletedAt) : null,
      now: new Date(),
      isCreator: true,
      permissions: PERMISSIONS,
    });
  const editor = (l: Lot) =>
    lotEditorSchema.parse({
      id: l.id,
      lotNumber: l.lotNumber,
      stage: l.stage,
      archived: l.archived,
      lot: form(l),
      photos: l.photos,
      hasBids: hasBids(l),
      locks: lotEditLocks({ stage: l.stage, hasBids: hasBids(l) }),
      comingSoon: !!l.comingSoon,
      isTopDeal: !!l.isTopDeal,
      topDealOrder: l.topDealOrder ?? 0,
      updatedAt: l.updatedAt,
    });
  const form = (l: Lot): LotForm => ({
    title: l.title,
    description: l.description,
    condition: l.condition,
    categoryId: l.categoryId,
    locationId: l.locationId,
    binId: l.binId,
    brandId: l.brandId,
    supplierId: l.supplierId,
    startPriceKobo: l.startPriceKobo,
    retailPriceKobo: l.retailPriceKobo,
    runTimeMinutes: l.runTimeMinutes,
    details: l.details,
    included: l.included,
    defects: l.defects,
  });
  const row = (l: Lot) => ({
    id: l.id,
    lotNumber: l.lotNumber,
    title: l.title,
    thumbnailUrl: l.photos[0]?.thumbnailUrl ?? null,
    categoryName: category.name,
    categoryIcon: 'smartphone',
    condition: l.condition,
    locationName: location.name,
    locationCode: location.code,
    binCode: location.bins.find((b) => b.id === l.binId)?.code ?? null,
    stage: l.stage,
    archived: l.archived,
    deleted: !!l.deletedAt,
    deletedAt: l.deletedAt,
    deleteReason: l.deleteReason,
    startsAt: l.startsAt,
    endsAt: l.endsAt,
    runTimeMinutes: l.runTimeMinutes,
    startPriceKobo: l.startPriceKobo,
    currentPriceKobo: l.bids ? 8_600_000 : null,
    retailPriceKobo: l.retailPriceKobo,
    bids: l.bids,
    watching: l.watching,
    photos: l.photos.length,
    photosNeeded: Math.max(0, category.minPhotos - l.photos.length),
    winnerName: null,
    addedBy: { id: ADMIN, name: 'Halima Bello' },
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    hasBids: hasBids(l),
    actions: actions(l),
  });
  const inTab = (l: Lot, tab: string) =>
    tab === 'deleted'
      ? !!l.deletedAt
      : !l.deletedAt &&
        (tab === 'archived'
          ? l.archived
          : !l.archived &&
            (tab === 'all' ||
              (tab === 'drafts' && l.stage === 'draft') ||
              (tab === 'live' && l.stage === 'live') ||
              (tab === 'ending' && l.stage === 'live') ||
              tab === l.stage));
  const touch = (l: Lot) => {
    l.updatedAt = new Date(
      Math.max(Date.now(), Date.parse(l.updatedAt) + 1),
    ).toISOString();
  };

  async function handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = (
      method === 'GET' || method === 'PUT' ? {} : (request.postDataJSON() ?? {})
    ) as Record<string, unknown>;
    const json = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(value),
      });
    const field = (f: string, message: string, status = 409) =>
      json(
        { statusCode: status, code: 'FIELD_ERROR', field: f, message },
        status,
      );
    if (path.startsWith('/fake-image/'))
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: PNG,
      });
    if (path.startsWith('/fake-upload/'))
      return route.fulfill({ status: 200, body: '' });
    if (path === '/auth/staff/refresh')
      return json({
        accessToken: 'x'.repeat(43),
        expiresInSeconds: 900,
        user: {
          id: ADMIN,
          name: 'Olumide Sanni',
          role: 'admin',
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
        roleName: 'Admin',
        permissions: PERMISSIONS,
      });
    if (path === '/staff/preferences')
      return json({ compactTables: false, reduceMotion: false });
    if (path === '/staff/notifications')
      return json({
        items: [],
        nextCursor: null,
        unreadCount: 0,
        serverTime: iso(),
        emailMode: 'preview',
      });
    if (path === '/staff/activity')
      return json({ id: randomUUID(), message: 'Recorded.' });
    if (path === '/admin/unsold/count') return json({ count: 0 });
    if (path === '/staff/analytics/overview/attention')
      return json({
        widget: 'attention',
        mode: 'aggregate',
        updatedAt: iso(),
        data: {
          rows: [
            {
              label: 'Overdue pickups',
              value: 3,
              tone: 'danger',
              destination: 'pickup',
            },
            {
              label: 'Items to prepare for pickup',
              value: 5,
              tone: 'warning',
              destination: 'pickup',
            },
          ],
        },
      });
    if (path === '/staff/live-monitor/message') {
      sent.push(body);
      return json({
        id: String(body.idempotencyKey),
        message: 'Message queued for bidders and watchers.',
      });
    }
    if (path === '/admin/lot-setup/options')
      return json({
        categories: [
          category,
          {
            ...category,
            id: '0b6b6f2e-6a0e-4b2a-9b7a-1b2c3d4e5f61',
            parentId: category.id,
            name: 'Android phones',
            path: 'Phones › Android phones',
          },
        ],
        locations: [location],
        brands: [
          { id: randomUUID(), name: 'Tecno', categoryIds: [] },
          // Linked to the main category only: still offered for a subcategory.
          { id: randomUUID(), name: 'Samsung', categoryIds: [category.id] },
        ],
        suppliers: [{ id: randomUUID(), name: 'Konga returns' }],
      });
    if (path === '/admin/lot-setup/staff-options')
      return json({
        items: [{ id: ADMIN, name: 'Halima Bello', roleName: 'Intake' }],
      });

    // Top deals (catalogue API).
    const topDeal = /^\/admin\/lots\/([^/]+)\/top-deal$/.exec(path);
    if (topDeal) {
      const lot = lots.get(topDeal[1] ?? '');
      if (!lot) return json({}, 404);
      lot.isTopDeal = body.isTopDeal as boolean;
      lot.topDealOrder = body.topDealOrder as number;
      touch(lot);
      // The API answers with the lot as Top deals curation shows it.
      return json({
        id: lot.id,
        title: lot.title,
        categoryId: lot.categoryId,
        locationId: lot.locationId,
        condition: lot.condition,
        status: 'draft',
        startPriceKobo: lot.startPriceKobo,
        currentPriceKobo: null,
        startsAt: lot.startsAt,
        endsAt: lot.endsAt,
        fixedPriceKobo: null,
        isTopDeal: lot.isTopDeal,
        comingSoon: !!lot.comingSoon,
        topDealOrder: lot.topDealOrder,
        createdAt: lot.createdAt,
        lotNumber: lot.lotNumber,
        retailPriceKobo: lot.retailPriceKobo,
        category: {
          id: category.id,
          name: category.name,
          slug: 'phones',
          parentId: null,
        },
        location: { id: location.id, name: location.name, code: location.code },
        thumbnail: null,
        priceSource: 'unavailable',
        autoRelistEnabled: false,
        autoRelistCount: 0,
        updatedAt: lot.updatedAt,
      });
    }

    // Publish from the lot form (the audited scheduling step).
    const schedule = /^\/admin\/lots\/([^/]+)\/schedule$/.exec(path);
    if (schedule) {
      const lot = lots.get(schedule[1] ?? '');
      if (!lot) return json({}, 404);
      scheduled.push({ lotId: lot.id, ...body });
      lot.stage = 'scheduled';
      touch(lot);
      return json({
        lotId: lot.id,
        status: 'scheduled',
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        updatedAt: iso(),
      });
    }

    // Photo uploads (catalogue API).
    const upload =
      /^\/admin\/lots\/([^/]+)\/images\/uploads(?:\/([^/]+)\/complete)?$/.exec(
        path,
      );
    if (upload) {
      const lot = lots.get(upload[1] ?? '');
      if (!lot) return json({}, 404);
      if (!upload[2])
        return json({
          uploadId: randomUUID(),
          uploadUrl: `http://localhost:4000/fake-upload/${randomUUID()}`,
          expiresAt: iso(Date.now() + 300_000),
          headers: {
            'Content-Type': 'image/webp',
            'x-amz-meta-sha256': 'a'.repeat(64),
          },
        });
      const id = randomUUID();
      const photo = {
        id,
        url: `http://localhost:4000/fake-image/${id}.png`,
        thumbnailUrl: `http://localhost:4000/fake-image/${id}.png`,
        sortOrder: lot.photos.length,
        isDefect: false,
      };
      lot.photos.push(photo);
      touch(lot);
      return json({
        id,
        url: photo.url,
        thumbnailUrl: photo.thumbnailUrl,
        sortOrder: photo.sortOrder,
        width: 960,
        height: 960,
        thumbnailBytes: 900,
      });
    }

    if (!path.startsWith('/admin/inventory/'))
      return json({ items: [], nextCursor: null });
    const rest = path.slice('/admin/inventory/'.length);
    if (rest === 'setup')
      return json({
        views: [],
        preferences: { hiddenColumns: [], layout: 'table' },
      });
    if (rest === 'preferences') return json(body);
    if (rest === 'lots' && method === 'GET') {
      const tab = url.searchParams.get('tab') ?? 'all';
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const all = [...lots.values()];
      const matches = (l: Lot) =>
        !search ||
        l.title.toLowerCase().includes(search) ||
        l.lotNumber.toLowerCase().includes(search);
      const counts = Object.fromEntries(
        [
          'all',
          'drafts',
          'scheduled',
          'live',
          'ending',
          'sold',
          'unsold',
          'archived',
          'deleted',
        ].map((t) => [t, all.filter((l) => matches(l) && inTab(l, t)).length]),
      );
      const items = all.filter((l) => matches(l) && inTab(l, tab)).map(row);
      return json(
        lotListPageSchema.parse({
          items,
          counts,
          summary: {
            inStock: counts.all,
            inStockRetailKobo: 41_000_000,
            live: counts.live,
            endingIn24h: counts.ending,
            drafts: counts.drafts,
            oldestDraftAt: counts.drafts ? iso() : null,
            sold30d: 902,
            sold30dHammerKobo: 6_180_000_000,
            sold30dRetailKobo: 16_260_000_000,
            unsoldToRelist: 228,
            ended30d: 5_180,
            unsold30d: 228,
          },
          total: items.length,
          nextCursor: null,
          serverTime: iso(),
          canCreate: true,
          canSeeDeleted: true,
        }),
      );
    }
    if (rest === 'lots' && method === 'POST') {
      const lot = base({ ...(body.lot as LotForm), photos: [] });
      lots.set(lot.id, lot);
      return json(editor(lot));
    }
    if (rest === 'csv-template')
      return json({
        filename: 'lots-template-phones.csv',
        csv: lotCsvHeaders(category.fields).join(',') + '\n',
      });
    if (rest === 'csv-check' || rest === 'csv-import') {
      const result = validateLotCsv(String(body.csv), {
        categoryId: category.id,
        fields: category.fields,
        allowedConditions: category.conditions,
        locations: new Map([[location.code, location.id]]),
        bins: new Map(
          location.bins.map((b) => [`${location.id}:${b.code}`, b.id]),
        ),
        suppliers: new Map(),
        brands: new Map(),
      });
      if (rest === 'csv-check')
        return json({
          rows: result.rows,
          good: result.good.length,
          problems: result.problems,
        });
      const ids = result.good.map(({ lot }) => {
        const created = base({ ...lot });
        lots.set(created.id, created);
        return created.id;
      });
      return json({
        imported: ids.length,
        problems: result.problems.length,
        ids,
      });
    }
    if (rest === 'labels')
      return json({
        items: (body.ids as string[]).map((id) => {
          const l = lots.get(id);
          return {
            id,
            lotNumber: l?.lotNumber ?? 'LOT',
            title: l?.title ?? '',
            binCode: 'S-01',
            locationCode: location.code,
          };
        }),
      });
    const m = /^lots\/([^/]+)(?:\/(.+))?$/.exec(rest);
    const lot = m ? lots.get(m[1] ?? '') : undefined;
    if (!m || !lot) return json({ statusCode: 404 }, 404);
    const action = m[2];
    if (!action && method === 'GET')
      return json(
        lotViewSchema.parse({
          editor: editor(lot),
          categoryPath: 'Phones › Android phones',
          categoryFields: category.fields.map((f) => ({
            key: f.key,
            name: f.name,
            type: f.type,
          })),
          locationName: location.name,
          locationCode: location.code,
          binCode: location.bins.find((b) => b.id === lot.binId)?.code ?? null,
          brandName: null,
          supplierName: null,
          startsAt: lot.startsAt,
          endsAt: lot.endsAt,
          currentPriceKobo: lot.bids ? 8_600_000 : null,
          fixedPriceKobo: null,
          bids: lot.bids,
          watching: lot.watching,
          leader: lot.bids
            ? { name: 'Chinedu Okafor', pastWins: 6, strikes: 0 }
            : null,
          addedBy: { id: ADMIN, name: 'Halima Bello' },
          createdAt: lot.createdAt,
          deletedAt: lot.deletedAt,
          deleteReason: lot.deleteReason,
          journey: [
            {
              key: 'created',
              label: 'Created',
              detail: 'Halima Bello · Sat 7 Nov, 9:10am',
              state: 'done',
              at: lot.createdAt,
            },
            {
              key: 'scheduled',
              label: lot.stage === 'draft' ? 'Publish' : 'Published, 24 h',
              detail:
                lot.stage === 'draft' ? 'not published yet' : 'Olumide Sanni',
              state: lot.stage === 'draft' ? 'current' : 'done',
              at: null,
            },
            {
              key: 'live',
              label: lot.stage === 'live' ? `Live · ${lot.bids} bids` : 'Live',
              detail: 'may extend 2 min per late bid',
              state: lot.stage === 'live' ? 'current' : 'next',
              at: null,
            },
            {
              key: 'ended',
              label: 'Ends',
              detail: 'when the countdown reaches zero',
              state: 'next',
              at: null,
            },
            {
              key: 'pickup',
              label: 'Invoice and pickup',
              detail: 'after it ends · Ikeja hub, bin S-01',
              state: 'next',
              at: null,
            },
          ],
          actions: actions(lot),
          activityCount: 3,
          serverTime: iso(),
        }),
      );
    if (action === 'editor') return json(editor(lot));
    if (action === 'coming-soon' && method === 'POST') {
      lot.comingSoon = body.comingSoon as boolean;
      touch(lot);
      return json(editor(lot));
    }
    if (!action && method === 'PATCH') {
      Object.assign(lot, body.lot as LotForm);
      touch(lot);
      return json(editor(lot));
    }
    if (action === 'bids') {
      // Pages of 20, newest first, like the API.
      const from = Number(url.searchParams.get('cursor') ?? 0);
      const to = Math.min(from + 20, lot.bids);
      return json({
        items: Array.from({ length: Math.max(0, to - from) }, (_, i) => {
          const n = from + i;
          return {
            id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
            at: iso(),
            bidderName: n % 2 ? 'Bisi Adeyemi' : 'Chinedu Okafor',
            maskedName: n % 2 ? 'Bi***i' : 'Ch***a',
            amountKobo: 8_600_000 - n * 100_000,
            proxy: n % 2 === 0,
            leading: n === 0,
          };
        }),
        nextCursor: to < lot.bids ? String(to) : null,
      });
    }
    if (action === 'watchers' || action === 'activity')
      return json({ items: [], nextCursor: null });
    if (action === 'invoice')
      return json({
        invoiceNumber: null,
        invoiceStatus: null,
        hammerKobo: null,
        totalKobo: null,
        winnerName: null,
        pickupStatus: null,
        collectedAt: null,
      });
    if (action === 'photos') {
      const order = body.order as string[];
      const remove = body.remove as string[];
      lot.photos = order
        .filter((id) => !remove.includes(id))
        .map((id, i) => {
          const p = lot.photos.find((x) => x.id === id) as Photo;
          return {
            ...p,
            sortOrder: i,
            isDefect: (body.defects as string[]).includes(id),
          };
        });
      touch(lot);
      return json(editor(lot));
    }
    if (action === 'duplicate') {
      const copy = base({ ...form(lot), binId: null, photos: [] });
      lots.set(copy.id, copy);
      return json({ id: copy.id });
    }
    if (action === 'delete') {
      const rule = lotDeleteRule({
        stage: lot.stage,
        hasBids: hasBids(lot),
        deleted: !!lot.deletedAt,
        canDeleteAny: true,
        canDeleteOwnDrafts: true,
        isCreator: true,
      });
      if (!rule.allowed)
        return field(`delete.${rule.block.replace('-', '')}`, rule.reason);
      lot.deletedAt = iso();
      lot.deleteReason = String(body.reason);
      touch(lot);
      return json({
        id: lot.id,
        message: `${lot.lotNumber} moved to Deleted. An admin can restore it for 30 days.`,
      });
    }
    if (action === 'restore') {
      lot.deletedAt = null;
      lot.deleteReason = null;
      lot.stage = 'draft';
      touch(lot);
      return json({
        id: lot.id,
        message: `${lot.lotNumber} restored as a draft.`,
      });
    }
    if (action === 'archive' || action === 'unarchive') {
      lot.archived = action === 'archive';
      touch(lot);
      return json({
        id: lot.id,
        message: `${lot.lotNumber} ${lot.archived ? 'archived' : 'is back in the list'}.`,
      });
    }
    return json({ statusCode: 404 }, 404);
  }
  return { handle, lots, sent, scheduled, addDraft };
}

async function open(page: Page) {
  const api = fake();
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.route(/http:\/\/localhost:(4000|4001|4400)\//, (route) =>
    api.handle(route),
  );
  return api;
}

test('creates a lot with custom fields and photos, edits, duplicates, deletes the copy and restores it', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const api = await open(page);
  await page.goto(staffUrl + '/lots');
  await expect(
    page.getByRole('heading', { name: 'Lots', level: 1 }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create lot' }).click();
  await expect(page).toHaveURL(/\/lots\/new$/);

  // Create: category fields appear, photos wait for the first save.
  const form = page.locator('.lv-lot-form');
  await form
    .getByLabel('Title buyers will see')
    .fill('Kenwood stand mixer, 5L');
  await form.getByLabel('Category').selectOption({ label: 'Phones' });
  await expect(form.getByLabel('Storage')).toBeVisible();
  await form.getByLabel('Storage').selectOption('256GB');
  await form.getByRole('button', { name: /Open box/ }).click();
  await form
    .getByLabel('Description')
    .fill('Opened, works, bowl slightly scratched.');
  await form.getByLabel('Start price (₦)').fill('5000');
  await form.getByLabel('Retail estimate (₦)').fill('165000');
  await form
    .getByLabel('Pickup hub')
    .selectOption({ label: 'Ikeja hub · IKJ' });
  await form
    .getByLabel('Bin (optional)')
    .selectOption(location.bins[0]?.id ?? '');
  await form.locator('input[type=file]').setInputFiles([
    { name: 'front.png', mimeType: 'image/png', buffer: PNG },
    { name: 'back.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await expect(page.locator('.lv-lot-check')).toContainText(
    'Title and category set',
  );
  await page.screenshot({
    path: testInfo.outputPath('lot-new-1440.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save as draft' }).click();

  // View: the lot exists as a draft with its two photos.
  await expect(page).toHaveURL(/\/lots\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole('heading', { name: 'Kenwood stand mixer, 5L' }),
  ).toBeVisible();
  const created = [...api.lots.values()].find(
    (l) => l.title === 'Kenwood stand mixer, 5L',
  );
  expect(created?.photos).toHaveLength(2);
  expect(created?.details).toEqual({ storage: '256GB' });

  // It appears in Drafts.
  await page.getByRole('button', { name: 'Lots', exact: true }).first().click();
  await page.getByRole('tab', { name: /^Drafts/ }).click();
  await expect(page.locator('.lv-lots-table')).toContainText(
    'Kenwood stand mixer, 5L',
  );

  // Edit.
  await page.getByRole('button', { name: 'Kenwood stand mixer, 5L' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByLabel('Title buyers will see')
    .fill('Kenwood stand mixer, 5L, silver');
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(
    page.getByRole('heading', { name: 'Kenwood stand mixer, 5L, silver' }),
  ).toBeVisible();

  // Duplicate opens the copy's form; delete the copy from its page.
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByLabel('Title buyers will see')).toHaveValue(
    'Kenwood stand mixer, 5L, silver',
  );
  const copyId = page.url().split('/').at(-2) ?? '';
  expect(api.lots.get(copyId)?.photos).toEqual([]);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('It moves to Deleted');
  await dialog.getByRole('button', { name: 'Delete lot' }).click();
  await expect(page.getByText(/moved to Deleted/)).toBeVisible();

  // Restore it as admin from the Deleted tab.
  await page.getByRole('button', { name: 'Lots', exact: true }).first().click();
  await page.getByRole('tab', { name: /^Deleted/ }).click();
  await page
    .getByRole('button', { name: /More actions for/ })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Restore' }).click();
  await expect(page.getByText(/restored as a draft/)).toBeVisible();
  expect(api.lots.get(copyId)?.deletedAt).toBeNull();
});

test('refuses to delete a live lot with bids and links to the Live monitor', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await page.goto(staffUrl + '/lots');
  const row = page.locator('tr', { hasText: 'HP 15 laptop' });
  await expect(row).toContainText('Live');
  await page.screenshot({
    path: testInfo.outputPath('lots-1440.png'),
    fullPage: true,
  });
  await row.getByRole('button', { name: /More actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete lot' })
    .click();
  const blocked = page.getByRole('dialog');
  await expect(blocked).toContainText('can’t be deleted');
  await expect(blocked).toContainText('Cancel it in the Live monitor');
  await expect(
    blocked.getByRole('button', { name: 'Cancel in Live monitor' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('lot-delete-blocked.png'),
  });
  await blocked.getByRole('button', { name: 'Close', exact: true }).click();

  // The lot page shows the lock notice and the bid card.
  await row
    .getByRole('button', { name: 'HP 15 laptop, Core i5, 8GB RAM' })
    .click();
  await expect(page.getByRole('note')).toContainText(
    'price and run time are locked',
  );
  await expect(page.getByRole('region', { name: 'Current bid' })).toContainText(
    '₦86,000',
  );
  // 31 bids: the first rows show in a box that scrolls, the rest load on
  // scroll, and the Details card stays close below.
  const bids = page.getByRole('region', { name: 'Bids, scroll for more' });
  await expect(bids.locator('tbody tr')).toHaveCount(20);
  await expect(
    page.getByText('Showing 20 of 31 · scroll for more'),
  ).toBeVisible();
  const box = await bids.boundingBox();
  expect(box?.height ?? 0).toBeLessThanOrEqual(440);
  await bids.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(bids.locator('tbody tr')).toHaveCount(31);
  await expect(page.getByText('Showing 31 of 31')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Details', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('lot-view-1440.png'),
    fullPage: true,
  });
});

test('imports a 20-row CSV with 2 bad rows as 18 drafts', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const api = await open(page);
  await page.goto(staffUrl + '/lots');
  await page.getByRole('button', { name: 'Import CSV' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('1. Category').selectOption({ label: 'Phones' });
  const header = lotCsvHeaders(category.fields).join(',');
  const rows = Array.from({ length: 20 }, (_, i) =>
    i === 3
      ? ',No title,Open box,5000,215000,24,IKJ,,,,,,256GB'
      : i === 9
        ? `Tecno ${i},Works,Open box,5000,215000,24,IKJ,,,,,,512GB`
        : `Tecno Camon ${i},Works,Open box,"₦5,000",215000,24,IKJ,S-01,,,Phone|Charger,,256GB`,
  );
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'phones.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`${header}\n${rows.join('\n')}\n`),
  });
  await dialog.getByRole('button', { name: /Check the file/ }).click();
  await expect(dialog).toContainText('18 of 20 rows are ready to import');
  await expect(dialog.locator('tbody tr')).toHaveCount(2);
  await expect(dialog).toContainText('Add a title.');
  await page.screenshot({
    path: testInfo.outputPath('lots-import-report.png'),
  });
  await dialog.getByRole('button', { name: 'Import 18 good rows' }).click();
  await expect(
    page.getByText('18 lots imported as drafts; 2 rows skipped.'),
  ).toBeVisible();
  expect(
    [...api.lots.values()].filter((l) => l.title.startsWith('Tecno Camon')),
  ).toHaveLength(18);
});

for (const width of [360, 768]) {
  test(`lists lots without page overflow at ${width} px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await page.goto(staffUrl + '/lots');
    await expect(page.locator('tr', { hasText: 'HP 15 laptop' })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`lots-${width}.png`),
      fullPage: true,
    });
  });
}

test('messages bidders from the lot page and opens the Live monitor without reloading', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const api = await open(page);
  await page.goto(staffUrl + '/lots');
  await page
    .getByRole('button', { name: 'HP 15 laptop, Core i5, 8GB RAM' })
    .click();
  // A full reload would clear this marker (and renew the session from scratch).
  await page.evaluate(
    () => ((window as unknown as { stay: boolean }).stay = true),
  );
  await page
    .getByRole('button', { name: 'Message bidders and watchers' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('31 bids, 214 watching');
  await dialog.getByLabel('Message').fill('We added a photo of the charger.');
  await dialog
    .getByLabel('Reason (for the audit log)')
    .fill('Correcting what is included');
  await page.screenshot({ path: testInfo.outputPath('lot-message.png') });
  await dialog.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByText('Message queued for bidders and watchers.'),
  ).toBeVisible();
  expect(api.sent[0]).toMatchObject({
    operation: 'message',
    message: 'We added a photo of the charger.',
  });
  await page.getByRole('button', { name: 'Open in Live monitor' }).click();
  await expect(page).toHaveURL(/section=live-monitor&view=details&lot=/);
  expect(
    await page.evaluate(() => (window as unknown as { stay?: boolean }).stay),
  ).toBe(true);
});

for (const width of [1440, 360]) {
  test(`shows the staff sign-in with a password eye at ${width} px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route(/http:\/\/localhost:(4000|4001|4400)\//, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"statusCode":401}',
      }),
    );
    await page.goto(staffUrl + '/');
    await expect(
      page.getByRole('heading', { name: 'Staff sign in', exact: true }),
    ).toBeVisible();
    const password = page.locator('.agn-staff-sign-in input[name=password]');
    await password.fill('Secret pass 42');
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`staff-sign-in-${width}.png`),
      fullPage: true,
    });
  });
}

test('a signed-in refresh never flashes the sign-in page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const api = fake();
  await page.route(/http:\/\/localhost:(4000|4001|4400)\//, async (route) => {
    // A slow session check, as on a weak connection.
    if (new URL(route.request().url()).pathname === '/auth/staff/refresh')
      await new Promise((r) => setTimeout(r, 1500));
    return api.handle(route);
  });
  let sawSignIn = false;
  const watch = setInterval(() => {
    void page
      .getByRole('heading', { name: 'Staff sign in', exact: true })
      .isVisible()
      .then((v) => (sawSignIn ||= v))
      .catch(() => undefined);
  }, 100);
  await page.goto(staffUrl + '/lots');
  await expect(
    page.getByRole('status', { name: 'Opening the staff workspace' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Lots', level: 1 }),
  ).toBeVisible();
  clearInterval(watch);
  expect(sawSignIn).toBe(false);
});

test('sidebar keeps the Pickup desk counter away from the Overview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.goto(staffUrl + '/lots');
  // 3 overdue + 5 to prepare; red because some pickups are overdue.
  const badge = page.locator('#overview-count-pickup-desk b');
  await expect(badge).toHaveText('8');
  await expect(badge).toHaveClass(/is-danger/);
  await expect(badge).toHaveAttribute('title', '3 overdue, 5 to prepare');
  // The status counters carry their own colours.
  const live = page.locator('.lv-lots-tabs [data-tab="live"] .lv-lots-count');
  const sold = page.locator('.lv-lots-tabs [data-tab="sold"] .lv-lots-count');
  const bg = (l: typeof live) =>
    l.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg(live)).not.toBe(await bg(sold));
});

test('create lot: category then subcategory, coloured conditions, roomy description', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await page.goto(staffUrl + '/lots/new');
  const form = page.locator('.lv-lot-form');
  const main = form.getByLabel('Category', { exact: true });
  // Only main categories in the first dropdown.
  await expect(main.locator('option')).toHaveText([
    'Choose a category',
    'Phones',
  ]);
  const sub = form.getByLabel('Subcategory (optional)');
  await expect(sub).toHaveCount(0);
  await main.selectOption({ label: 'Phones' });
  await expect(sub.locator('option')).toHaveText([
    'None, keep it in Phones',
    'Android phones',
  ]);
  await sub.selectOption({ label: 'Android phones' });
  await expect(main).toHaveValue(category.id);
  await expect(form.getByLabel('Brand').locator('option')).toContainText([
    'Samsung',
  ]);
  // Photos added before the first save say so, instead of a bare "Waiting".
  await form
    .locator('input[type=file]')
    .setInputFiles([{ name: 'front.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(form.locator('.lv-lot-photo-state')).toHaveText(
    'Uploads on save',
  );
  await expect(page.locator('.lv-lot-check')).toContainText(
    '1 photo waiting to upload',
  );
  // Each condition card shows its own coloured badge.
  const badges = form.locator('.lv-lot-conditions .agn-badge');
  await expect(badges.first()).toBeVisible();
  const colours = await badges.evaluateAll((all) =>
    all.map((el) => getComputedStyle(el).backgroundColor),
  );
  expect(new Set(colours).size).toBeGreaterThan(2);
  const description = form.getByLabel('Description');
  expect((await description.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
    200,
  );
  await page.screenshot({
    path: testInfo.outputPath('lot-new-categories.png'),
    fullPage: true,
  });
});

test('publishes a finished draft from the lot form', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const api = await open(page);
  await page.goto(staffUrl + '/lots/new');
  const form = page.locator('.lv-lot-form');
  const publish = page.getByRole('button', { name: 'Publish', exact: true });
  // Not ready yet: Publish waits for the checklist.
  await expect(publish).toBeDisabled();
  await form.getByLabel('Title buyers will see').fill('Tecno Camon 30, 256GB');
  await form
    .getByLabel('Category', { exact: true })
    .selectOption({ label: 'Phones' });
  await form.getByLabel('Storage').selectOption('256GB');
  await form.getByRole('button', { name: /Open box/ }).click();
  await form.getByLabel('Description').fill('Returned unused. Powers on.');
  await form.getByLabel('Start price (₦)').fill('5000');
  await form.getByLabel('Retail estimate (₦)').fill('215000');
  await form
    .getByLabel('Pickup hub')
    .selectOption({ label: 'Ikeja hub · IKJ' });
  await form
    .getByLabel('Bin (optional)')
    .selectOption(location.bins[0]?.id ?? '');
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(page).toHaveURL(/\/lots\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await form.locator('input[type=file]').setInputFiles([
    { name: 'front.png', mimeType: 'image/png', buffer: PNG },
    { name: 'back.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await expect(page.locator('.lv-lot-check')).toContainText('2 photos');
  // The preview shows the saving buyers will see: ₦5,000 of ₦215,000.
  await expect(
    page.locator('.lv-lot-buyercard .agn-discount-badge'),
  ).toHaveText('−97%');
  await expect(publish).toBeEnabled();
  // Schedule opens the same dialog on a chosen time.
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByLabel('Goes live (WAT)')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Schedule lot' }),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await publish.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('When should bidding start?');
  await expect(dialog).toContainText('24 h');
  await page.screenshot({ path: testInfo.outputPath('lot-publish.png') });
  const before = Date.now();
  await dialog.getByRole('button', { name: 'Publish now' }).click();
  await expect(page).toHaveURL(/\/lots\/[0-9a-f-]{36}$/);
  expect(api.scheduled).toHaveLength(1);
  const sent = api.scheduled[0] as {
    action: string;
    startsAt: string;
    endsAt: string;
    reason: string;
  };
  expect(sent.action).toBe('schedule');
  // About a minute from now, for the 24 h run time.
  const start = Date.parse(sent.startsAt);
  expect(start).toBeGreaterThan(before + 50_000);
  expect(start).toBeLessThan(before + 120_000);
  expect(Date.parse(sent.endsAt) - start).toBe(24 * 3_600_000);
  expect(sent.reason).toBe('Published from the lot form');
});

test('chooses Top deals and Coming soon from the lot form', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const api = await open(page);
  // A finished draft: two photos, details, bin.
  const ready = api.addDraft({
    photos: [0, 1].map((i) => ({
      id: randomUUID(),
      url: `http://localhost:4000/fake-image/${i}.png`,
      thumbnailUrl: `http://localhost:4000/fake-image/${i}.png`,
      sortOrder: i,
      isDefect: false,
    })),
  });
  await page.goto(staffUrl + `/lots/${ready.id}/edit`);
  const card = page.getByRole('region', { name: 'Where it shows' });
  await expect(card).toBeVisible();

  await card.getByLabel(/Feature in Top deals/).check();
  await expect.poll(() => ready.isTopDeal).toBe(true);
  await expect(card.getByLabel('Display order')).toBeVisible();

  const soon = card.getByLabel(/Coming soon, date to be announced/);
  await expect(soon).toBeEnabled();
  await soon.check();
  await expect.poll(() => ready.comingSoon).toBe(true);
  await expect(card).toContainText(
    'Buyers see it in Upcoming and can watch it',
  );
  await card.screenshot({ path: testInfo.outputPath('where-it-shows.png') });

  // "Set a go-live time" opens the Schedule dialog.
  await card.getByRole('button', { name: 'Set a go-live time' }).click();
  await expect(page.getByLabel('Goes live (WAT)')).toBeVisible();
});

test('prints a lot label that is visible on a 50 × 30 mm page', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await page.goto(staffUrl + '/lots');
  await page
    .getByRole('button', { name: 'HP 15 laptop, Core i5, 8GB RAM' })
    .click();
  await page.getByRole('button', { name: 'Print label' }).click();
  await page.emulateMedia({ media: 'print' });
  const label = page.locator('.lv-lot-label').first();
  await expect(label).toBeVisible();
  await expect(label).toContainText('HP 15 laptop');
  await expect(page.locator('.lv-lots')).toBeHidden();
  await label.screenshot({ path: testInfo.outputPath('lot-label.png') });
  const pdf = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
  });
  const text = pdf.toString('latin1');
  expect(text.match(/\/Type\s*\/Page[^s]/g) ?? []).toHaveLength(1);
  // 50 × 30 mm is about 141.7 × 85 points (Chromium rounds to whole pixels).
  expect(text).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+14[12]\.\d+\s+8[45]\.\d+/);
});
