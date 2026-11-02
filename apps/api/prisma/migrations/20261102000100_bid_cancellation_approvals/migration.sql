ALTER TABLE lots ADD COLUMN bid_round integer NOT NULL DEFAULT 0 CHECK(bid_round>=0);
ALTER TABLE support_conversations ADD COLUMN bid_cancellation_fee_consent_at timestamptz(3);
ALTER TABLE bid_funding_intents ADD COLUMN bid_round integer NOT NULL DEFAULT 0 CHECK(bid_round>=0);
CREATE TABLE bid_cancellation_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id uuid NOT NULL REFERENCES support_conversations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 lot_id uuid NOT NULL REFERENCES lots(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 buyer_id uuid NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 staff_id uuid NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 request_key uuid NOT NULL,request_hash varchar(64) NOT NULL,namespace varchar(160) NOT NULL,
 expected_stream_id varchar(80) NOT NULL,expected_fee_kobo bigint NOT NULL CHECK(expected_fee_kobo BETWEEN 0 AND 9007199254740991),
 fee_kobo bigint NOT NULL DEFAULT 0 CHECK(fee_kobo BETWEEN 0 AND 9007199254740991),
 price_kobo bigint NOT NULL DEFAULT 0 CHECK(price_kobo BETWEEN 0 AND 9007199254740991),
 premium_bps integer NOT NULL DEFAULT 0 CHECK(premium_bps BETWEEN 0 AND 10000),is_leader boolean NOT NULL DEFAULT false,
 status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','committed','completed','failed')),
 reason_ciphertext bytea NOT NULL,snapshot_ciphertext bytea,notice_cursor uuid,notices_complete boolean NOT NULL DEFAULT false,
 created_at timestamptz(3) NOT NULL DEFAULT now(),updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(staff_id,request_key)
);
CREATE UNIQUE INDEX bid_cancellation_one_active_conversation ON bid_cancellation_approvals(conversation_id) WHERE status<>'failed';
CREATE INDEX bid_cancellation_maintenance_idx ON bid_cancellation_approvals(status,updated_at,id);
CREATE INDEX bid_cancellation_buyer_idx ON bid_cancellation_approvals(lot_id,buyer_id,status);
CREATE INDEX bid_cancellation_conversation_idx ON bid_cancellation_approvals(conversation_id,status);
CREATE FUNCTION protect_bid_cancellation_approval() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Cancellation approvals are durable'; END IF;
 IF (NEW.id,NEW.conversation_id,NEW.lot_id,NEW.buyer_id,NEW.staff_id,NEW.request_key,NEW.request_hash,NEW.namespace,NEW.expected_stream_id,NEW.expected_fee_kobo,NEW.reason_ciphertext) IS DISTINCT FROM (OLD.id,OLD.conversation_id,OLD.lot_id,OLD.buyer_id,OLD.staff_id,OLD.request_key,OLD.request_hash,OLD.namespace,OLD.expected_stream_id,OLD.expected_fee_kobo,OLD.reason_ciphertext) THEN RAISE EXCEPTION 'Cancellation approval identity is immutable'; END IF;
 IF OLD.status IN ('committed','completed') AND (NEW.fee_kobo,NEW.price_kobo,NEW.premium_bps,NEW.is_leader,NEW.snapshot_ciphertext) IS DISTINCT FROM (OLD.fee_kobo,OLD.price_kobo,OLD.premium_bps,OLD.is_leader,OLD.snapshot_ciphertext) THEN RAISE EXCEPTION 'Committed cancellation contract is immutable'; END IF;
 IF (OLD.status='completed' AND NEW.status<>'completed') OR (OLD.status='committed' AND NEW.status NOT IN ('committed','completed')) OR (OLD.status='failed' AND NEW.status<>'failed') THEN RAISE EXCEPTION 'Cancellation state cannot rewind'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bid_cancellation_approval_guard BEFORE UPDATE OR DELETE ON bid_cancellation_approvals FOR EACH ROW EXECUTE FUNCTION protect_bid_cancellation_approval();
CREATE FUNCTION protect_bid_round_contract() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE current_round integer; BEGIN
 IF TG_OP='UPDATE' AND NEW.bid_round<>OLD.bid_round THEN RAISE EXCEPTION 'Funding round is immutable'; END IF;
 IF TG_OP='INSERT' THEN SELECT bid_round INTO current_round FROM lots WHERE id=NEW.lot_id;
  IF NEW.bid_round<>current_round THEN RAISE EXCEPTION 'Funding round must match its auction'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bid_round_contract_guard BEFORE INSERT OR UPDATE ON bid_funding_intents FOR EACH ROW EXECUTE FUNCTION protect_bid_round_contract();
