import { databaseValues } from '@auction-ng/shared';
import { createDatabase } from '../src/database/client';
import { encryptPii, hashPii } from '../src/security/pii';

function id(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}
const categories = [
  'Electronics',
  'Phones and accessories',
  'Computers',
  'Home appliances',
  'Kitchen',
  'Furniture',
  'Fashion',
  'Beauty',
  'Tools',
  'Baby and children',
  'Sports',
  'Office',
];
const products = [
  'Bluetooth speaker',
  'Phone charging stand',
  'Wireless keyboard',
  'Standing fan',
  'Rice cooker',
  'Bedside table',
  'Travel bag',
  'Hair dryer',
  'Cordless drill',
  'Baby high chair',
  'Exercise mat',
  'Office chair',
];
const names = [
  'Chiamaka Okafor',
  'Tunde Adeyemi',
  'Halima Musa',
  'Emeka Obi',
  'Aisha Bello',
  'Funke Ajayi',
  'Ibrahim Sani',
  'Ngozi Eze',
  'Damilola Balogun',
  'Zainab Lawal',
  'Obinna Nwosu',
  'Sade Ojo',
  'Yusuf Ahmed',
  'Amaka Uche',
  'Bola Akinwale',
  'Maryam Sule',
  'Chinedu Nnamdi',
  'Kemi Adebayo',
  'Umar Ali',
  'Ada Nwankwo',
];

export async function seedDatabase(
  connectionString: string | undefined = process.env.DATABASE_URL,
) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Demo seeding is disabled in production.');
  const db = createDatabase(connectionString);
  try {
    await db.$transaction(
      async (tx) => {
        // Concurrent retries must not interleave the initial demo-data insertion.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(42002602)`;
        const buyerData = names.map((name, index) => ({
          id: id(index + 1),
          name,
          phoneCiphertext: encryptPii(
            `+234800000${String(index + 1).padStart(4, '0')}`,
            'phone',
          ),
          phoneHash: hashPii(
            `+234800000${String(index + 1).padStart(4, '0')}`,
            'phone',
          ),
          role: 'buyer',
        }));
        const staffData = [
          'Intake staff',
          'Warehouse staff',
          'Finance staff',
        ].map((name, index) => ({
          id: id(index + 21),
          name,
          phoneCiphertext: encryptPii(
            `+234800000${String(index + 21).padStart(4, '0')}`,
            'phone',
          ),
          phoneHash: hashPii(
            `+234800000${String(index + 21).padStart(4, '0')}`,
            'phone',
          ),
          role: ['intake', 'warehouse', 'finance'][index] ?? 'support',
        }));
        await tx.user.createMany({
          data: [...buyerData, ...staffData],
          skipDuplicates: true,
        });
        await tx.wallet.createMany({
          data: names.map((_, index) => ({
            id: id(100 + index),
            userId: id(index + 1),
          })),
          skipDuplicates: true,
        });
        await tx.location.createMany({
          data: [
            {
              id: id(200),
              code: 'DEMO-LAGOS',
              name: 'Lagos demo pickup hub',
              address:
                'Demo location, Ikeja, Lagos. Not an operating warehouse.',
              hours: { timezone: 'Africa/Lagos', weekdays: '09:00–17:00' },
              capacityPerSlot: 20,
            },
          ],
          skipDuplicates: true,
        });
        await tx.category.createMany({
          data: categories.map((name, index) => ({
            id: id(300 + index),
            name,
            slug: `demo-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          })),
          skipDuplicates: true,
        });
        const start = new Date();
        start.setUTCHours(17, 0, 0, 0);
        if (start.getTime() <= Date.now())
          start.setUTCDate(start.getUTCDate() + 1);
        await tx.lot.createMany({
          data: Array.from({ length: 200 }, (_, index) => ({
            id: id(1000 + index),
            lotNumber: `DEMO-${String(index + 1).padStart(4, '0')}`,
            title: `${products[index % products.length]} — demo lot ${index + 1}`,
            description:
              'Synthetic demonstration lot. Photos and inspection details are pending. This item is not offered for sale.',
            condition:
              databaseValues.lotConditions[
                index % databaseValues.lotConditions.length
              ] ?? 'untested',
            retailPriceKobo: BigInt(500000 + index * 10000),
            startPriceKobo: 50000n,
            categoryId: id(300 + (index % categories.length)),
            locationId: id(200),
            startAt: start,
            endAt: new Date(start.getTime() + 3600000 + index * 20000),
            status: 'draft',
          })),
          skipDuplicates: true,
        });
        await tx.lotImage.createMany({
          data: Array.from({ length: 200 }, (_, index) => ({
            id: id(2000 + index),
            lotId: id(1000 + index),
            url: '/placeholders/photo-pending.svg',
            sortOrder: 0,
          })),
          skipDuplicates: true,
        });
      },
      { timeout: 30000, maxWait: 30000 },
    );
  } finally {
    await db.$disconnect();
  }
}
