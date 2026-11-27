-- Bids, pre-bids and Buy Now need the account owner to confirm it's them
-- (password, email code, authenticator when on). The confirmation belongs to
-- one sign-in on one device and lasts 30 minutes, restarted by each bid.
ALTER TABLE auth_sessions ADD COLUMN purchase_unlocked_until timestamptz(3);
ALTER TABLE account_security_challenges DROP CONSTRAINT account_security_challenges_purpose_check;
ALTER TABLE account_security_challenges ADD CONSTRAINT account_security_challenges_purpose_check
  CHECK (purpose IN ('enable','disable','rotate','recovery','change-password','purchase-unlock'));
