// Demo/dev data for Lot setup (T15e): the categories, pickup locations and
// bins shown in docs/design/admin-*.png. Idempotent and non-destructive:
// existing demo categories and hubs are renamed or nested in place so every
// lot keeps its category and location. Never run against production.
import type { PrismaClient } from '../src/generated/prisma/client';
import { slugify } from '@auction-ng/shared';

type Db = Pick<PrismaClient, '$transaction'>;
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const topLevel = [
  { name: 'Phones', icon: 'smartphone', legacy: ['Phones and accessories'] },
  { name: 'Computers', icon: 'laptop', legacy: [] },
  { name: 'Kitchen', icon: 'cooking-pot', legacy: [] },
  { name: 'Electronics', icon: 'monitor', legacy: [] },
  { name: 'Fashion', icon: 'shirt', legacy: [] },
  { name: 'Home and furniture', icon: 'sofa', legacy: ['Furniture'] },
  { name: 'Baby and kids', icon: 'baby', legacy: ['Baby and children'] },
  { name: 'Tools and DIY', icon: 'wrench', legacy: ['Tools'] },
] as const;

// Older demo categories become subcategories so their lots stay put.
const nested: { name: string; parent: string; legacy?: string }[] = [
  { name: 'Android phones', parent: 'Phones' },
  { name: 'iPhones', parent: 'Phones' },
  { name: 'Feature phones', parent: 'Phones' },
  { name: 'Tablets', parent: 'Phones' },
  { name: 'Phone accessories', parent: 'Phones' },
  { name: 'Home appliances', parent: 'Electronics' },
  { name: 'Beauty', parent: 'Fashion' },
  { name: 'Sports and fitness', parent: 'Tools and DIY', legacy: 'Sports' },
  { name: 'Office supplies', parent: 'Computers', legacy: 'Office' },
];

const brands: { name: string; categories: string[] }[] = [
  { name: 'Tecno', categories: ['Phones'] },
  { name: 'Infinix', categories: ['Phones'] },
  { name: 'Samsung', categories: ['Phones', 'Electronics', 'Kitchen'] },
  { name: 'Apple', categories: ['Phones', 'Computers'] },
  { name: 'itel', categories: ['Phones'] },
  { name: 'Xiaomi', categories: ['Phones'] },
  { name: 'Nokia', categories: ['Phones'] },
  { name: 'HP', categories: ['Computers'] },
  { name: 'Dell', categories: ['Computers'] },
  { name: 'Lenovo', categories: ['Computers'] },
  { name: 'LG', categories: ['Electronics', 'Kitchen'] },
  { name: 'Hisense', categories: ['Electronics', 'Kitchen'] },
  { name: 'Scanfrost', categories: ['Kitchen', 'Electronics'] },
  { name: 'Binatone', categories: ['Kitchen'] },
  { name: 'Nexus', categories: ['Electronics'] },
];

const phoneFields = [
  {
    name: 'Brand',
    key: 'brand',
    type: 'list',
    options: [],
    helpText: 'Tecno, Infinix, Samsung, Apple…',
    required: true,
    showToBuyers: true,
  },
  {
    name: 'Model',
    key: 'model',
    type: 'text',
    options: [],
    helpText: 'e.g. Camon 30',
    required: true,
    showToBuyers: true,
  },
  {
    name: 'Storage',
    key: 'storage',
    type: 'list',
    options: ['32GB', '64GB', '128GB', '256GB', '512GB'],
    helpText: null,
    required: true,
    showToBuyers: true,
  },
  {
    name: 'Colour',
    key: 'colour',
    type: 'text',
    options: [],
    helpText: null,
    required: false,
    showToBuyers: true,
  },
  {
    name: 'IMEI checked',
    key: 'imei_checked',
    type: 'boolean',
    options: [],
    helpText: 'Staff confirm the IMEI is not blacklisted',
    required: true,
    showToBuyers: false,
  },
  {
    name: 'Battery health',
    key: 'battery_health',
    type: 'number',
    options: [],
    helpText: 'Only for used phones, as a percentage',
    required: false,
    showToBuyers: true,
  },
];

