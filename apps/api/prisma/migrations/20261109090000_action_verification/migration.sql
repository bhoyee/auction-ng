-- Owner-approved 2026-11-09: password + email code (+ authenticator) before
-- staff sign-in and buyer bidding, Buy Now and bid cancellation requests.

-- Buyer bidding stays unlocked on one session until this time.
ALTER TABLE auth_sessions ADD COLUMN bid_verified_until timestamptz(3);

-- Single-use action proofs: set once every factor passed, before the
-- protected action consumes the row.
ALTER TABLE account_security_challenges ADD COLUMN verified_at timestamptz(3);

ALTER TABLE account_security_challenges DROP CONSTRAINT account_security_challenges_purpose_check;
ALTER TABLE account_security_challenges ADD CONSTRAINT account_security_challenges_purpose_check CHECK (purpose IN ('enable','disable','rotate','recovery','change-password','action:bidding','action:buy-now','action:bid-cancellation'));

ALTER TABLE auth_challenges DROP CONSTRAINT auth_challenges_purpose_check;
ALTER TABLE auth_challenges ADD CONSTRAINT auth_challenges_purpose_check CHECK (purpose IN ('legacy','signup','login','reset','staff-recovery','staff-sign-in'));
