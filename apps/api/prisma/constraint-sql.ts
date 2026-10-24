import { databaseValues as values } from '@auction-ng/shared';

export function constraintSql(): string {
  const statements: string[] = [];
  function check(table: string, name: string, expression: string) {
    statements.push(
      `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${name}" CHECK (${expression});`,
    );
  }
  function allowed(table: string, column: string, options: readonly string[]) {
    check(
      table,
      `${column}_allowed`,
      `"${column}" IN (${options.map((value) => `'${value}'`).join(', ')})`,
    );
  }
  for (const [table, column, options] of [
    ['users', 'role', values.roles],
    ['users', 'status', values.userStatuses],
    ['users', 'kyc_status', values.kycStatuses],
    ['lots', 'condition', values.lotConditions],
    ['lots', 'status', values.lotStatuses],
    ['payments', 'status', values.paymentStatuses],
    ['invoices', 'status', values.invoiceStatuses],
    ['fulfilments', 'type', values.fulfilmentTypes],
    ['fulfilments', 'status', values.fulfilmentStatuses],
    ['notifications', 'channel', values.notificationChannels],
    ['notifications', 'status', values.notificationStatuses],
    ['idempotency_keys', 'status', values.idempotencyStatuses],
    ['ledger_accounts', 'kind', values.ledgerAccountKinds],
    ['ledger_transactions', 'type', values.ledgerTypes],
    ['ledger_entries', 'side', values.ledgerSides],
  ] as const)
    allowed(table, column, options);
  for (const table of [
    'wallets',
    'ledger_accounts',
    'ledger_transactions',
    'payments',
    'invoices',
  ])
    check(table, 'currency_ngn', "currency = 'NGN'");
  for (const [table, columns] of [
    ['lots', ['retail_price_kobo', 'start_price_kobo']],
    ['bids', ['amount_kobo', 'max_kobo']],
    ['payments', ['amount_kobo']],
    [
      'invoices',
      [
        'hammer_total_kobo',
        'premium_kobo',
        'lot_fee_kobo',
        'vat_kobo',
        'total_kobo',
      ],
    ],
    [
      'invoice_lines',
      ['hammer_kobo', 'premium_kobo', 'lot_fee_kobo', 'vat_kobo', 'total_kobo'],
    ],
  ] as const)
    for (const column of columns)
      check(
        table,
        `${column}_safe`,
        `"${column}" BETWEEN 0 AND 9007199254740991`,
      );
  check('lots', 'positive_start', 'start_price_kobo > 0');
  check('lots', 'valid_dates', 'end_at > start_at');
  check('bids', 'valid_max', 'amount_kobo > 0 AND max_kobo >= amount_kobo');
  check('payments', 'positive_amount', 'amount_kobo > 0');
  check('ledger_entries', 'positive_amount', 'amount_kobo > 0');
  check(
    'ledger_accounts',
    'wallet_kind',
    "(kind = 'system' AND wallet_id IS NULL) OR (kind IN ('available','held') AND wallet_id IS NOT NULL)",
  );
  check('locations', 'positive_capacity', 'capacity_per_slot > 0');
  check('lot_images', 'nonnegative_order', 'sort_order >= 0');
  check('categories', 'not_own_parent', 'parent_id IS DISTINCT FROM id');
  check(
    'users',
    'phone_envelope',
    "octet_length(phone_ciphertext) >= 29 AND phone_hash ~ '^[a-f0-9]{64}$'",
  );
  for (const field of ['email', 'bvn'])
    check(
      'users',
      `${field}_envelope`,
      `(${field}_ciphertext IS NULL AND ${field}_hash IS NULL) OR (octet_length(${field}_ciphertext) >= 29 AND ${field}_hash ~ '^[a-f0-9]{64}$' AND ${field}_ciphertext IS NOT NULL AND ${field}_hash IS NOT NULL)`,
    );
  check(
    'invoices',
    'total_matches',
    'total_kobo::numeric = hammer_total_kobo::numeric + premium_kobo + lot_fee_kobo + vat_kobo',
  );
  check(
    'invoice_lines',
    'total_matches',
    'total_kobo::numeric = hammer_kobo::numeric + premium_kobo + lot_fee_kobo + vat_kobo',
  );
  statements.push(`
-- Journals and postings are immutable. Corrections require a new reversal journal.
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Ledger records are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER ledger_transactions_immutable BEFORE UPDATE OR DELETE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER ledger_accounts_immutable BEFORE UPDATE OR DELETE ON ledger_accounts FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

CREATE FUNCTION require_current_ledger_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_xid bigint;
BEGIN
  SELECT writer_xid INTO journal_xid FROM ledger_transactions WHERE id = NEW.transaction_id;
  IF journal_xid IS NOT NULL AND journal_xid <> txid_current() THEN
    RAISE EXCEPTION 'Postings must be created in the same transaction as their journal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_entries_current_journal BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION require_current_ledger_journal();

CREATE FUNCTION require_balanced_ledger_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_id uuid; posting_count bigint; net numeric;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN journal_id := NEW.id; ELSE journal_id := NEW.transaction_id; END IF;
  SELECT count(*), coalesce(sum(CASE WHEN side = 'debit' THEN amount_kobo::numeric ELSE -amount_kobo::numeric END), 0)
    INTO posting_count, net FROM ledger_entries WHERE transaction_id = journal_id;
  IF posting_count < 2 OR net <> 0 THEN
    RAISE EXCEPTION 'Ledger journal must contain at least two balanced postings' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER ledger_transaction_balanced AFTER INSERT ON ledger_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_balanced_ledger_journal();
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_balanced_ledger_journal();
`);
  return `\n-- Additional invariant constraints not expressible in Prisma schema syntax.\n${statements.join('\n')}\n`;
}
