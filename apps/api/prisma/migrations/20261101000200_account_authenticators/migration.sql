ALTER TABLE users ADD COLUMN authenticator_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN authenticator_version integer NOT NULL DEFAULT 0 CHECK (authenticator_version >= 0);
ALTER TABLE auth_sessions ADD COLUMN authenticator_version integer NOT NULL DEFAULT 0 CHECK (authenticator_version >= 0);
ALTER TABLE auth_challenges DROP CONSTRAINT auth_challenges_purpose_check;
ALTER TABLE auth_challenges ADD CONSTRAINT auth_challenges_purpose_check CHECK (purpose IN ('legacy','signup','login','reset','staff-recovery'));
CREATE TABLE buyer_authenticators (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  secret_ciphertext bytea NOT NULL,
  last_counter bigint CHECK (last_counter >= 0),
  enabled_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE TABLE auth_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  code_hash varchar(64) NOT NULL UNIQUE,
  used_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX auth_recovery_codes_user_id_used_at_id_idx ON auth_recovery_codes(user_id, used_at, id);
CREATE TABLE account_security_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  purpose varchar(24) NOT NULL CHECK (purpose IN ('enable','disable','rotate','recovery','change-password')),
  payload_ciphertext bytea NOT NULL,
  code_hash varchar(64) NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  email_verified_at timestamptz(3),
  consumed_at timestamptz(3),
  expires_at timestamptz(3) NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX account_security_challenges_user_id_created_at_id_idx ON account_security_challenges(user_id, created_at, id);
CREATE INDEX account_security_challenges_session_id_idx ON account_security_challenges(session_id);
CREATE INDEX account_security_challenges_expires_at_id_idx ON account_security_challenges(expires_at, id);
