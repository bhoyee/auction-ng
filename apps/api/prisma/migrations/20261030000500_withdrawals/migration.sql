BEGIN;
CREATE TABLE withdrawal_banks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
 account_hash varchar(64) NOT NULL UNIQUE, details_ciphertext bytea NOT NULL,
 customer_code varchar(160) UNIQUE, recipient_code varchar(160),
 status varchar(24) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, verified_at timestamptz(3),
 CHECK ((status='verified')=(verified_at IS NOT NULL))
);
CREATE TABLE withdrawals (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
 bank_id uuid NOT NULL REFERENCES withdrawal_banks(id) ON DELETE RESTRICT,
 session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE RESTRICT,
 request_key uuid NOT NULL, request_hash varchar(64) NOT NULL,
 reference varchar(160) NOT NULL UNIQUE,
 amount_kobo bigint NOT NULL CHECK(amount_kobo BETWEEN 1 AND 9007199254740991),
 fee_kobo bigint NOT NULL CHECK(fee_kobo>=0), levy_kobo bigint NOT NULL CHECK(levy_kobo>=0),
 total_kobo bigint NOT NULL CHECK(total_kobo BETWEEN 1 AND 9007199254740991),
 hold_id uuid UNIQUE REFERENCES wallet_holds(id) ON DELETE RESTRICT,
 payout_id uuid REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
 status varchar(24) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','queued','processing','pending','success','failed','reversed','rejected')),
 review_required boolean NOT NULL DEFAULT false, password_snapshot text NOT NULL,
 code_hash varchar(64) NOT NULL, code_ciphertext bytea NOT NULL, emailed_at timestamptz(3), attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 expires_at timestamptz(3) NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 confirmed_at timestamptz(3), attempted_at timestamptz(3), checked_at timestamptz(3),
 UNIQUE(user_id,request_key), UNIQUE(hold_id,wallet_id),
 CHECK(total_kobo::numeric=amount_kobo::numeric+fee_kobo::numeric+levy_kobo::numeric),
 CHECK(status='draft' OR (hold_id IS NOT NULL AND confirmed_at IS NOT NULL)),
 FOREIGN KEY(wallet_id,user_id) REFERENCES wallets(id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(session_id,user_id) REFERENCES auth_sessions(id,user_id) ON DELETE RESTRICT
);
CREATE INDEX withdrawals_user_id_created_at_id_idx ON withdrawals(user_id,created_at,id);
CREATE INDEX withdrawals_user_id_confirmed_at_status_id_idx ON withdrawals(user_id,confirmed_at,status,id);
CREATE INDEX withdrawals_status_checked_at_id_idx ON withdrawals(status,checked_at,id);
CREATE FUNCTION guard_withdrawal_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at OR NEW.code_ciphertext IS DISTINCT FROM OLD.code_ciphertext THEN RAISE EXCEPTION 'Withdrawal identity is immutable'; END IF;
 IF ROW(NEW.user_id,NEW.wallet_id,NEW.bank_id,NEW.session_id,NEW.request_key,NEW.request_hash,NEW.reference,NEW.amount_kobo,NEW.fee_kobo,NEW.levy_kobo,NEW.total_kobo,NEW.password_snapshot,NEW.code_hash,NEW.expires_at)
 IS DISTINCT FROM ROW(OLD.user_id,OLD.wallet_id,OLD.bank_id,OLD.session_id,OLD.request_key,OLD.request_hash,OLD.reference,OLD.amount_kobo,OLD.fee_kobo,OLD.levy_kobo,OLD.total_kobo,OLD.password_snapshot,OLD.code_hash,OLD.expires_at) THEN RAISE EXCEPTION 'Withdrawal contract is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER withdrawals_immutable_contract BEFORE UPDATE ON withdrawals FOR EACH ROW EXECUTE FUNCTION guard_withdrawal_identity();
CREATE TRIGGER withdrawals_no_delete BEFORE DELETE ON withdrawals FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
ALTER TABLE withdrawal_banks ADD CONSTRAINT withdrawal_banks_id_user_key UNIQUE(id,user_id);
ALTER TABLE withdrawals ADD CONSTRAINT withdrawal_bank_owner FOREIGN KEY(bank_id,user_id) REFERENCES withdrawal_banks(id,user_id) ON DELETE RESTRICT,
 ADD CONSTRAINT withdrawal_hold_wallet FOREIGN KEY(hold_id,wallet_id) REFERENCES wallet_holds(id,wallet_id) ON DELETE RESTRICT,
 ADD CONSTRAINT withdrawal_payout_wallet FOREIGN KEY(payout_id,wallet_id) REFERENCES ledger_transactions(id,wallet_id) ON DELETE RESTRICT,
 ADD CONSTRAINT withdrawal_success_receipt CHECK(status<>'success' OR payout_id IS NOT NULL);
CREATE FUNCTION guard_withdrawal_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT (CASE OLD.status
 WHEN 'draft' THEN NEW.status IN ('draft','review','queued')
 WHEN 'review' THEN NEW.status IN ('review','queued','rejected')
 WHEN 'queued' THEN NEW.status IN ('queued','processing')
 WHEN 'processing' THEN NEW.status IN ('processing','pending','success','failed','reversed')
 WHEN 'pending' THEN NEW.status IN ('pending','success','failed','reversed')
 WHEN 'success' THEN NEW.status IN ('success','reversed')
 ELSE NEW.status=OLD.status END) THEN RAISE EXCEPTION 'Invalid withdrawal transition'; END IF;
 IF (OLD.hold_id IS NOT NULL AND NEW.hold_id IS DISTINCT FROM OLD.hold_id)
 OR (OLD.payout_id IS NOT NULL AND NEW.payout_id IS DISTINCT FROM OLD.payout_id)
 OR (OLD.confirmed_at IS NOT NULL AND (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.review_required IS DISTINCT FROM OLD.review_required))
 OR (OLD.attempted_at IS NOT NULL AND NEW.attempted_at IS DISTINCT FROM OLD.attempted_at)
 THEN RAISE EXCEPTION 'Withdrawal settlement binding is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER withdrawals_valid_state BEFORE UPDATE ON withdrawals FOR EACH ROW EXECUTE FUNCTION guard_withdrawal_state();
CREATE FUNCTION guard_withdrawal_bank() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Bank verification identity is immutable'; END IF;
 IF ROW(NEW.user_id,NEW.account_hash,NEW.details_ciphertext) IS DISTINCT FROM ROW(OLD.user_id,OLD.account_hash,OLD.details_ciphertext)
 OR (OLD.customer_code IS NOT NULL AND NEW.customer_code IS DISTINCT FROM OLD.customer_code)
 OR (OLD.recipient_code IS NOT NULL AND NEW.recipient_code IS DISTINCT FROM OLD.recipient_code)
 OR (OLD.status<>'pending' AND ROW(NEW.status,NEW.verified_at) IS DISTINCT FROM ROW(OLD.status,OLD.verified_at))
 THEN RAISE EXCEPTION 'Verified bank identity is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER withdrawal_bank_identity BEFORE UPDATE ON withdrawal_banks FOR EACH ROW EXECUTE FUNCTION guard_withdrawal_bank();
COMMIT;