const hubs = [
  {
    code: 'IKJ',
    legacy: ['DEMO-HUB-0', 'DEMO-LAGOS'],
    name: 'Ikeja hub',
    address: '14 Oba Akran Avenue, Ikeja, Lagos',
    landmark: 'Opp. Nigerian Breweries',
    phone: '0809 555 0142',
    lat: 6.6018,
    lng: 3.3515,
    status: 'open',
    bins: [
      ['S-01', 'Shelf 1 · phones'],
      ['S-02', 'Shelf 2 · phones and tablets'],
      ['S-03', 'Shelf 3 · small kitchen items'],
      ['S-04', 'Shelf 4 · laptops'],
      ['CAGE-1', 'Locked cage · items over ₦200k retail'],
      ['FLOOR', 'Floor by the door · fridges, ACs, big items'],
      ['S-05', 'Shelf 5'],
      ['RETURNS', 'Waiting to go back to supplier'],
      ['S-06', 'Shelf 6 · fashion'],
      ['S-07', 'Shelf 7 · beauty'],
      ['S-08', 'Shelf 8 · baby and kids'],
      ['S-09', 'Shelf 9 · tools'],
      ['S-10', 'Shelf 10 · office'],
      ['CAGE-2', 'Locked cage · returns being checked'],
    ],
  },
  {
    code: 'LKK',
    legacy: ['DEMO-HUB-1'],
    name: 'Lekki hub',
    address: '3 Admiralty Way, Lekki Phase 1, Lagos',
    landmark: 'Beside the filling station',
    phone: '0809 555 0177',
    lat: 6.4474,
    lng: 3.4731,
    status: 'open',
    bins: [
      ['S-01', 'Shelf 1'],
      ['S-02', 'Shelf 2'],
      ['S-03', 'Shelf 3'],
      ['S-04', 'Shelf 4'],
      ['CAGE-1', 'Locked cage · high value'],
      ['FLOOR', 'Floor · big items'],
    ],
  },
  {
    code: 'WSE',
    legacy: ['DEMO-HUB-2'],
    name: 'Wuse hub',
    address: 'Plot 210 Aminu Kano Crescent, Wuse 2, Abuja',
    landmark: 'Near Banex junction',
    phone: '0809 555 0190',
    lat: 9.0765,
    lng: 7.4757,
    status: 'open',
    bins: [
      ['S-01', 'Shelf 1'],
      ['S-02', 'Shelf 2'],
      ['FLOOR', 'Floor · big items'],
    ],
  },
  {
    code: 'PHC',
    legacy: [],
    name: 'Trans Amadi hub',
    address: 'Trans Amadi Industrial Layout, Port Harcourt, Rivers',
    landmark: 'Off Peter Odili Road',
    phone: '0809 555 0123',
    lat: 4.8156,
    lng: 7.0498,
    status: 'closed',
    bins: [],
  },
] as const;

const suppliers = [
  ['Lagos Returns Co.', 'marketplace_returns', 'Tunde Bakare', 'Net 14 days'],
  ['Ikeja Wholesale Ltd', 'retailer', 'Ngozi Eze', 'Pay on delivery'],
  ['Adeyemi Traders', 'individual', 'Kunle Adeyemi', 'Cash on collection'],
  ['Kano Overstock Hub', 'retailer', 'Aisha Bello', 'Net 30 days'],
] as const;

async function category(
  tx: Tx,
  name: string,
  legacy: readonly string[],
  data: Record<string, unknown>,
) {
  const found =
    (await tx.category.findFirst({ where: { name } })) ??
    (legacy.length
      ? await tx.category.findFirst({ where: { name: { in: [...legacy] } } })
      : null);
  const slug = slugify(name);
  return found
    ? tx.category.update({
        where: { id: found.id },
        data: { name, slug, ...data },
      })
    : tx.category.create({ data: { name, slug, ...data } });
}

