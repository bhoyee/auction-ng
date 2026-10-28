CREATE TABLE staff_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  password_hash text NOT NULL,
  totp_secret_ciphertext bytea NOT NULL,
  last_counter bigint CHECK (last_counter >= 0),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE auth_sessions ADD COLUMN staff_mfa boolean NOT NULL DEFAULT false;
