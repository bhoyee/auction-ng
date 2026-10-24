import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '../database/pool';

// Deliberately invalid writes stay inside the ledger module and never commit.
export async function exerciseWalletConstraints(
  databaseUrl: string,
  walletId: string,
) {
  if (
    process.env.NODE_ENV !== 'test' ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname)
  )
    throw new Error('An isolated test database is required.');
  const pool = createPool(databaseUrl);
  const client = await pool.connect();
  try {
    const accounts = await client.query<{ id: string; kind: string }>(
      'SELECT id,kind FROM ledger_accounts WHERE wallet_id=$1',
      [walletId],
    );
    const available = accounts.rows.find((row) => row.kind === 'available')?.id;
    const system = (
      await client.query<{ id: string }>(
        "SELECT id FROM ledger_accounts WHERE code='system:sales-settlement'",
      )
    ).rows[0]?.id;
    assert.ok(available);
    assert.ok(system);
    for (const scenario of ['overdraw', 'orphan-hold', 'metadata-mismatch']) {
      await client.query('BEGIN');
      try {
        await assert.rejects(
          async () => {
            if (scenario === 'orphan-hold') {
              await client.query(
                'INSERT INTO wallet_holds(id,wallet_id,amount_kobo) VALUES($1,$2,1)',
                [randomUUID(), walletId],
              );
            } else {
              const id = randomUUID();
              if (scenario === 'overdraw') {
                await client.query(
                  "INSERT INTO ledger_transactions(id,type,idempotency_key,reference) VALUES($1,'debit',$2,$2)",
                  [id, randomUUID()],
                );
              } else {
                await client.query(
                  "INSERT INTO ledger_transactions(id,type,idempotency_key,reference,wallet_id,operation,amount_kobo,request_hash,available_delta_kobo,held_delta_kobo) VALUES($1,'topup',$2,$2,$3,'topup',2,$4,2,0)",
                  [id, randomUUID(), walletId, 'a'.repeat(64)],
                );
              }
              const debit = scenario === 'overdraw' ? available : system;
              const credit = scenario === 'overdraw' ? system : available;
              await client.query(
                "INSERT INTO ledger_entries(transaction_id,account_id,amount_kobo,side,idempotency_key) VALUES($1,$2,1,'debit',$4),($1,$3,1,'credit',$5)",
                [id, debit, credit, randomUUID(), randomUUID()],
              );
            }
            await client.query('COMMIT');
          },
          (error: unknown) =>
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === '23514',
        );
      } finally {
        await client.query('ROLLBACK');
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}
