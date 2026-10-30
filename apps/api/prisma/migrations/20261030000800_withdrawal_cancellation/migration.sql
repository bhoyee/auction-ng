BEGIN;
ALTER TABLE withdrawals DROP CONSTRAINT withdrawals_status_check;
ALTER TABLE withdrawals ADD CONSTRAINT withdrawals_status_check CHECK(status IN ('draft','review','queued','processing','pending','success','failed','reversed','rejected','cancelled'));
ALTER TABLE withdrawals DROP CONSTRAINT withdrawals_check1;
ALTER TABLE withdrawals ADD CONSTRAINT withdrawals_reservation_state CHECK(status IN ('draft','cancelled') OR (hold_id IS NOT NULL AND confirmed_at IS NOT NULL));
CREATE OR REPLACE FUNCTION guard_withdrawal_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT (CASE OLD.status
 WHEN 'draft' THEN NEW.status IN ('draft','review','queued','cancelled')
 WHEN 'review' THEN NEW.status IN ('review','queued','rejected','cancelled')
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
COMMIT;
