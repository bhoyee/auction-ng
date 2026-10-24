import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';

// Only this ledger-owned, test-only harness writes ledger fixtures. It is not
// imported by the API boot path, seed, worker or business modules.
export async function exerciseLedgerConstraint(
  pool: Pool,
  scenario:
    | 'balanced'
    | 'unbalanced'
    | 'empty'
    | 'duplicate'
    | 'immutable'
    | 'large'
    | 'negative'
    | 'concurrent',
) {
  const database = await pool.query<{ name: string }>(
    'select current_database() as name',
  );
  if (
    process.env.NODE_ENV !== 'test' ||
    !database.rows[0]?.name.startsWith('auction_ng_test_')
  )
    throw new Error('Ledger fixtures require an isolated test database.');
  const client = await pool.connect();
  const transactionId = randomUUID();
  const account1 = randomUUID();
  const account2 = randomUUID();
  try {
    await client.query(
      "insert into ledger_accounts (id, code, kind) values ($1::uuid,$1::text,'system'),($2::uuid,$2::text,'system')",
      [account1, account2],
    );
    await client.query('begin');
    await client.query(
      "insert into ledger_transactions (id, idempotency_key, reference, type) values ($1::uuid,$1::text,$1::text,'topup')",
      [transactionId],
    );
    if (scenario === 'negative') {
      await assert.rejects(
        client.query(
          "insert into ledger_entries (transaction_id,account_id,amount_kobo,side,idempotency_key) values ($1,$2,-1,'debit',$3)",
          [transactionId, account1, randomUUID()],
        ),
        { code: '23514' },
      );
      return;
    }
    const amount = scenario === 'large' ? '10000000000000001' : '100';
    if (scenario !== 'empty') {
      await client.query(
        "insert into ledger_entries (transaction_id,account_id,amount_kobo,side,idempotency_key) values ($1,$2,$7,'debit',$4),($1,$3,$5,'credit',$6)",
        [
          transactionId,
          account1,
          account2,
          `${transactionId}:debit`,
          scenario === 'unbalanced' ? '99' : amount,
          `${transactionId}:credit`,
          amount,
        ],
      );
    }
    if (scenario === 'empty' || scenario === 'unbalanced') {
      await assert.rejects(client.query('commit'), { code: '23514' });
      return;
    }
    if (scenario === 'duplicate') {
      await client.query('savepoint duplicate_posting');
      await assert.rejects(
        client.query(
          "insert into ledger_entries (transaction_id,account_id,amount_kobo,side,idempotency_key) values ($1,$2,100,'debit',$3)",
          [transactionId, account1, `${transactionId}:debit`],
        ),
        { code: '23505' },
      );
      await client.query('rollback to savepoint duplicate_posting');
    }
    await client.query('commit');
    if (scenario === 'large') {
      const result = await client.query<{ amount_kobo: string }>(
        'select amount_kobo from ledger_entries where transaction_id=$1',
        [transactionId],
      );
      assert.ok(result.rows.every((entry) => entry.amount_kobo === amount));
    }
    if (scenario === 'duplicate') {
      await assert.rejects(
        client.query(
          "insert into ledger_transactions (idempotency_key,reference,type) values ($1,$2,'topup')",
          [transactionId, randomUUID()],
        ),
        { code: '23505' },
      );
    }
    if (scenario === 'immutable') {
      await assert.rejects(
        client.query(
          'update ledger_entries set amount_kobo=101 where transaction_id=$1',
          [transactionId],
        ),
        { code: '23514' },
      );
      await assert.rejects(
        client.query('delete from ledger_entries where transaction_id=$1', [
          transactionId,
        ]),
        { code: '23514' },
      );
      await assert.rejects(
        client.query(
          "insert into ledger_entries (transaction_id,account_id,amount_kobo,side,idempotency_key) values ($1,$2,1,'credit',$3)",
          [transactionId, account1, randomUUID()],
        ),
        { code: '23514' },
      );
    }
    if (scenario === 'concurrent') {
      const key = randomUUID();
      const attempts = await Promise.allSettled(
        Array.from({ length: 10 }, async () => {
          const connection = await pool.connect();
          try {
            await connection.query('begin');
            const result = await connection.query<{ id: string }>(
              "insert into ledger_transactions (idempotency_key,reference,type) values ($1,$2,'topup') returning id",
              [key, randomUUID()],
            );
            const journalId = result.rows[0]?.id;
            assert.ok(journalId);
            await connection.query(
              "insert into ledger_entries (transaction_id,account_id,amount_kobo,side,idempotency_key) values ($1,$2,1,'debit',$4),($1,$3,1,'credit',$5)",
              [
                journalId,
                account1,
                account2,
                `${journalId}:debit`,
                `${journalId}:credit`,
              ],
            );
            await connection.query('commit');
          } catch (error) {
            await connection.query('rollback');
            throw error;
          } finally {
            connection.release();
          }
        }),
      );
      assert.equal(
        attempts.filter((attempt) => attempt.status === 'fulfilled').length,
        1,
      );
      const rejected = attempts.filter(
        (attempt) => attempt.status === 'rejected',
      );
      for (const attempt of rejected)
        assert.equal((attempt.reason as { code: string }).code, '23505');
    }
  } finally {
    await client.query('rollback');
    client.release();
  }
}
