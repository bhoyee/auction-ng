-- Owner-approved email eligibility. Revocation or replacement of a verified
-- email must fence outstanding Redis proofs before PostgreSQL can commit it.
CREATE OR REPLACE FUNCTION require_bid_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM bid_engine_runtime)
    AND current_setting('auction_ng.bid_fenced',true) IS DISTINCT FROM 'on' THEN
    IF TG_TABLE_NAME='auth_sessions' THEN
      IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'bid revocation fence required';
      END IF;
    ELSIF TG_TABLE_NAME='users' THEN
      IF NEW.role IS DISTINCT FROM OLD.role
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
        OR (OLD.email_verified_at IS NOT NULL AND (
          NEW.email_verified_at IS NULL
          OR NEW.email_hash IS DISTINCT FROM OLD.email_hash
        )) THEN
        RAISE EXCEPTION 'bid eligibility fence required';
      END IF;
    ELSE
      RAISE EXCEPTION 'bid strike fence required';
    END IF;
  END IF;
  RETURN NEW;
END $$;
