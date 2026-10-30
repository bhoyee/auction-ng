BEGIN;
ALTER TABLE withdrawal_banks DROP CONSTRAINT withdrawal_banks_user_id_key;
ALTER TABLE withdrawal_banks DROP CONSTRAINT withdrawal_banks_customer_code_key;
ALTER TABLE withdrawal_banks ADD COLUMN is_current boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX withdrawal_banks_current_user_key ON withdrawal_banks(user_id) WHERE is_current;
CREATE INDEX withdrawal_banks_user_id_is_current_idx ON withdrawal_banks(user_id,is_current);
CREATE INDEX withdrawal_banks_customer_code_status_idx ON withdrawal_banks(customer_code,status);
CREATE TABLE withdrawal_bank_changes (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 session_id uuid NOT NULL, source_bank_id uuid NOT NULL, target_bank_id uuid,
 request_key uuid NOT NULL, request_hash varchar(64) NOT NULL,
 password_snapshot varchar(64) NOT NULL, bvn_hash varchar(64) NOT NULL,
 account_hash varchar(64) NOT NULL, details_ciphertext bytea NOT NULL,
 code_hash varchar(64) NOT NULL, code_ciphertext bytea NOT NULL,
 customer_code varchar(160), status varchar(24) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','verifying','complete','rejected','expired')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 expires_at timestamptz(3) NOT NULL, emailed_at timestamptz(3), confirmed_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,request_key),
 FOREIGN KEY(session_id,user_id) REFERENCES auth_sessions(id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(source_bank_id,user_id) REFERENCES withdrawal_banks(id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(target_bank_id,user_id) REFERENCES withdrawal_banks(id,user_id) ON DELETE RESTRICT,
 CHECK(status NOT IN ('verifying','complete') OR (target_bank_id IS NOT NULL AND confirmed_at IS NOT NULL))
);
CREATE UNIQUE INDEX withdrawal_bank_changes_active_user_key ON withdrawal_bank_changes(user_id) WHERE status IN ('draft','verifying');
CREATE INDEX withdrawal_bank_changes_customer_code_status_idx ON withdrawal_bank_changes(customer_code,status);
CREATE INDEX withdrawal_bank_changes_user_id_status_created_at_idx ON withdrawal_bank_changes(user_id,status,created_at);
CREATE FUNCTION guard_bank_change_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.user_id,NEW.session_id,NEW.source_bank_id,NEW.request_key,NEW.request_hash,NEW.password_snapshot,NEW.bvn_hash,NEW.account_hash,NEW.details_ciphertext,NEW.code_hash,NEW.code_ciphertext,NEW.expires_at,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.session_id,OLD.source_bank_id,OLD.request_key,OLD.request_hash,OLD.password_snapshot,OLD.bvn_hash,OLD.account_hash,OLD.details_ciphertext,OLD.code_hash,OLD.code_ciphertext,OLD.expires_at,OLD.created_at)
 THEN RAISE EXCEPTION 'Bank change contract is immutable'; END IF;
 IF (OLD.target_bank_id IS NOT NULL AND NEW.target_bank_id IS DISTINCT FROM OLD.target_bank_id)
 OR (OLD.customer_code IS NOT NULL AND NEW.customer_code IS DISTINCT FROM OLD.customer_code)
 OR (OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
 THEN RAISE EXCEPTION 'Bank change verification binding is immutable'; END IF;
 IF NOT (CASE OLD.status WHEN 'draft' THEN NEW.status IN ('draft','verifying','expired') WHEN 'verifying' THEN NEW.status IN ('verifying','complete','rejected') ELSE NEW.status=OLD.status END)
 THEN RAISE EXCEPTION 'Invalid bank change transition'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER bank_change_contract BEFORE UPDATE ON withdrawal_bank_changes FOR EACH ROW EXECUTE FUNCTION guard_bank_change_contract();
CREATE TRIGGER bank_change_no_delete BEFORE DELETE ON withdrawal_bank_changes FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE FUNCTION guard_current_withdrawal_bank() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.is_current IS DISTINCT FROM OLD.is_current THEN
  IF EXISTS(SELECT 1 FROM withdrawals WHERE user_id=NEW.user_id AND status IN ('review','queued','processing','pending')) THEN RAISE EXCEPTION 'An outstanding withdrawal protects the current bank'; END IF;
  IF NEW.is_current AND (NEW.status<>'verified' OR NOT EXISTS(SELECT 1 FROM withdrawal_bank_changes WHERE target_bank_id=NEW.id AND user_id=NEW.user_id AND status='verifying')) THEN RAISE EXCEPTION 'Bank change requires verified identity'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER withdrawal_bank_current_guard BEFORE UPDATE ON withdrawal_banks FOR EACH ROW EXECUTE FUNCTION guard_current_withdrawal_bank();
COMMIT;
