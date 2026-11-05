ALTER TABLE staff_credentials ALTER COLUMN totp_secret_ciphertext DROP NOT NULL;
ALTER TABLE auth_sessions ADD COLUMN staff_authenticated boolean NOT NULL DEFAULT false;
UPDATE auth_sessions SET staff_authenticated = true WHERE staff_mfa = true;
-- Existing staff explicitly enrolled under the previous mandatory policy retain protection.
UPDATE users u SET authenticator_enabled = true
FROM staff_credentials c WHERE c.user_id = u.id AND c.totp_secret_ciphertext IS NOT NULL;
