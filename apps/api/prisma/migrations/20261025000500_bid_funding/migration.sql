CREATE TABLE bid_engine_runtime (
  namespace varchar(160) PRIMARY KEY,
  redis_run_id varchar(64) NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE bid_funding_intents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  lot_id uuid NOT NULL REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  hold_id uuid UNIQUE,
  group_id uuid NOT NULL,
  request_key uuid NOT NULL,
  request_hash varchar(64) NOT NULL,
  binding varchar(64) NOT NULL,
  namespace varchar(160) NOT NULL REFERENCES bid_engine_runtime(namespace) ON DELETE RESTRICT ON UPDATE RESTRICT,
  max_kobo bigint NOT NULL CHECK (max_kobo>0 AND max_kobo<=9007199254740991),
  total_kobo bigint NOT NULL CHECK (total_kobo>0 AND total_kobo<=9007199254740991),
  reserved_kobo bigint NOT NULL CHECK (reserved_kobo>=0 AND reserved_kobo<=total_kobo),
  base_max_kobo bigint CHECK (base_max_kobo>=0 AND base_max_kobo<max_kobo),
  fee_version varchar(40) NOT NULL,
  expires_at timestamptz(3) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','retained','released')),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_key),
  UNIQUE(hold_id,wallet_id),
  FOREIGN KEY(hold_id,wallet_id) REFERENCES wallet_holds(id,wallet_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK ((reserved_kobo=0 AND hold_id IS NULL) OR (reserved_kobo>0 AND hold_id IS NOT NULL))
);
CREATE INDEX bid_funding_pending_idx ON bid_funding_intents(namespace,status,expires_at,id);
CREATE INDEX bid_funding_group_idx ON bid_funding_intents(group_id,status,id);
CREATE INDEX bid_funding_session_idx ON bid_funding_intents(session_id,status,id);
CREATE INDEX bid_funding_lot_idx ON bid_funding_intents(lot_id,created_at,id);
CREATE INDEX bid_funding_wallet_idx ON bid_funding_intents(wallet_id,id);

-- Revocation must first fence Redis. Future staff suspension/strike writers must
-- use the same boundary; direct unfenced writes fail closed once bidding is initialized.
CREATE FUNCTION require_bid_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM bid_engine_runtime) AND current_setting('auction_ng.bid_fenced',true) IS DISTINCT FROM 'on' THEN
    IF TG_TABLE_NAME='auth_sessions' THEN
      IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'bid revocation fence required'; END IF;
    ELSIF TG_TABLE_NAME='users' THEN
      IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN RAISE EXCEPTION 'bid eligibility fence required'; END IF;
    ELSE
      RAISE EXCEPTION 'bid strike fence required';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER auth_sessions_bid_fence BEFORE UPDATE ON auth_sessions FOR EACH ROW EXECUTE FUNCTION require_bid_fence();
CREATE TRIGGER users_bid_fence BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION require_bid_fence();
CREATE TRIGGER strikes_bid_fence BEFORE INSERT OR UPDATE ON strikes FOR EACH ROW EXECUTE FUNCTION require_bid_fence();
