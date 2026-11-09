ALTER TABLE lots ADD COLUMN schedule_version integer NOT NULL DEFAULT 0 CHECK (schedule_version>=0), ADD COLUMN pre_bids_launching boolean NOT NULL DEFAULT false;
ALTER TABLE bid_funding_intents ADD COLUMN is_pre_bid boolean NOT NULL DEFAULT false;
ALTER TABLE bid_funding_intents ADD CONSTRAINT pre_bid_funding_shape CHECK(NOT is_pre_bid OR (id=request_key AND bid_mode='automatic' AND base_max_kobo IS NULL AND reserved_kobo=total_kobo AND hold_id IS NOT NULL));
CREATE INDEX lots_upcoming_start_idx ON lots(status,start_at,id);
CREATE TABLE pre_bids (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lot_id uuid NOT NULL REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 hold_id uuid NOT NULL UNIQUE REFERENCES wallet_holds(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 fee_version varchar(40) NOT NULL REFERENCES auction_fee_policies(version) ON DELETE RESTRICT ON UPDATE RESTRICT,
 max_kobo bigint NOT NULL CHECK(max_kobo BETWEEN 1 AND 9007199254740991),
 total_kobo bigint NOT NULL CHECK(total_kobo BETWEEN max_kobo AND 9007199254740991),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), schedule_version integer NOT NULL CHECK(schedule_version>=0),
 priority bigserial NOT NULL UNIQUE,
 status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','launching','accepted','outbid','cancelled','expired')),
 intent_id uuid UNIQUE REFERENCES bid_funding_intents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(lot_id,user_id),
 FOREIGN KEY(wallet_id,user_id) REFERENCES wallets(id,user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY(session_id,user_id) REFERENCES auth_sessions(id,user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY(hold_id,wallet_id) REFERENCES wallet_holds(id,wallet_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX pre_bids_launch_idx ON pre_bids(lot_id,status,priority,id);
CREATE INDEX pre_bids_reconcile_idx ON pre_bids(status,updated_at,id);
CREATE FUNCTION protect_pre_bid_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Pre-bid history cannot be deleted'; END IF;
 IF (NEW.id,NEW.lot_id,NEW.user_id,NEW.wallet_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.lot_id,OLD.user_id,OLD.wallet_id,OLD.created_at) THEN RAISE EXCEPTION 'Pre-bid identity is immutable'; END IF;
 IF OLD.intent_id IS NOT NULL AND NEW.intent_id IS DISTINCT FROM OLD.intent_id THEN RAISE EXCEPTION 'Launched pre-bid intent is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pre_bid_identity_guard BEFORE UPDATE OR DELETE ON pre_bids FOR EACH ROW EXECUTE FUNCTION protect_pre_bid_identity();
CREATE FUNCTION protect_pre_bid_contract() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item lots; funding bid_funding_intents; reservation wallet_holds;
BEGIN
 SELECT * INTO STRICT item FROM lots WHERE id=NEW.lot_id;
 SELECT * INTO STRICT reservation FROM wallet_holds WHERE id=NEW.hold_id;
 IF reservation.wallet_id<>NEW.wallet_id OR reservation.amount_kobo<>NEW.total_kobo THEN RAISE EXCEPTION 'Pre-bid must match its wallet reservation'; END IF;
 IF NEW.status IN ('active','launching') AND reservation.status<>'active' THEN RAISE EXCEPTION 'Active pre-bid needs reserved funds'; END IF;
 IF item.auction_fee_version IS DISTINCT FROM NEW.fee_version THEN RAISE EXCEPTION 'Pre-bid policy must match the locked auction'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.revision<OLD.revision OR NEW.fee_version<>OLD.fee_version THEN RAISE EXCEPTION 'Pre-bid policy and revision cannot be rewound'; END IF;
  IF OLD.intent_id IS NOT NULL AND (to_jsonb(NEW)-'status'-'updated_at'-'revision') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at'-'revision') THEN RAISE EXCEPTION 'Activated pre-bid contract is immutable'; END IF;
 END IF;
 IF NEW.status='active' AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.max_kobo<>OLD.max_kobo OR NEW.hold_id<>OLD.hold_id OR NEW.schedule_version<>OLD.schedule_version) THEN
  IF item.status<>'scheduled' OR item.pre_bids_launching OR item.start_at<=clock_timestamp() OR NEW.schedule_version<>item.schedule_version THEN RAISE EXCEPTION 'Pre-bid changes must precede launch'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.status='active' AND NEW.status='cancelled' AND item.status='scheduled' AND NEW.schedule_version=item.schedule_version AND item.start_at<=clock_timestamp() THEN RAISE EXCEPTION 'Buyer cancellation must precede launch'; END IF;
 IF NEW.intent_id IS NOT NULL THEN
  SELECT * INTO STRICT funding FROM bid_funding_intents WHERE id=NEW.intent_id;
  IF NOT funding.is_pre_bid OR (funding.id,funding.user_id,funding.lot_id,funding.wallet_id,funding.hold_id,funding.fee_version,funding.max_kobo,funding.total_kobo) IS DISTINCT FROM (NEW.id,NEW.user_id,NEW.lot_id,NEW.wallet_id,NEW.hold_id,NEW.fee_version,NEW.max_kobo,NEW.total_kobo) THEN RAISE EXCEPTION 'Pre-bid funding must match its reservation'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pre_bid_contract_guard BEFORE INSERT OR UPDATE ON pre_bids FOR EACH ROW EXECUTE FUNCTION protect_pre_bid_contract();
