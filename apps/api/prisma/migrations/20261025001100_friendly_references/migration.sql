CREATE SEQUENCE lot_reference_seq AS bigint;
CREATE SEQUENCE invoice_reference_seq AS bigint;

-- These references are presentation identifiers. UUID primary/foreign keys and
-- every ledger/bid retry key remain unchanged. Sequence values are never reused
-- after rollback; a missing number is preferable to an ambiguous reference.
CREATE FUNCTION next_auction_reference(kind text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE digits text; candidate text;
BEGIN
  IF kind NOT IN ('lot','invoice') OR kind IS NULL THEN
    RAISE EXCEPTION 'unknown reference kind' USING ERRCODE='22023';
  END IF;
  LOOP
    IF kind='lot' THEN
      digits := nextval('lot_reference_seq')::text;
      candidate := 'LOT-' || lpad(digits,greatest(6,length(digits)),'0');
      PERFORM pg_advisory_xact_lock(hashtextextended(candidate,707));
      IF NOT EXISTS (SELECT 1 FROM lots WHERE lot_number=candidate) THEN RETURN candidate; END IF;
    ELSE
      digits := nextval('invoice_reference_seq')::text;
      candidate := 'INV-' || lpad(digits,greatest(6,length(digits)),'0');
      IF NOT EXISTS (SELECT 1 FROM invoices WHERE number=candidate) THEN RETURN candidate; END IF;
    END IF;
  END LOOP;
END $$;

ALTER TABLE lots ALTER COLUMN lot_number SET DEFAULT next_auction_reference('lot');
ALTER TABLE invoices ALTER COLUMN number SET DEFAULT next_auction_reference('invoice');
