-- UUIDv4's first 40 bits are secure random bits, outside its fixed version/variant.
CREATE FUNCTION auction_reference_code() RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  entropy bit(40);
  code text;
  position integer;
BEGIN
  LOOP
    entropy := ('x' || left(replace(gen_random_uuid()::text, '-', ''), 10))::bit(40);
    code := '';
    FOR position IN 0..7 LOOP
      code := code || substr(alphabet, substring(entropy FROM position * 5 + 1 FOR 5)::integer + 1, 1);
    END LOOP;
    IF code ~ '[A-Z]' AND code ~ '[2-9]' THEN RETURN code; END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION next_auction_reference(kind text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  candidate text;
  attempt integer;
BEGIN
  IF kind NOT IN ('lot', 'invoice') OR kind IS NULL THEN
    RAISE EXCEPTION 'unknown reference kind' USING ERRCODE = '22023';
  END IF;
  FOR attempt IN 1..100 LOOP
    candidate := CASE kind WHEN 'lot' THEN 'LOT-' ELSE 'INV-' END || auction_reference_code();
    IF kind = 'lot' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(candidate, 707));
      IF NOT EXISTS (SELECT 1 FROM lots WHERE lot_number = candidate) THEN RETURN candidate; END IF;
    ELSE
      PERFORM pg_advisory_xact_lock(hashtextextended(candidate, 708));
      IF NOT EXISTS (SELECT 1 FROM invoices WHERE number = candidate) THEN RETURN candidate; END IF;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'reference allocation exhausted; retry the transaction' USING ERRCODE = '40001';
END;
$$;

-- Existing references and sequence objects are retained; new allocations use randomness.
