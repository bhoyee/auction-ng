-- AlterTable
ALTER TABLE "ledger_transactions" ADD COLUMN     "amount_kobo" BIGINT,
ADD COLUMN     "available_delta_kobo" BIGINT,
ADD COLUMN     "held_delta_kobo" BIGINT,
ADD COLUMN     "hold_id" UUID,
ADD COLUMN     "operation" VARCHAR(24),
ADD COLUMN     "request_hash" VARCHAR(64),
ADD COLUMN     "source_transaction_id" UUID,
ADD COLUMN     "wallet_id" UUID;

-- CreateTable
CREATE TABLE "wallet_holds" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_holds_wallet_id_status_id_idx" ON "wallet_holds"("wallet_id", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_holds_id_wallet_id_key" ON "wallet_holds"("id", "wallet_id");

-- CreateIndex
CREATE INDEX "ledger_transactions_wallet_id_created_at_id_idx" ON "ledger_transactions"("wallet_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "ledger_transactions_hold_id_wallet_id_idx" ON "ledger_transactions"("hold_id", "wallet_id");

-- CreateIndex
CREATE INDEX "ledger_transactions_source_transaction_id_wallet_id_idx" ON "ledger_transactions"("source_transaction_id", "wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_id_wallet_id_key" ON "ledger_transactions"("id", "wallet_id");

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_hold_id_wallet_id_fkey" FOREIGN KEY ("hold_id", "wallet_id") REFERENCES "wallet_holds"("id", "wallet_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_source_transaction_id_wallet_id_fkey" FOREIGN KEY ("source_transaction_id", "wallet_id") REFERENCES "ledger_transactions"("id", "wallet_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Legacy T02 schema fixtures remain valid; new wallet journals require complete metadata.
ALTER TABLE wallet_holds ADD CONSTRAINT wallet_holds_status CHECK (status IN ('active','released','captured'));
ALTER TABLE wallet_holds ADD CONSTRAINT wallet_holds_amount CHECK (amount_kobo BETWEEN 1 AND 9007199254740991);
ALTER TABLE ledger_transactions ADD CONSTRAINT wallet_journal_metadata CHECK (
  (wallet_id IS NULL AND operation IS NULL AND amount_kobo IS NULL AND request_hash IS NULL AND available_delta_kobo IS NULL AND held_delta_kobo IS NULL AND hold_id IS NULL AND source_transaction_id IS NULL)
  OR
  (wallet_id IS NOT NULL AND operation IS NOT NULL AND amount_kobo IS NOT NULL AND request_hash IS NOT NULL AND available_delta_kobo IS NOT NULL AND held_delta_kobo IS NOT NULL
    AND amount_kobo BETWEEN 1 AND 9007199254740991 AND request_hash ~ '^[a-f0-9]{64}$'
    AND operation IN ('topup','hold','release','capture','debit','refund','payout')
    AND type = CASE WHEN operation='capture' THEN 'debit' ELSE operation END
    AND available_delta_kobo BETWEEN -9007199254740991 AND 9007199254740991
    AND held_delta_kobo BETWEEN -9007199254740991 AND 9007199254740991
    AND ((operation IN ('hold','release','capture')) = (hold_id IS NOT NULL))
    AND ((operation='refund') = (source_transaction_id IS NOT NULL))
    AND CASE
      WHEN operation IN ('topup','refund') THEN available_delta_kobo=amount_kobo AND held_delta_kobo=0
      WHEN operation IN ('debit','payout') THEN available_delta_kobo=-amount_kobo AND held_delta_kobo=0
      WHEN operation='hold' THEN available_delta_kobo=-amount_kobo AND held_delta_kobo=amount_kobo
      WHEN operation='release' THEN available_delta_kobo=amount_kobo AND held_delta_kobo=-amount_kobo
      WHEN operation='capture' THEN held_delta_kobo<0 AND available_delta_kobo>=0 AND available_delta_kobo::numeric+held_delta_kobo=-amount_kobo::numeric
      ELSE false END)
);

CREATE FUNCTION require_wallet_journal_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual_available numeric; actual_held numeric;
BEGIN
  IF NEW.wallet_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM ledger_entries e JOIN ledger_accounts a ON a.id=e.account_id WHERE e.transaction_id=NEW.id AND a.wallet_id IS NOT NULL AND a.wallet_id<>NEW.wallet_id) THEN
    RAISE EXCEPTION 'Journal contains another wallet' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(sum(CASE WHEN a.kind='available' THEN CASE WHEN e.side='credit' THEN e.amount_kobo::numeric ELSE -e.amount_kobo::numeric END ELSE 0 END),0),
         coalesce(sum(CASE WHEN a.kind='held' THEN CASE WHEN e.side='credit' THEN e.amount_kobo::numeric ELSE -e.amount_kobo::numeric END ELSE 0 END),0)
    INTO actual_available,actual_held FROM ledger_entries e JOIN ledger_accounts a ON a.id=e.account_id WHERE e.transaction_id=NEW.id AND a.wallet_id=NEW.wallet_id;
  IF actual_available<>NEW.available_delta_kobo OR actual_held<>NEW.held_delta_kobo THEN
    RAISE EXCEPTION 'Journal metadata differs from postings' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER wallet_journal_matches_postings AFTER INSERT ON ledger_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_wallet_journal_metadata();

CREATE FUNCTION guard_wallet_hold_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id<>OLD.id OR NEW.wallet_id<>OLD.wallet_id OR OLD.status<>'active' OR NEW.amount_kobo<OLD.amount_kobo OR (NEW.status<>'active' AND NEW.amount_kobo<>OLD.amount_kobo) THEN
    RAISE EXCEPTION 'Invalid wallet hold transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER wallet_holds_valid_transition BEFORE UPDATE ON wallet_holds FOR EACH ROW EXECUTE FUNCTION guard_wallet_hold_transition();
CREATE TRIGGER wallet_holds_no_delete BEFORE DELETE ON wallet_holds FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

CREATE FUNCTION require_wallet_funds_invariant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_wallet uuid; available numeric; held numeric; reserved numeric;
BEGIN
  IF TG_TABLE_NAME='wallet_holds' THEN target_wallet:=NEW.wallet_id;
  ELSE SELECT wallet_id INTO target_wallet FROM ledger_accounts WHERE id=NEW.account_id; END IF;
  IF target_wallet IS NULL THEN RETURN NEW; END IF;
  PERFORM id FROM wallets WHERE id=target_wallet FOR UPDATE;
  SELECT coalesce(sum(CASE WHEN a.kind='available' THEN CASE WHEN e.side='credit' THEN e.amount_kobo::numeric ELSE -e.amount_kobo::numeric END ELSE 0 END),0),
         coalesce(sum(CASE WHEN a.kind='held' THEN CASE WHEN e.side='credit' THEN e.amount_kobo::numeric ELSE -e.amount_kobo::numeric END ELSE 0 END),0)
    INTO available,held FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id=a.id WHERE a.wallet_id=target_wallet;
  SELECT coalesce(sum(amount_kobo::numeric),0) INTO reserved FROM wallet_holds WHERE wallet_id=target_wallet AND status='active';
  IF available<0 OR held<0 OR available+held>9007199254740991 OR held<>reserved THEN
    RAISE EXCEPTION 'Wallet balances must be nonnegative and match reservations' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER wallet_entries_funds_invariant AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_wallet_funds_invariant();
CREATE CONSTRAINT TRIGGER wallet_holds_funds_invariant AFTER INSERT OR UPDATE ON wallet_holds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_wallet_funds_invariant();
