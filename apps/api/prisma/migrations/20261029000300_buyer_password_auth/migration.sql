ALTER TABLE users ADD COLUMN buyer_password_hash text, ADD COLUMN address_ciphertext bytea;
ALTER TABLE auth_sessions ADD COLUMN buyer_mfa boolean NOT NULL DEFAULT false;
ALTER TABLE auth_challenges ADD COLUMN purpose varchar(16) NOT NULL DEFAULT 'legacy' CHECK (purpose IN ('legacy','signup','login','reset')), ADD COLUMN password_hash text, ADD COLUMN pending_name varchar(120);
