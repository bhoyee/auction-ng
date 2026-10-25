CREATE TABLE bid_acceptances (
  id uuid PRIMARY KEY REFERENCES bid_funding_intents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  namespace varchar(160) NOT NULL REFERENCES bid_engine_runtime(namespace) ON DELETE RESTRICT ON UPDATE RESTRICT,
  stream_id varchar(80) NOT NULL CHECK (stream_id ~ '^[0-9]{1,20}-[0-9]{1,20}$'),
  fingerprint varchar(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  created_at timestamptz(3) NOT NULL,
  UNIQUE(namespace,stream_id)
);
ALTER TABLE bids
  ADD COLUMN acceptance_id uuid REFERENCES bid_acceptances(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN role varchar(16),
  ADD CONSTRAINT bids_acceptance_role CHECK ((acceptance_id IS NULL AND role IS NULL) OR (acceptance_id IS NOT NULL AND role IS NOT NULL AND role IN ('request','counter'))),
  ADD CONSTRAINT bids_acceptance_id_role_key UNIQUE(acceptance_id,role);
CREATE FUNCTION immutable_bid_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'accepted bid history is immutable'; END $$;
CREATE TRIGGER bids_immutable BEFORE UPDATE OR DELETE ON bids FOR EACH ROW EXECUTE FUNCTION immutable_bid_history();
CREATE TRIGGER bid_acceptances_immutable BEFORE UPDATE OR DELETE ON bid_acceptances FOR EACH ROW EXECUTE FUNCTION immutable_bid_history();
