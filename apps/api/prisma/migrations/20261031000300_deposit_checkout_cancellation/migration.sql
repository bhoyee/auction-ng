ALTER TABLE payments ADD COLUMN checkout_cancelled_at TIMESTAMPTZ(3);
ALTER TABLE payments ADD CONSTRAINT payments_checkout_cancellation_method CHECK (
  checkout_cancelled_at IS NULL OR (funding_method IS NOT NULL AND funding_method IN ('card','checkout_transfer') AND initialization_key IS NOT NULL)
);
CREATE FUNCTION guard_checkout_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.checkout_cancelled_at IS NOT NULL AND NEW.checkout_cancelled_at IS DISTINCT FROM OLD.checkout_cancelled_at THEN
    RAISE EXCEPTION 'Checkout cancellation cannot be removed or replaced';
  END IF;
  IF OLD.checkout_cancelled_at IS NULL AND NEW.checkout_cancelled_at IS NOT NULL AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending checkout can be cancelled';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER payments_checkout_cancellation_immutable BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION guard_checkout_cancellation();