export async function seedLotSetup(db: Db) {
  await db.$transaction(
    async (tx) => {
      const ids = new Map<string, string>();
      for (const [index, c] of topLevel.entries()) {
        const row = await category(tx, c.name, c.legacy, {
          icon: c.icon,
          parentId: null,
          sortOrder: index + 1,
        });
        ids.set(c.name, row.id);
      }
      for (const [index, c] of nested.entries()) {
        const parentId = ids.get(c.parent);
        const row = await category(tx, c.name, c.legacy ? [c.legacy] : [], {
          parentId,
          sortOrder: index + 1,
        });
        ids.set(c.name, row.id);
      }
      const phones = ids.get('Phones') ?? '';
      await tx.category.update({
        where: { id: phones },
        data: {
          description:
            'Smartphones, tablets and accessories from UK and local returns.',
          defaultRunTimeMinutes: 1440,
          minStartPriceKobo: 100000n,
          minPhotos: 4,
          fieldsInherited: false,
          conditionsInherited: false,
        },
      });
      if (!(await tx.categoryField.count({ where: { categoryId: phones } })))
        await tx.categoryField.createMany({
          data: phoneFields.map((f, sortOrder) => ({
            ...f,
            categoryId: phones,
            sortOrder,
          })),
        });
      const conditions = await tx.condition.findMany({
        where: { key: { in: ['new', 'like_new', 'open_box', 'damaged'] } },
      });
      await tx.categoryCondition.createMany({
        data: conditions.map((c) => ({
          categoryId: phones,
          conditionId: c.id,
        })),
        skipDuplicates: true,
      });
      for (const b of brands) {
        const row =
          (await tx.brand.findFirst({ where: { name: b.name } })) ??
          (await tx.brand.create({ data: { name: b.name } }));
        await tx.brandCategory.createMany({
          data: b.categories.flatMap((name) => {
            const categoryId = ids.get(name);
            return categoryId ? [{ brandId: row.id, categoryId }] : [];
          }),
          skipDuplicates: true,
        });
      }
      for (const [name, type, contactName, paymentTerms] of suppliers)
        if (!(await tx.supplier.findFirst({ where: { name } })))
          await tx.supplier.create({
            data: { name, type, contactName, paymentTerms },
          });

      const staff = await tx.user.findMany({
        where: { role: { in: ['warehouse', 'intake', 'support', 'manager'] } },
        orderBy: { createdAt: 'asc' },
        take: 3,
      });
      for (const hub of hubs) {
        const found = await tx.location.findFirst({
          where: { code: { in: [hub.code, ...hub.legacy] } },
        });
        const data = {
          code: hub.code,
          name: hub.name,
          address: hub.address,
          landmark: hub.landmark,
          phone: hub.phone,
          lat: hub.lat,
          lng: hub.lng,
          status: hub.status,
          slotMinutes: 30,
          capacityPerSlot: 40,
          idRequired: true,
          deliveryEnabled: hub.code === 'IKJ',
          hours: {
            weekdays: '09:00–18:00',
            saturday: '10:00–16:00',
            sunday: 'Closed',
          },
        };
        const location = found
          ? await tx.location.update({ where: { id: found.id }, data })
          : await tx.location.create({ data });
        await tx.locationOpeningHours.deleteMany({
          where: { locationId: location.id },
        });
        const at = (t: string) => new Date(`1970-01-01T${t}:00Z`);
        await tx.locationOpeningHours.createMany({
          data: [
            ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(
              (day) => ({
                locationId: location.id,
                day,
                opens: at('09:00'),
                closes: at('18:00'),
              }),
            ),
            {
              locationId: location.id,
              day: 'saturday',
              opens: at('10:00'),
              closes: at('16:00'),
            },
            {
              locationId: location.id,
              day: 'sunday',
              opens: null,
              closes: null,
            },
            {
              locationId: location.id,
              day: 'holiday',
              opens: null,
              closes: null,
            },
          ],
        });
        await tx.pickupStorageCentre.upsert({
          where: { locationId: location.id },
          update: {},
          create: { locationId: location.id, calendar: {} },
        });
        if (hub.code === 'IKJ' && staff.length)
          await tx.locationStaff.createMany({
            data: staff.map((s) => ({ locationId: location.id, userId: s.id })),
            skipDuplicates: true,
          });
        const binIds: string[] = [];
        for (const [code, note] of hub.bins) {
          const bin =
            (await tx.bin.findFirst({
              where: { locationId: location.id, code, deletedAt: null },
            })) ??
            (await tx.bin.create({
              data: {
                locationId: location.id,
                code,
                note,
                acceptsNewLots: code !== 'RETURNS',
              },
            }));
          if (!['S-05', 'RETURNS', 'CAGE-2'].includes(code))
            binIds.push(bin.id);
        }
        // Spread existing lots across bins; leave every 25th lot without a
        // bin so the "no bin" warning has something to show.
        if (binIds.length) {
          const lots = await tx.lot.findMany({
            where: { locationId: location.id, binId: null },
            select: { id: true },
            orderBy: { id: 'asc' },
          });
          const groups = new Map<string, string[]>();
          for (const [index, lot] of lots.entries()) {
            const binId = binIds[index % binIds.length];
            if (index % 25 === 24 || !binId) continue;
            groups.set(binId, [...(groups.get(binId) ?? []), lot.id]);
          }
          for (const [binId, lotIds] of groups)
            await tx.lot.updateMany({
              where: { id: { in: lotIds } },
              data: { binId },
            });
        }
      }
    },
    { timeout: 120000 },
  );
}
