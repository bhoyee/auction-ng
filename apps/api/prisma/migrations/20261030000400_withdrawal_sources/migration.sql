BEGIN;
-- Existing source is deliberately unknown/review-only. Never rewrite old journals.
ALTER TABLE ledger_transactions ADD COLUMN bank_available_delta_kobo BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN bank_held_delta_kobo BIGINT NOT NULL DEFAULT 0;
ALTER TABLE wallet_holds ADD COLUMN bank_amount_kobo BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT wallet_hold_bank_amount CHECK(bank_amount_kobo BETWEEN 0 AND amount_kobo);
ALTER TABLE ledger_transactions ADD CONSTRAINT wallet_bank_delta_bounds CHECK (
  bank_available_delta_kobo BETWEEN -9007199254740991 AND 9007199254740991 AND
  bank_held_delta_kobo BETWEEN -9007199254740991 AND 9007199254740991);
CREATE FUNCTION require_bank_funding_invariant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; bank_available numeric; bank_held numeric; available numeric; held numeric; reserved numeric;
BEGIN
  target:=NEW.wallet_id; IF target IS NULL THEN RETURN NEW; END IF;
  PERFORM id FROM wallets WHERE id=target FOR UPDATE;
  SELECT coalesce(sum(bank_available_delta_kobo::numeric),0),coalesce(sum(bank_held_delta_kobo::numeric),0)
    INTO bank_available,bank_held FROM ledger_transactions WHERE wallet_id=target;
  SELECT coalesce(sum(CASE WHEN a.kind='available' THEN CASE WHEN e.side='credit' THEN e.amount_kobo::numeric ELSE -e.amount_kobo::numeric END ELSE 0 END),0),
    coalesce(sum(CASE WHEN a.kind='held' THEN CASE WHEN e.side='credit' THEN e.amount_kobo::numeric ELSE -e.amount_kobo::numeric END ELSE 0 END),0)
    INTO available,held FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id=a.id WHERE a.wallet_id=target;
  SELECT coalesce(sum(bank_amount_kobo::numeric),0) INTO reserved FROM wallet_holds WHERE wallet_id=target AND status='active';
  IF bank_available<0 OR bank_held<0 OR bank_available>available OR bank_held>held OR bank_held<>reserved THEN
    RAISE EXCEPTION 'Invalid bank funding allocation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER bank_funding_journal AFTER INSERT ON ledger_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_bank_funding_invariant();
CREATE CONSTRAINT TRIGGER bank_funding_hold AFTER INSERT OR UPDATE ON wallet_holds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_bank_funding_invariant();
COMMIT;
