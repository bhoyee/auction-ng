ALTER TABLE lots ADD COLUMN fixed_price_kobo bigint
  CHECK (fixed_price_kobo BETWEEN 1 AND 9007199254740991);
CREATE TABLE purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  wallet_id uuid NOT NULL,
  namespace varchar(160) NOT NULL REFERENCES bid_engine_runtime(namespace) ON DELETE RESTRICT ON UPDATE RESTRICT,
  request_key uuid NOT NULL,
  method varchar(24) NOT NULL CHECK (method IN ('wallet','local_card','international_card','bank_transfer')),
  status varchar(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','cancelled')),
  price_kobo bigint NOT NULL CHECK (price_kobo BETWEEN 1 AND 9007199254740991),
  tax_kobo bigint NOT NULL CHECK (tax_kobo BETWEEN 0 AND 9007199254740991),
  total_kobo bigint NOT NULL CHECK (total_kobo BETWEEN 1 AND 9007199254740991 AND total_kobo = price_kobo::numeric + tax_kobo),
  amount_kobo bigint NOT NULL CHECK (amount_kobo BETWEEN 1 AND 9007199254740991),
  processing_fee_kobo bigint NOT NULL CHECK (processing_fee_kobo BETWEEN 0 AND 9007199254740991),
  credit_kobo bigint NOT NULL CHECK (credit_kobo BETWEEN 1 AND 9007199254740991 AND credit_kobo = amount_kobo::numeric - processing_fee_kobo AND credit_kobo >= total_kobo),
  expires_at timestamptz(3) NOT NULL,
  provider_ref varchar(160) NOT NULL UNIQUE,
  initialization_attempted_at timestamptz(3),
  checkout_url_ciphertext bytea,
  verified_at timestamptz(3),
  credited_at timestamptz(3),
  invoice_id uuid UNIQUE REFERENCES invoices(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_key),
  FOREIGN KEY(wallet_id,user_id) REFERENCES wallets(id,user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (status <> 'paid' OR invoice_id IS NOT NULL),
  CHECK (method <> 'wallet' OR (processing_fee_kobo = 0 AND amount_kobo = total_kobo))
);
CREATE UNIQUE INDEX purchases_active_lot_idx ON purchases(lot_id) WHERE status IN ('pending','paid');
CREATE INDEX purchases_recovery_idx ON purchases(namespace,status,expires_at,id);
CREATE INDEX purchases_buyer_idx ON purchases(user_id,created_at,id);
CREATE INDEX purchases_wallet_idx ON purchases(wallet_id);
CREATE FUNCTION protect_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'purchase history is immutable'; END IF;
  IF ROW(NEW.id,NEW.lot_id,NEW.user_id,NEW.wallet_id,NEW.namespace,NEW.request_key,NEW.method,NEW.price_kobo,NEW.tax_kobo,NEW.total_kobo,NEW.amount_kobo,NEW.processing_fee_kobo,NEW.credit_kobo,NEW.provider_ref,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.lot_id,OLD.user_id,OLD.wallet_id,OLD.namespace,OLD.request_key,OLD.method,OLD.price_kobo,OLD.tax_kobo,OLD.total_kobo,OLD.amount_kobo,OLD.processing_fee_kobo,OLD.credit_kobo,OLD.provider_ref,OLD.created_at)
    THEN RAISE EXCEPTION 'purchase amounts and ownership are immutable'; END IF;
  IF OLD.status='paid' AND (NEW.status<>'paid' OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id) THEN RAISE EXCEPTION 'paid purchase is terminal'; END IF;
  IF OLD.status IN ('expired','cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'expired purchase cannot reopen'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER purchases_immutable BEFORE UPDATE OR DELETE ON purchases FOR EACH ROW EXECUTE FUNCTION protect_purchase();
