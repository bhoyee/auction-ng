import { beforeAll, afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPool } from '../apps/api/src/database/pool';
import { seedDatabase } from '../apps/api/prisma/seed-data';
import { exerciseLedgerConstraint } from '../apps/api/src/ledger/schema-fixtures';

const pool = createPool(process.env.TEST_DATABASE_URL);

it('allocates readable, distinct lot and invoice references under concurrent requests', async () => {
  for (const kind of ['lot', 'invoice']) {
    const refs = await Promise.all(
      Array.from(
        { length: 30 },
        async () =>
          (
            await pool.query<{ reference: string }>(
              'SELECT next_auction_reference($1) AS reference',
              [kind],
            )
          ).rows[0]?.reference,
      ),
    );
    expect(new Set(refs).size).toBe(30);
    for (const reference of refs)
      expect(reference).toMatch(
        kind === 'lot' ? /^LOT-\d{6,}$/ : /^INV-\d{6,}$/,
      );
  }
});
it('does not reuse a reference after a rolled-back transaction', async () => {
  const client = await pool.connect();
  let first: string | undefined;
  try {
    await client.query('BEGIN');
    first = (
      await client.query<{ reference: string }>(
        "SELECT next_auction_reference('invoice') AS reference",
      )
    ).rows[0]?.reference;
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
  const next = (
    await pool.query<{ reference: string }>(
      "SELECT next_auction_reference('invoice') AS reference",
    )
  ).rows[0]?.reference;
  expect(first).toBeDefined();
  expect(next).toBeDefined();
  expect(next).not.toBe(first);
});
it('skips a generated lot reference already reserved by an existing staff code', async () => {
  await seedDatabase(process.env.TEST_DATABASE_URL);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const next = (
      await client.query<{ value: string }>(
        'SELECT last_value::text AS value FROM lot_reference_seq',
      )
    ).rows[0]?.value;
    if (!next) throw new Error('Reference sequence is missing.');
    const reserved = `LOT-${(BigInt(next) + 1n).toString().padStart(6, '0')}`;
    const changed = await client.query<{ id: string }>(
      "UPDATE lots SET lot_number=$1 WHERE lot_number='DEMO-0200' RETURNING id",
      [reserved],
    );
    expect(changed.rowCount).toBe(1);
    const allocated = (
      await client.query<{ reference: string }>(
        "SELECT next_auction_reference('lot') AS reference",
      )
    ).rows[0]?.reference;
    expect(allocated).toMatch(/^LOT-\d{6,}$/);
    expect(allocated).not.toBe(reserved);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
it('documents every deployed table, column, relation, check and unique/index definition', async () => {
  const doc = readFileSync(
    new URL('../docs/specs/database-schema.md', import.meta.url),
    'utf8',
  );
  const tables = await pool.query<{ name: string }>(
    "select tablename as name from pg_tables where schemaname='public' and tablename <> '_prisma_migrations'",
  );
  for (const { name } of tables.rows) {
    const section = doc.split(`## ${name}\n`)[1]?.split('\n## ')[0];
    expect(section, name).toBeDefined();
    const columns = await pool.query<{ name: string }>(
      "select column_name as name from information_schema.columns where table_schema='public' and table_name=$1",
      [name],
    );
    for (const column of columns.rows)
      expect(section).toMatch(new RegExp(`\\|\\s*${column.name}\\s*\\|`));
    const constraints = await pool.query<{ name: string }>(
      'select conname as name from pg_constraint where conrelid=$1::regclass',
      [`public.${name}`],
    );
    const indexes = await pool.query<{ name: string }>(
      "select indexname as name from pg_indexes where schemaname='public' and tablename=$1",
      [name],
    );
    for (const constraint of [...constraints.rows, ...indexes.rows])
      expect(section).toContain(constraint.name);
  }
});

it('rejects duplicate provider references and mismatched payment ownership', async () => {
  await seedDatabase(process.env.TEST_DATABASE_URL);
  const sql =
    "insert into payments (user_id,wallet_id,provider,provider_ref,amount_kobo) select user_id,id,'paystack','schema-test-reference',100 from wallets order by id limit 1";
  await pool.query(sql);
  await expect(pool.query(sql)).rejects.toMatchObject({ code: '23505' });
  await expect(
    pool.query(
      "insert into payments (user_id,wallet_id,provider,provider_ref,amount_kobo) select u.id,w.id,'paystack','wrong-owner',100 from wallets w join users u on u.id<>w.user_id limit 1",
    ),
  ).rejects.toMatchObject({ code: '23503' });
});

beforeAll(async () => {
  const result = await pool.query<{ name: string }>(
    'select current_database() as name',
  );
  if (!result.rows[0]?.name.startsWith('auction_ng_test_')) {
    throw new Error(
      'Database tests require an isolated auction_ng_test_* database.',
    );
  }
}, 30000);
afterAll(async () => {
  await pool.end();
});

it('has all 31 application tables', async () => {
  const result = await pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name <> '_prisma_migrations'",
  );
  expect(result.rows).toHaveLength(31);
});

it('seeds once under concurrent retries without resetting existing data or funding wallets', async () => {
  await Promise.all([
    seedDatabase(process.env.TEST_DATABASE_URL),
    seedDatabase(process.env.TEST_DATABASE_URL),
  ]);
  for (const [table, count] of [
    ['users', 23],
    ['wallets', 20],
    ['locations', 1],
    ['categories', 12],
    ['lots', 200],
    ['lot_images', 200],
    ['ledger_entries', 0],
  ] as const) {
    const result = await pool.query<{ count: string }>(
      `select count(*) from ${table}`,
    );
    expect(Number(result.rows[0]?.count), table).toBe(count);
  }
  await pool.query(
    "update lots set title='Retained edit' where lot_number='DEMO-0001'",
  );
  await seedDatabase(process.env.TEST_DATABASE_URL);
  const result = await pool.query<{ title: string }>(
    "select title from lots where lot_number='DEMO-0001'",
  );
  expect(result.rows[0]?.title).toBe('Retained edit');
}, 30000);

it('stores phones as ciphertext with unique keyed lookup hashes', async () => {
  const result = await pool.query<{
    phone_ciphertext: Buffer;
    phone_hash: string;
  }>('select phone_ciphertext, phone_hash from users limit 1');
  expect(result.rows[0]?.phone_ciphertext.toString('utf8')).not.toMatch(
    /\+234\d{10}/,
  );
  expect(result.rows[0]?.phone_hash).toMatch(/^[a-f0-9]{64}$/);
  await expect(
    pool.query(
      'insert into users (id, name, phone_ciphertext, phone_hash) select gen_random_uuid(), name, phone_ciphertext, phone_hash from users limit 1',
    ),
  ).rejects.toMatchObject({ code: '23505' });
});

it('rejects invalid money, statuses, relations, image ordering and auction dates', async () => {
  for (const sql of [
    "update lots set start_price_kobo=-1 where lot_number='DEMO-0001'",
    "update lots set start_price_kobo=9007199254740992 where lot_number='DEMO-0001'",
    "update lots set status='invented' where lot_number='DEMO-0001'",
    "update lots set end_at=start_at where lot_number='DEMO-0001'",
  ])
    await expect(pool.query(sql)).rejects.toMatchObject({ code: '23514' });
  await expect(
    pool.query(
      "update lots set category_id=gen_random_uuid() where lot_number='DEMO-0001'",
    ),
  ).rejects.toMatchObject({ code: '23503' });
  await expect(
    pool.query(
      'insert into lot_images (id, lot_id, url, sort_order) select gen_random_uuid(), lot_id, url, sort_order from lot_images limit 1',
    ),
  ).rejects.toMatchObject({ code: '23505' });
});

it.each([
  'balanced',
  'unbalanced',
  'empty',
  'duplicate',
  'immutable',
  'large',
  'negative',
  'concurrent',
] as const)('enforces the %s ledger schema case', async (scenario) => {
  await exerciseLedgerConstraint(pool, scenario);
});

it('keeps every money column as bigint and includes the required lookup indexes', async () => {
  const columns = await pool.query<{ data_type: string }>(
    "select data_type from information_schema.columns where table_schema='public' and column_name like '%_kobo'",
  );
  expect(columns.rows.length).toBeGreaterThan(10);
  expect(columns.rows.every((column) => column.data_type === 'bigint')).toBe(
    true,
  );
  const indexes = await pool.query<{ indexdef: string }>(
    "select indexdef from pg_indexes where schemaname='public'",
  );
  const text = indexes.rows.map((index) => index.indexdef).join('\n');
  expect(text).toContain('(status, end_at, id)');
  expect(text).toContain('(lot_id, amount_kobo DESC)');
  expect(text).toContain('(provider, provider_ref)');
});
