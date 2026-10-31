CREATE TABLE wallet_controls (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  deposits_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  withdrawals_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0 AND revision < 2147483647),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO wallet_controls (id) VALUES (1);
