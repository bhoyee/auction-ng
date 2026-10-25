CREATE FUNCTION guard_payment_funding_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.funding_method IS NOT NULL THEN
    IF ROW(NEW.user_id,NEW.wallet_id,NEW.provider,NEW.provider_ref,NEW.amount_kobo,NEW.fee_kobo,NEW.credit_kobo,NEW.currency,NEW.funding_method,NEW.fee_policy,NEW.card_type,NEW.initialization_key,NEW.consented_at)
       IS DISTINCT FROM ROW(OLD.user_id,OLD.wallet_id,OLD.provider,OLD.provider_ref,OLD.amount_kobo,OLD.fee_kobo,OLD.credit_kobo,OLD.currency,OLD.funding_method,OLD.fee_policy,OLD.card_type,OLD.initialization_key,OLD.consented_at) THEN
      RAISE EXCEPTION 'Accepted funding identity and amounts are immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.checkout_url_ciphertext IS NOT NULL AND NEW.checkout_url_ciphertext IS DISTINCT FROM OLD.checkout_url_ciphertext THEN
      RAISE EXCEPTION 'An issued checkout cannot be replaced' USING ERRCODE='23514';
    END IF;
    IF OLD.status='credited' AND NEW.status<>'credited' THEN
      RAISE EXCEPTION 'A credited payment cannot be downgraded' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payments_accepted_intent_immutable BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION guard_payment_funding_intent();
