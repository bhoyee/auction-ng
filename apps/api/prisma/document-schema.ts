import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from '../src/database/pool';

async function main() {
  const pool = createPool(process.env.DATABASE_URL);
  const lines = [
    '# Database schema',
    '',
    'Generated from the migrated PostgreSQL catalog with `pnpm db:docs`. All 25 application tables, including authentication, wallet holds, T06 card/bank funding metadata and T07 image upload intents, are listed below. `_prisma_migrations` is maintained by Prisma and is not an application table.',
    '',
    'Entity IDs are UUIDs; the authentication rate-limit primary key is a keyed hash. Times use `timestamp(3) with time zone` (UTC storage; WAT formatting belongs at the UI edge). Every foreign key uses RESTRICT on deletion and updates. PostgreSQL primary keys and unique constraints include backing unique indexes. Nullable unique columns allow multiple NULLs.',
    '',
    'Money is integer kobo in bigint columns; non-ledger amounts and total wallet funds are constrained to JavaScript safe integers. Ledger postings use bigint without conversion to number. Wallet balances are derived from ledger accounts; there is no balance column to edit. Ledger journals have an operation-level unique idempotency key and postings have their own unique keys. Only `apps/api/src/ledger` may write ledger tables. T05 owns money operations and available-funds checks; see [wallet contracts](wallet-ledger.md).',
    '',
    'Sensitive values use versioned AES-256-GCM envelopes in bytea columns. Keyed SHA-256 hashes support equality lookup and uniqueness without storing plaintext phone/BVN/email values. QR passes store only a token hash. Payloads that may contain personal data are ciphertext, not plaintext JSON.',
    '',
    'Statuses and role vocabulary are defined only in `packages/shared/src/database-values.ts` and frozen into each migration’s CHECK constraints. The demo seed creates draft lots and unverified fictional users; it does not fund wallets or create ledger records.',
    '',
  ];
  try {
    const tables = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name <> '_prisma_migrations' order by table_name",
    );
    for (const { table_name: table } of tables.rows) {
      lines.push(
        `## ${table}`,
        '',
        '| Column | PostgreSQL type | Nullable | Default |',
        '| --- | --- | --- | --- |',
      );
      const columns = await pool.query<{
        name: string;
        type: string;
        nullable: boolean;
        default_value: string | null;
      }>(
        `select a.attname as name, format_type(a.atttypid,a.atttypmod) as type, not a.attnotnull as nullable, pg_get_expr(d.adbin,d.adrelid) as default_value from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and c.relname=$1 and a.attnum>0 and not a.attisdropped order by a.attnum`,
        [table],
      );
      for (const c of columns.rows)
        lines.push(
          `| ${c.name} | ${c.type} | ${c.nullable ? 'Yes' : 'No'} | ${c.default_value ?? '—'} |`,
        );
      lines.push('', 'Relations and constraints:', '');
      const constraints = await pool.query<{
        name: string;
        definition: string;
      }>(
        `select con.conname as name, pg_get_constraintdef(con.oid,true) as definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=$1 order by con.conname`,
        [table],
      );
      for (const c of constraints.rows)
        lines.push(
          `- \`${c.name}\`: \`${c.definition.replaceAll('|', '\\|')}\``,
        );
      lines.push(
        '',
        'Indexes (including those backing primary/unique keys):',
        '',
      );
      const indexes = await pool.query<{ indexname: string; indexdef: string }>(
        "select indexname,indexdef from pg_indexes where schemaname='public' and tablename=$1 order by indexname",
        [table],
      );
      for (const i of indexes.rows)
        lines.push(`- \`${i.indexname}\`: \`${i.indexdef}\``);
      lines.push('');
    }
    lines.push(
      '## Ledger triggers',
      '',
      'All ledger accounts, journals and postings are immutable. Posting inserts must occur in the same PostgreSQL transaction as their journal (`writer_xid` records the full transaction ID). Deferred constraint triggers run at commit and reject empty or unbalanced journals. Ledger accounts bind each wallet’s available/held accounts uniquely; system accounts have no wallet. All accounts and journals are NGN-only. T05 adds deferred wallet row locking and rejects negative balances, unsafe total funds, held balances that differ from active reservations, foreign-wallet postings and journal metadata that differs from postings. Hold transitions cannot reduce reservations, change ownership or reopen settled holds; holds cannot be deleted. Legacy system-only journals may omit wallet metadata. Fee calculations and proxy bidding remain in the shared rules and later integrations.',
      '',
      '## Funding intent guards',
      '',
      'The payments_accepted_intent_immutable trigger freezes accepted funding ownership, references, currency, gross/fee/net amounts, method, card tier, policy, retry key and consent time. An issued encrypted checkout URL cannot be replaced and a credited payment cannot be downgraded. Legacy rows without funding metadata remain compatible. Funding refund requests are encrypted audit events with idempotent receipts; requesting a refund does not move or reserve money.',
      '',
    );
    await writeFile(
      resolve(process.cwd(), '../../docs/specs/database-schema.md'),
      lines.join('\n'),
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    'Schema documentation generation failed. Check database access.',
  );
  process.exitCode = 1;
});
