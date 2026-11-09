CREATE TABLE closing_cursors (
  namespace varchar(160) PRIMARY KEY REFERENCES bid_engine_runtime(namespace) ON DELETE RESTRICT ON UPDATE RESTRICT,
  stream_id varchar(80) NOT NULL DEFAULT '0-0'
);
CREATE TABLE lot_settlements (
  lot_id uuid PRIMARY KEY REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  namespace varchar(160) NOT NULL REFERENCES bid_engine_runtime(namespace) ON DELETE RESTRICT ON UPDATE RESTRICT,
  winner_id uuid REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  group_id uuid,
  hammer_kobo bigint CHECK (hammer_kobo>0 AND hammer_kobo<=9007199254740991),
  fee_version varchar(40) NOT NULL,
  stream_id varchar(80) NOT NULL,
  barrier_id varchar(80) NOT NULL,
  end_at timestamptz(3) NOT NULL,
  closed_at timestamptz(3) NOT NULL,
  snapshot jsonb NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'frozen' CHECK (status IN ('frozen','paid','unsold','payment_due','defaulted')),
  invoice_id uuid UNIQUE REFERENCES invoices(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  relist_lot_id uuid UNIQUE REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  payment_due_at timestamptz(3),
  last_error_at timestamptz(3),
  CHECK ((winner_id IS NULL AND group_id IS NULL AND hammer_kobo IS NULL) OR (winner_id IS NOT NULL AND group_id IS NOT NULL AND hammer_kobo IS NOT NULL)),
  CHECK (closed_at>=end_at),
  CHECK (status<>'paid' OR invoice_id IS NOT NULL),
  CHECK (status<>'payment_due' OR (invoice_id IS NOT NULL AND payment_due_at IS NOT NULL)),
  CHECK (status<>'defaulted' OR relist_lot_id IS NOT NULL)
);
CREATE INDEX lot_settlements_pending_idx ON lot_settlements(namespace,status,payment_due_at,lot_id);
ALTER TABLE notifications ADD COLUMN reference varchar(160) UNIQUE;
ALTER TABLE fulfilments ADD COLUMN qr_token_ciphertext bytea;
CREATE FUNCTION protect_lot_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'settlement history is immutable'; END IF;
  IF ROW(NEW.lot_id,NEW.namespace,NEW.winner_id,NEW.group_id,NEW.hammer_kobo,NEW.fee_version,NEW.stream_id,NEW.barrier_id,NEW.end_at,NEW.closed_at,NEW.snapshot)
    IS DISTINCT FROM ROW(OLD.lot_id,OLD.namespace,OLD.winner_id,OLD.group_id,OLD.hammer_kobo,OLD.fee_version,OLD.stream_id,OLD.barrier_id,OLD.end_at,OLD.closed_at,OLD.snapshot)
    THEN RAISE EXCEPTION 'frozen result is immutable'; END IF;
  IF OLD.status IN ('paid','unsold','defaulted') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'settlement is terminal'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lot_settlements_immutable BEFORE UPDATE OR DELETE ON lot_settlements FOR EACH ROW EXECUTE FUNCTION protect_lot_settlement();
