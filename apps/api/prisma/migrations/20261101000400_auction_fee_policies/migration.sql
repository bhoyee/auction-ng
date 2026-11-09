CREATE TABLE auction_fee_policies (
 version varchar(40) PRIMARY KEY,
 revision integer NOT NULL UNIQUE CHECK (revision BETWEEN 0 AND 2147483646),
 service_charge_enabled boolean NOT NULL, premium_bps integer NOT NULL CHECK (premium_bps BETWEEN 0 AND 10000),
 lot_fee_enabled boolean NOT NULL, lot_fee_kobo bigint NOT NULL CHECK (lot_fee_kobo BETWEEN 0 AND 9007199254740991),
 vat_enabled boolean NOT NULL, vat_bps integer NOT NULL CHECK (vat_bps BETWEEN 0 AND 10000),
 created_by_id uuid REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 created_at timestamptz(3) NOT NULL DEFAULT now()
);
INSERT INTO auction_fee_policies(version,revision,service_charge_enabled,premium_bps,lot_fee_enabled,lot_fee_kobo,vat_enabled,vat_bps)
VALUES ('auction-fees-v1',0,true,1500,true,30000,true,750);
CREATE TABLE auction_fee_controls (
 id integer PRIMARY KEY CHECK (id=1),
 current_version varchar(40) NOT NULL REFERENCES auction_fee_policies(version) ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO auction_fee_controls VALUES (1,'auction-fees-v1');
ALTER TABLE bid_funding_intents ADD CONSTRAINT bid_funding_intents_fee_version_fkey FOREIGN KEY (fee_version) REFERENCES auction_fee_policies(version) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE lot_settlements ADD CONSTRAINT lot_settlements_fee_version_fkey FOREIGN KEY (fee_version) REFERENCES auction_fee_policies(version) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE lots ADD COLUMN auction_fee_version varchar(40) REFERENCES auction_fee_policies(version) ON DELETE RESTRICT ON UPDATE RESTRICT;
UPDATE lots SET auction_fee_version='auction-fees-v1' WHERE EXISTS (SELECT 1 FROM bids WHERE bids.lot_id=lots.id) OR EXISTS (SELECT 1 FROM lot_settlements WHERE lot_settlements.lot_id=lots.id);
CREATE FUNCTION protect_auction_fee_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Auction fee policies are immutable'; END $$;
CREATE TRIGGER immutable_auction_fee_policy BEFORE UPDATE OR DELETE ON auction_fee_policies FOR EACH ROW EXECUTE FUNCTION protect_auction_fee_policy();
CREATE FUNCTION protect_lot_auction_fee_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.auction_fee_version IS NOT NULL AND NEW.auction_fee_version IS DISTINCT FROM OLD.auction_fee_version THEN
  RAISE EXCEPTION 'Accepted auction fees cannot change';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_lot_auction_fee_policy BEFORE UPDATE OF auction_fee_version ON lots FOR EACH ROW EXECUTE FUNCTION protect_lot_auction_fee_policy();
