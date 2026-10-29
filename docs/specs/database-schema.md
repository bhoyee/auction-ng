# Database schema

Generated from the migrated PostgreSQL catalog with `pnpm db:docs`. All application tables, including staff credentials, immutable lot settlements and contiguous closing cursors, are listed below. `_prisma_migrations` is maintained by Prisma and is not an application table.

Entity IDs are UUIDs; the authentication rate-limit primary key is a keyed hash. Times use `timestamp(3) with time zone` (UTC storage; WAT formatting belongs at the UI edge). Every foreign key uses RESTRICT on deletion and updates. PostgreSQL primary keys and unique constraints include backing unique indexes. Nullable unique columns allow multiple NULLs.

Money is integer kobo in bigint columns; non-ledger amounts and total wallet funds are constrained to JavaScript safe integers. Ledger postings use bigint without conversion to number. Wallet balances are derived from ledger accounts; there is no balance column to edit. Ledger journals have an operation-level unique idempotency key and postings have their own unique keys. Only `apps/api/src/ledger` may write ledger tables. T05 owns money operations and available-funds checks; see [wallet contracts](wallet-ledger.md).

Sensitive values use versioned AES-256-GCM envelopes in bytea columns. Keyed SHA-256 hashes support equality lookup and uniqueness without storing plaintext phone/BVN/email values. Pickup passes have a lookup hash and an authenticated encrypted token for buyer retrieval. Notification payloads are encrypted.

Statuses and role vocabulary are defined only in `packages/shared/src/database-values.ts` and frozen into each migration’s CHECK constraints. The demo seed creates draft lots and unverified fictional users; it does not fund wallets or create ledger records.

## audit_log

| Column            | PostgreSQL type             | Nullable | Default           |
| ----------------- | --------------------------- | -------- | ----------------- |
| id                | uuid                        | No       | gen_random_uuid() |
| actor_id          | uuid                        | Yes      | —                 |
| action            | character varying(80)       | No       | —                 |
| entity_type       | character varying(80)       | No       | —                 |
| entity_id         | character varying(160)      | No       | —                 |
| before_ciphertext | bytea                       | Yes      | —                 |
| after_ciphertext  | bytea                       | Yes      | —                 |
| created_at        | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP |

Relations and constraints:

- `audit_log_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `audit_log_pkey`: `PRIMARY KEY (id)`

Indexes (including those backing primary/unique keys):

- `audit_log_actor_id_created_at_id_idx`: `CREATE INDEX audit_log_actor_id_created_at_id_idx ON public.audit_log USING btree (actor_id, created_at, id)`
- `audit_log_entity_type_entity_id_created_at_id_idx`: `CREATE INDEX audit_log_entity_type_entity_id_created_at_id_idx ON public.audit_log USING btree (entity_type, entity_id, created_at, id)`
- `audit_log_pkey`: `CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id)`

## auth_challenges

| Column           | PostgreSQL type             | Nullable | Default           |
| ---------------- | --------------------------- | -------- | ----------------- |
| id               | uuid                        | No       | —                 |
| email_hash       | character varying(64)       | No       | —                 |
| email_ciphertext | bytea                       | No       | —                 |
| code_hash        | character varying(64)       | No       | —                 |
| device_hash      | character varying(64)       | No       | —                 |
| client           | character varying(8)        | No       | —                 |
| attempts         | integer                     | No       | 0                 |
| consumed_at      | timestamp(3) with time zone | Yes      | —                 |
| expires_at       | timestamp(3) with time zone | No       | —                 |
| created_at       | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP |

Relations and constraints:

- `auth_challenges_attempts`: `CHECK (attempts >= 0 AND attempts <= 5)`
- `auth_challenges_client`: `CHECK (client::text = ANY (ARRAY['web'::character varying, 'mobile'::character varying]::text[]))`
- `auth_challenges_expiry`: `CHECK (expires_at > created_at)`
- `auth_challenges_pkey`: `PRIMARY KEY (id)`

Indexes (including those backing primary/unique keys):

- `auth_challenges_email_hash_created_at_id_idx`: `CREATE INDEX auth_challenges_email_hash_created_at_id_idx ON public.auth_challenges USING btree (email_hash, created_at, id)`
- `auth_challenges_expires_at_id_idx`: `CREATE INDEX auth_challenges_expires_at_id_idx ON public.auth_challenges USING btree (expires_at, id)`
- `auth_challenges_pkey`: `CREATE UNIQUE INDEX auth_challenges_pkey ON public.auth_challenges USING btree (id)`

## auth_rate_limits

| Column     | PostgreSQL type             | Nullable | Default |
| ---------- | --------------------------- | -------- | ------- |
| key        | character varying(64)       | No       | —       |
| count      | integer                     | No       | —       |
| expires_at | timestamp(3) with time zone | No       | —       |

Relations and constraints:

- `auth_rate_limits_count`: `CHECK (count >= 1 AND count <= 1000000)`
- `auth_rate_limits_pkey`: `PRIMARY KEY (key)`

Indexes (including those backing primary/unique keys):

- `auth_rate_limits_expires_at_idx`: `CREATE INDEX auth_rate_limits_expires_at_idx ON public.auth_rate_limits USING btree (expires_at)`
- `auth_rate_limits_pkey`: `CREATE UNIQUE INDEX auth_rate_limits_pkey ON public.auth_rate_limits USING btree (key)`

## auth_sessions

| Column            | PostgreSQL type             | Nullable | Default           |
| ----------------- | --------------------------- | -------- | ----------------- |
| id                | uuid                        | No       | gen_random_uuid() |
| user_id           | uuid                        | No       | —                 |
| family_id         | uuid                        | No       | —                 |
| device_hash       | character varying(64)       | No       | —                 |
| client            | character varying(8)        | No       | —                 |
| access_hash       | character varying(64)       | No       | —                 |
| refresh_hash      | character varying(64)       | No       | —                 |
| access_expires_at | timestamp(3) with time zone | No       | —                 |
| expires_at        | timestamp(3) with time zone | No       | —                 |
| revoked_at        | timestamp(3) with time zone | Yes      | —                 |
| created_at        | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP |
| staff_mfa         | boolean                     | No       | false             |

Relations and constraints:

- `auth_sessions_client`: `CHECK (client::text = ANY (ARRAY['web'::character varying, 'mobile'::character varying]::text[]))`
- `auth_sessions_expiry`: `CHECK (expires_at > created_at AND access_expires_at > created_at)`
- `auth_sessions_id_user_id_key`: `UNIQUE (id, user_id)`
- `auth_sessions_pkey`: `PRIMARY KEY (id)`
- `auth_sessions_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `auth_sessions_access_hash_key`: `CREATE UNIQUE INDEX auth_sessions_access_hash_key ON public.auth_sessions USING btree (access_hash)`
- `auth_sessions_expires_at_id_idx`: `CREATE INDEX auth_sessions_expires_at_id_idx ON public.auth_sessions USING btree (expires_at, id)`
- `auth_sessions_family_id_id_idx`: `CREATE INDEX auth_sessions_family_id_id_idx ON public.auth_sessions USING btree (family_id, id)`
- `auth_sessions_id_user_id_key`: `CREATE UNIQUE INDEX auth_sessions_id_user_id_key ON public.auth_sessions USING btree (id, user_id)`
- `auth_sessions_pkey`: `CREATE UNIQUE INDEX auth_sessions_pkey ON public.auth_sessions USING btree (id)`
- `auth_sessions_refresh_hash_key`: `CREATE UNIQUE INDEX auth_sessions_refresh_hash_key ON public.auth_sessions USING btree (refresh_hash)`
- `auth_sessions_user_id_created_at_id_idx`: `CREATE INDEX auth_sessions_user_id_created_at_id_idx ON public.auth_sessions USING btree (user_id, created_at, id)`

## bid_acceptances

| Column      | PostgreSQL type             | Nullable | Default |
| ----------- | --------------------------- | -------- | ------- |
| id          | uuid                        | No       | —       |
| namespace   | character varying(160)      | No       | —       |
| stream_id   | character varying(80)       | No       | —       |
| fingerprint | character varying(64)       | No       | —       |
| result      | jsonb                       | No       | —       |
| created_at  | timestamp(3) with time zone | No       | —       |

Relations and constraints:

- `bid_acceptances_fingerprint_check`: `CHECK (fingerprint::text ~ '^[a-f0-9]{64}$'::text)`
- `bid_acceptances_id_fkey`: `FOREIGN KEY (id) REFERENCES bid_funding_intents(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `bid_acceptances_namespace_fkey`: `FOREIGN KEY (namespace) REFERENCES bid_engine_runtime(namespace) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `bid_acceptances_namespace_stream_id_key`: `UNIQUE (namespace, stream_id)`
- `bid_acceptances_pkey`: `PRIMARY KEY (id)`
- `bid_acceptances_result_check`: `CHECK (jsonb_typeof(result) = 'object'::text)`
- `bid_acceptances_stream_id_check`: `CHECK (stream_id::text ~ '^[0-9]{1,20}-[0-9]{1,20}$'::text)`

Indexes (including those backing primary/unique keys):

- `bid_acceptances_namespace_stream_id_key`: `CREATE UNIQUE INDEX bid_acceptances_namespace_stream_id_key ON public.bid_acceptances USING btree (namespace, stream_id)`
- `bid_acceptances_pkey`: `CREATE UNIQUE INDEX bid_acceptances_pkey ON public.bid_acceptances USING btree (id)`

## bid_engine_runtime

| Column       | PostgreSQL type             | Nullable | Default |
| ------------ | --------------------------- | -------- | ------- |
| namespace    | character varying(160)      | No       | —       |
| redis_run_id | character varying(64)       | No       | —       |
| created_at   | timestamp(3) with time zone | No       | now()   |

Relations and constraints:

- `bid_engine_runtime_pkey`: `PRIMARY KEY (namespace)`

Indexes (including those backing primary/unique keys):

- `bid_engine_runtime_pkey`: `CREATE UNIQUE INDEX bid_engine_runtime_pkey ON public.bid_engine_runtime USING btree (namespace)`

## bid_funding_intents

| Column        | PostgreSQL type             | Nullable | Default                        |
| ------------- | --------------------------- | -------- | ------------------------------ |
| id            | uuid                        | No       | —                              |
| user_id       | uuid                        | No       | —                              |
| session_id    | uuid                        | No       | —                              |
| wallet_id     | uuid                        | No       | —                              |
| lot_id        | uuid                        | No       | —                              |
| hold_id       | uuid                        | Yes      | —                              |
| group_id      | uuid                        | No       | —                              |
| request_key   | uuid                        | No       | —                              |
| request_hash  | character varying(64)       | No       | —                              |
| binding       | character varying(64)       | No       | —                              |
| namespace     | character varying(160)      | No       | —                              |
| max_kobo      | bigint                      | No       | —                              |
| total_kobo    | bigint                      | No       | —                              |
| reserved_kobo | bigint                      | No       | —                              |
| base_max_kobo | bigint                      | Yes      | —                              |
| fee_version   | character varying(40)       | No       | —                              |
| expires_at    | timestamp(3) with time zone | No       | —                              |
| status        | character varying(16)       | No       | 'pending'::character varying   |
| created_at    | timestamp(3) with time zone | No       | now()                          |
| bid_mode      | character varying(16)       | No       | 'automatic'::character varying |

Relations and constraints:

- `bid_funding_intents_check`: `CHECK (reserved_kobo >= 0 AND reserved_kobo <= total_kobo)`
- `bid_funding_intents_check1`: `CHECK (base_max_kobo >= 0 AND base_max_kobo < max_kobo)`
- `bid_funding_intents_check2`: `CHECK (reserved_kobo = 0 AND hold_id IS NULL OR reserved_kobo > 0 AND hold_id IS NOT NULL)`
- `bid_funding_intents_hold_id_key`: `UNIQUE (hold_id)`
- `bid_funding_intents_hold_id_wallet_id_fkey`: `FOREIGN KEY (hold_id, wallet_id) REFERENCES wallet_holds(id, wallet_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `bid_funding_intents_hold_id_wallet_id_key`: `UNIQUE (hold_id, wallet_id)`
- `bid_funding_intents_lot_id_fkey`: `FOREIGN KEY (lot_id) REFERENCES lots(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `bid_funding_intents_max_kobo_check`: `CHECK (max_kobo > 0 AND max_kobo <= '9007199254740991'::bigint)`
- `bid_funding_intents_namespace_fkey`: `FOREIGN KEY (namespace) REFERENCES bid_engine_runtime(namespace) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `bid_funding_intents_pkey`: `PRIMARY KEY (id)`
- `bid_funding_intents_session_id_fkey`: `FOREIGN KEY (session_id) REFERENCES auth_sessions(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `bid_funding_intents_status_check`: `CHECK (status::text = ANY (ARRAY['pending'::character varying, 'retained'::character varying, 'released'::character varying]::text[]))`
- `bid_funding_intents_total_kobo_check`: `CHECK (total_kobo > 0 AND total_kobo <= '9007199254740991'::bigint)`
- `bid_funding_intents_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `bid_funding_intents_user_id_request_key_key`: `UNIQUE (user_id, request_key)`
- `bid_funding_intents_wallet_id_fkey`: `FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `bid_funding_mode_allowed`: `CHECK (bid_mode::text = ANY (ARRAY['direct'::character varying, 'automatic'::character varying]::text[]))`
- `bid_intents_owned_session_fk`: `FOREIGN KEY (session_id, user_id) REFERENCES auth_sessions(id, user_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `bid_intents_owned_wallet_fk`: `FOREIGN KEY (wallet_id, user_id) REFERENCES wallets(id, user_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `bid_funding_group_idx`: `CREATE INDEX bid_funding_group_idx ON public.bid_funding_intents USING btree (group_id, status, id)`
- `bid_funding_intents_hold_id_key`: `CREATE UNIQUE INDEX bid_funding_intents_hold_id_key ON public.bid_funding_intents USING btree (hold_id)`
- `bid_funding_intents_hold_id_wallet_id_key`: `CREATE UNIQUE INDEX bid_funding_intents_hold_id_wallet_id_key ON public.bid_funding_intents USING btree (hold_id, wallet_id)`
- `bid_funding_intents_pkey`: `CREATE UNIQUE INDEX bid_funding_intents_pkey ON public.bid_funding_intents USING btree (id)`
- `bid_funding_intents_user_id_request_key_key`: `CREATE UNIQUE INDEX bid_funding_intents_user_id_request_key_key ON public.bid_funding_intents USING btree (user_id, request_key)`
- `bid_funding_lot_idx`: `CREATE INDEX bid_funding_lot_idx ON public.bid_funding_intents USING btree (lot_id, created_at, id)`
- `bid_funding_pending_idx`: `CREATE INDEX bid_funding_pending_idx ON public.bid_funding_intents USING btree (namespace, status, expires_at, id)`
- `bid_funding_poll_idx`: `CREATE INDEX bid_funding_poll_idx ON public.bid_funding_intents USING btree (namespace, id) WHERE ((status)::text <> 'released'::text)`
- `bid_funding_session_idx`: `CREATE INDEX bid_funding_session_idx ON public.bid_funding_intents USING btree (session_id, status, id)`
- `bid_funding_user_created_idx`: `CREATE INDEX bid_funding_user_created_idx ON public.bid_funding_intents USING btree (user_id, created_at, id)`
- `bid_funding_wallet_idx`: `CREATE INDEX bid_funding_wallet_idx ON public.bid_funding_intents USING btree (wallet_id, id)`

## bids

| Column          | PostgreSQL type             | Nullable | Default           |
| --------------- | --------------------------- | -------- | ----------------- |
| id              | uuid                        | No       | gen_random_uuid() |
| lot_id          | uuid                        | No       | —                 |
| user_id         | uuid                        | No       | —                 |
| amount_kobo     | bigint                      | No       | —                 |
| max_kobo        | bigint                      | No       | —                 |
| is_proxy        | boolean                     | No       | false             |
| idempotency_key | character varying(160)      | No       | —                 |
| stream_id       | character varying(80)       | Yes      | —                 |
| created_at      | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP |
| acceptance_id   | uuid                        | Yes      | —                 |
| role            | character varying(16)       | Yes      | —                 |

Relations and constraints:

- `bids_acceptance_id_fkey`: `FOREIGN KEY (acceptance_id) REFERENCES bid_acceptances(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `bids_acceptance_id_role_key`: `UNIQUE (acceptance_id, role)`
- `bids_acceptance_role`: `CHECK (acceptance_id IS NULL AND role IS NULL OR acceptance_id IS NOT NULL AND role IS NOT NULL AND (role::text = ANY (ARRAY['request'::character varying, 'counter'::character varying]::text[])))`
- `bids_amount_kobo_safe`: `CHECK (amount_kobo >= 0 AND amount_kobo <= '9007199254740991'::bigint)`
- `bids_lot_id_fkey`: `FOREIGN KEY (lot_id) REFERENCES lots(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `bids_max_kobo_safe`: `CHECK (max_kobo >= 0 AND max_kobo <= '9007199254740991'::bigint)`
- `bids_pkey`: `PRIMARY KEY (id)`
- `bids_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `bids_valid_max`: `CHECK (amount_kobo > 0 AND max_kobo >= amount_kobo)`

Indexes (including those backing primary/unique keys):

- `bids_acceptance_id_role_key`: `CREATE UNIQUE INDEX bids_acceptance_id_role_key ON public.bids USING btree (acceptance_id, role)`
- `bids_idempotency_key_key`: `CREATE UNIQUE INDEX bids_idempotency_key_key ON public.bids USING btree (idempotency_key)`
- `bids_lot_id_amount_kobo_idx`: `CREATE INDEX bids_lot_id_amount_kobo_idx ON public.bids USING btree (lot_id, amount_kobo DESC)`
- `bids_lot_id_created_at_id_idx`: `CREATE INDEX bids_lot_id_created_at_id_idx ON public.bids USING btree (lot_id, created_at, id)`
- `bids_pkey`: `CREATE UNIQUE INDEX bids_pkey ON public.bids USING btree (id)`
- `bids_stream_id_key`: `CREATE UNIQUE INDEX bids_stream_id_key ON public.bids USING btree (stream_id)`
- `bids_user_id_created_at_id_idx`: `CREATE INDEX bids_user_id_created_at_id_idx ON public.bids USING btree (user_id, created_at, id)`
- `bids_user_lot_history_idx`: `CREATE INDEX bids_user_lot_history_idx ON public.bids USING btree (user_id, lot_id, created_at, id)`

## categories

| Column    | PostgreSQL type        | Nullable | Default           |
| --------- | ---------------------- | -------- | ----------------- |
| id        | uuid                   | No       | gen_random_uuid() |
| name      | character varying(100) | No       | —                 |
| slug      | character varying(120) | No       | —                 |
| parent_id | uuid                   | Yes      | —                 |

Relations and constraints:

- `categories_not_own_parent`: `CHECK (parent_id IS DISTINCT FROM id)`
- `categories_parent_id_fkey`: `FOREIGN KEY (parent_id) REFERENCES categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `categories_pkey`: `PRIMARY KEY (id)`

Indexes (including those backing primary/unique keys):

- `categories_parent_id_id_idx`: `CREATE INDEX categories_parent_id_id_idx ON public.categories USING btree (parent_id, id)`
- `categories_pkey`: `CREATE UNIQUE INDEX categories_pkey ON public.categories USING btree (id)`
- `categories_slug_key`: `CREATE UNIQUE INDEX categories_slug_key ON public.categories USING btree (slug)`

## closing_cursors

| Column    | PostgreSQL type        | Nullable | Default                  |
| --------- | ---------------------- | -------- | ------------------------ |
| namespace | character varying(160) | No       | —                        |
| stream_id | character varying(80)  | No       | '0-0'::character varying |

Relations and constraints:

- `closing_cursors_namespace_fkey`: `FOREIGN KEY (namespace) REFERENCES bid_engine_runtime(namespace) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `closing_cursors_pkey`: `PRIMARY KEY (namespace)`

Indexes (including those backing primary/unique keys):

- `closing_cursors_pkey`: `CREATE UNIQUE INDEX closing_cursors_pkey ON public.closing_cursors USING btree (namespace)`

## fulfilments

| Column                      | PostgreSQL type             | Nullable | Default                      |
| --------------------------- | --------------------------- | -------- | ---------------------------- |
| id                          | uuid                        | No       | gen_random_uuid()            |
| invoice_id                  | uuid                        | No       | —                            |
| user_id                     | uuid                        | No       | —                            |
| location_id                 | uuid                        | No       | —                            |
| type                        | character varying(24)       | No       | 'pickup'::character varying  |
| status                      | character varying(24)       | No       | 'pending'::character varying |
| slot_at                     | timestamp(3) with time zone | Yes      | —                            |
| qr_token_hash               | character varying(64)       | Yes      | —                            |
| delivery_address_ciphertext | bytea                       | Yes      | —                            |
| courier                     | character varying(80)       | Yes      | —                            |
| tracking_number_ciphertext  | bytea                       | Yes      | —                            |
| collected_at                | timestamp(3) with time zone | Yes      | —                            |
| created_at                  | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP            |
| qr_token_ciphertext         | bytea                       | Yes      | —                            |

Relations and constraints:

- `fulfilments_invoice_id_user_id_fkey`: `FOREIGN KEY (invoice_id, user_id) REFERENCES invoices(id, user_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fulfilments_location_id_fkey`: `FOREIGN KEY (location_id) REFERENCES locations(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fulfilments_pkey`: `PRIMARY KEY (id)`
- `fulfilments_status_allowed`: `CHECK (status::text = ANY (ARRAY['pending'::character varying, 'booked'::character varying, 'ready'::character varying, 'collected'::character varying, 'in_transit'::character varying, 'delivered'::character varying, 'cancelled'::character varying]::text[]))`
- `fulfilments_type_allowed`: `CHECK (type::text = ANY (ARRAY['pickup'::character varying, 'delivery'::character varying]::text[]))`
- `fulfilments_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `fulfilments_invoice_id_key`: `CREATE UNIQUE INDEX fulfilments_invoice_id_key ON public.fulfilments USING btree (invoice_id)`
- `fulfilments_invoice_id_user_id_key`: `CREATE UNIQUE INDEX fulfilments_invoice_id_user_id_key ON public.fulfilments USING btree (invoice_id, user_id)`
- `fulfilments_location_id_slot_at_id_idx`: `CREATE INDEX fulfilments_location_id_slot_at_id_idx ON public.fulfilments USING btree (location_id, slot_at, id)`
- `fulfilments_pkey`: `CREATE UNIQUE INDEX fulfilments_pkey ON public.fulfilments USING btree (id)`
- `fulfilments_qr_token_hash_key`: `CREATE UNIQUE INDEX fulfilments_qr_token_hash_key ON public.fulfilments USING btree (qr_token_hash)`
- `fulfilments_user_id_created_at_id_idx`: `CREATE INDEX fulfilments_user_id_created_at_id_idx ON public.fulfilments USING btree (user_id, created_at, id)`

## idempotency_keys

| Column              | PostgreSQL type             | Nullable | Default                      |
| ------------------- | --------------------------- | -------- | ---------------------------- |
| id                  | uuid                        | No       | gen_random_uuid()            |
| user_id             | uuid                        | Yes      | —                            |
| scope               | character varying(80)       | No       | —                            |
| key                 | character varying(160)      | No       | —                            |
| request_hash        | character varying(64)       | No       | —                            |
| response_ciphertext | bytea                       | Yes      | —                            |
| status              | character varying(24)       | No       | 'pending'::character varying |
| created_at          | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP            |
| expires_at          | timestamp(3) with time zone | Yes      | —                            |

Relations and constraints:

- `idempotency_keys_pkey`: `PRIMARY KEY (id)`
- `idempotency_keys_status_allowed`: `CHECK (status::text = ANY (ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying]::text[]))`
- `idempotency_keys_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `idempotency_keys_expires_at_id_idx`: `CREATE INDEX idempotency_keys_expires_at_id_idx ON public.idempotency_keys USING btree (expires_at, id)`
- `idempotency_keys_pkey`: `CREATE UNIQUE INDEX idempotency_keys_pkey ON public.idempotency_keys USING btree (id)`
- `idempotency_keys_scope_key_key`: `CREATE UNIQUE INDEX idempotency_keys_scope_key_key ON public.idempotency_keys USING btree (scope, key)`
- `idempotency_keys_user_id_created_at_id_idx`: `CREATE INDEX idempotency_keys_user_id_created_at_id_idx ON public.idempotency_keys USING btree (user_id, created_at, id)`

## image_uploads

| Column       | PostgreSQL type             | Nullable | Default                      |
| ------------ | --------------------------- | -------- | ---------------------------- |
| id           | uuid                        | No       | gen_random_uuid()            |
| lot_id       | uuid                        | No       | —                            |
| actor_id     | uuid                        | No       | —                            |
| request_key  | character varying(80)       | No       | —                            |
| object_key   | character varying(200)      | No       | —                            |
| content_type | character varying(24)       | No       | —                            |
| size_bytes   | integer                     | No       | —                            |
| sha256       | character varying(64)       | No       | —                            |
| sort_order   | integer                     | No       | —                            |
| status       | character varying(16)       | No       | 'pending'::character varying |
| expires_at   | timestamp(3) with time zone | No       | —                            |
| created_at   | timestamp(3) with time zone | No       | now()                        |

Relations and constraints:

- `image_uploads_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `image_uploads_lot_id_fkey`: `FOREIGN KEY (lot_id) REFERENCES lots(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `image_uploads_metadata_check`: `CHECK ((content_type::text = ANY (ARRAY['image/jpeg'::character varying, 'image/png'::character varying, 'image/webp'::character varying]::text[])) AND size_bytes >= 1 AND size_bytes <= 8388608 AND sha256::text ~ '^[a-f0-9]{64}$'::text AND sort_order >= 0 AND sort_order <= 19 AND (status::text = ANY (ARRAY['pending'::character varying, 'ready'::character varying]::text[])) AND expires_at > created_at)`
- `image_uploads_pkey`: `PRIMARY KEY (id)`

Indexes (including those backing primary/unique keys):

- `image_uploads_lot_id_status_expires_at_idx`: `CREATE INDEX image_uploads_lot_id_status_expires_at_idx ON public.image_uploads USING btree (lot_id, status, expires_at)`
- `image_uploads_object_key_key`: `CREATE UNIQUE INDEX image_uploads_object_key_key ON public.image_uploads USING btree (object_key)`
- `image_uploads_pkey`: `CREATE UNIQUE INDEX image_uploads_pkey ON public.image_uploads USING btree (id)`
- `image_uploads_request_key_key`: `CREATE UNIQUE INDEX image_uploads_request_key_key ON public.image_uploads USING btree (request_key)`

## invoice_lines

| Column       | PostgreSQL type | Nullable | Default           |
| ------------ | --------------- | -------- | ----------------- |
| id           | uuid            | No       | gen_random_uuid() |
| invoice_id   | uuid            | No       | —                 |
| lot_id       | uuid            | No       | —                 |
| hammer_kobo  | bigint          | No       | —                 |
| premium_kobo | bigint          | No       | —                 |
| lot_fee_kobo | bigint          | No       | —                 |
| vat_kobo     | bigint          | No       | —                 |
| total_kobo   | bigint          | No       | —                 |

Relations and constraints:

- `invoice_lines_hammer_kobo_safe`: `CHECK (hammer_kobo >= 0 AND hammer_kobo <= '9007199254740991'::bigint)`
- `invoice_lines_invoice_id_fkey`: `FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `invoice_lines_lot_fee_kobo_safe`: `CHECK (lot_fee_kobo >= 0 AND lot_fee_kobo <= '9007199254740991'::bigint)`
- `invoice_lines_lot_id_fkey`: `FOREIGN KEY (lot_id) REFERENCES lots(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `invoice_lines_pkey`: `PRIMARY KEY (id)`
- `invoice_lines_premium_kobo_safe`: `CHECK (premium_kobo >= 0 AND premium_kobo <= '9007199254740991'::bigint)`
- `invoice_lines_total_kobo_safe`: `CHECK (total_kobo >= 0 AND total_kobo <= '9007199254740991'::bigint)`
- `invoice_lines_total_matches`: `CHECK (total_kobo::numeric = (hammer_kobo::numeric + premium_kobo::numeric + lot_fee_kobo::numeric + vat_kobo::numeric))`
- `invoice_lines_vat_kobo_safe`: `CHECK (vat_kobo >= 0 AND vat_kobo <= '9007199254740991'::bigint)`

Indexes (including those backing primary/unique keys):

- `invoice_lines_invoice_id_id_idx`: `CREATE INDEX invoice_lines_invoice_id_id_idx ON public.invoice_lines USING btree (invoice_id, id)`
- `invoice_lines_lot_id_key`: `CREATE UNIQUE INDEX invoice_lines_lot_id_key ON public.invoice_lines USING btree (lot_id)`
- `invoice_lines_pkey`: `CREATE UNIQUE INDEX invoice_lines_pkey ON public.invoice_lines USING btree (id)`

## invoices

| Column            | PostgreSQL type             | Nullable | Default                                 |
| ----------------- | --------------------------- | -------- | --------------------------------------- |
| id                | uuid                        | No       | gen_random_uuid()                       |
| number            | character varying(40)       | No       | next_auction_reference('invoice'::text) |
| user_id           | uuid                        | No       | —                                       |
| hammer_total_kobo | bigint                      | No       | —                                       |
| premium_kobo      | bigint                      | No       | —                                       |
| lot_fee_kobo      | bigint                      | No       | —                                       |
| vat_kobo          | bigint                      | No       | —                                       |
| total_kobo        | bigint                      | No       | —                                       |
| currency          | character varying(3)        | No       | 'NGN'::character varying                |
| status            | character varying(24)       | No       | 'pending'::character varying            |
| created_at        | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP                       |

Relations and constraints:

- `invoices_currency_ngn`: `CHECK (currency::text = 'NGN'::text)`
- `invoices_hammer_total_kobo_safe`: `CHECK (hammer_total_kobo >= 0 AND hammer_total_kobo <= '9007199254740991'::bigint)`
- `invoices_lot_fee_kobo_safe`: `CHECK (lot_fee_kobo >= 0 AND lot_fee_kobo <= '9007199254740991'::bigint)`
- `invoices_pkey`: `PRIMARY KEY (id)`
- `invoices_premium_kobo_safe`: `CHECK (premium_kobo >= 0 AND premium_kobo <= '9007199254740991'::bigint)`
- `invoices_status_allowed`: `CHECK (status::text = ANY (ARRAY['pending'::character varying, 'paid'::character varying, 'refunded'::character varying, 'cancelled'::character varying]::text[]))`
- `invoices_total_kobo_safe`: `CHECK (total_kobo >= 0 AND total_kobo <= '9007199254740991'::bigint)`
- `invoices_total_matches`: `CHECK (total_kobo::numeric = (hammer_total_kobo::numeric + premium_kobo::numeric + lot_fee_kobo::numeric + vat_kobo::numeric))`
- `invoices_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `invoices_vat_kobo_safe`: `CHECK (vat_kobo >= 0 AND vat_kobo <= '9007199254740991'::bigint)`

Indexes (including those backing primary/unique keys):

- `invoices_buyer_status_history_idx`: `CREATE INDEX invoices_buyer_status_history_idx ON public.invoices USING btree (user_id, status, created_at, id)`
- `invoices_id_user_id_key`: `CREATE UNIQUE INDEX invoices_id_user_id_key ON public.invoices USING btree (id, user_id)`
- `invoices_number_key`: `CREATE UNIQUE INDEX invoices_number_key ON public.invoices USING btree (number)`
- `invoices_pkey`: `CREATE UNIQUE INDEX invoices_pkey ON public.invoices USING btree (id)`
- `invoices_status_created_at_id_idx`: `CREATE INDEX invoices_status_created_at_id_idx ON public.invoices USING btree (status, created_at, id)`
- `invoices_user_id_created_at_id_idx`: `CREATE INDEX invoices_user_id_created_at_id_idx ON public.invoices USING btree (user_id, created_at, id)`

## ledger_accounts

| Column     | PostgreSQL type             | Nullable | Default                  |
| ---------- | --------------------------- | -------- | ------------------------ |
| id         | uuid                        | No       | gen_random_uuid()        |
| code       | character varying(120)      | No       | —                        |
| wallet_id  | uuid                        | Yes      | —                        |
| kind       | character varying(24)       | No       | —                        |
| currency   | character varying(3)        | No       | 'NGN'::character varying |
| created_at | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP        |

Relations and constraints:

- `ledger_accounts_currency_ngn`: `CHECK (currency::text = 'NGN'::text)`
- `ledger_accounts_kind_allowed`: `CHECK (kind::text = ANY (ARRAY['available'::character varying, 'held'::character varying, 'system'::character varying]::text[]))`
- `ledger_accounts_pkey`: `PRIMARY KEY (id)`
- `ledger_accounts_wallet_id_fkey`: `FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `ledger_accounts_wallet_kind`: `CHECK (kind::text = 'system'::text AND wallet_id IS NULL OR (kind::text = ANY (ARRAY['available'::character varying, 'held'::character varying]::text[])) AND wallet_id IS NOT NULL)`

Indexes (including those backing primary/unique keys):

- `ledger_accounts_code_key`: `CREATE UNIQUE INDEX ledger_accounts_code_key ON public.ledger_accounts USING btree (code)`
- `ledger_accounts_pkey`: `CREATE UNIQUE INDEX ledger_accounts_pkey ON public.ledger_accounts USING btree (id)`
- `ledger_accounts_wallet_id_kind_key`: `CREATE UNIQUE INDEX ledger_accounts_wallet_id_kind_key ON public.ledger_accounts USING btree (wallet_id, kind)`

## ledger_entries

| Column          | PostgreSQL type             | Nullable | Default           |
| --------------- | --------------------------- | -------- | ----------------- |
| id              | uuid                        | No       | gen_random_uuid() |
| transaction_id  | uuid                        | No       | —                 |
| account_id      | uuid                        | No       | —                 |
| amount_kobo     | bigint                      | No       | —                 |
| side            | character varying(6)        | No       | —                 |
| idempotency_key | character varying(200)      | No       | —                 |
| created_at      | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP |

Relations and constraints:

- `ledger_entries_account_id_fkey`: `FOREIGN KEY (account_id) REFERENCES ledger_accounts(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `ledger_entries_balanced`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `ledger_entries_pkey`: `PRIMARY KEY (id)`
- `ledger_entries_positive_amount`: `CHECK (amount_kobo > 0)`
- `ledger_entries_side_allowed`: `CHECK (side::text = ANY (ARRAY['debit'::character varying, 'credit'::character varying]::text[]))`
- `ledger_entries_transaction_id_fkey`: `FOREIGN KEY (transaction_id) REFERENCES ledger_transactions(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `wallet_entries_funds_invariant`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`

Indexes (including those backing primary/unique keys):

- `ledger_entries_account_id_created_at_id_idx`: `CREATE INDEX ledger_entries_account_id_created_at_id_idx ON public.ledger_entries USING btree (account_id, created_at, id)`
- `ledger_entries_idempotency_key_key`: `CREATE UNIQUE INDEX ledger_entries_idempotency_key_key ON public.ledger_entries USING btree (idempotency_key)`
- `ledger_entries_pkey`: `CREATE UNIQUE INDEX ledger_entries_pkey ON public.ledger_entries USING btree (id)`
- `ledger_entries_transaction_id_idx`: `CREATE INDEX ledger_entries_transaction_id_idx ON public.ledger_entries USING btree (transaction_id)`

## ledger_transactions

| Column                | PostgreSQL type             | Nullable | Default                  |
| --------------------- | --------------------------- | -------- | ------------------------ |
| id                    | uuid                        | No       | gen_random_uuid()        |
| idempotency_key       | character varying(160)      | No       | —                        |
| reference             | character varying(160)      | No       | —                        |
| type                  | character varying(24)       | No       | —                        |
| currency              | character varying(3)        | No       | 'NGN'::character varying |
| writer_xid            | bigint                      | No       | txid_current()           |
| created_at            | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP        |
| amount_kobo           | bigint                      | Yes      | —                        |
| available_delta_kobo  | bigint                      | Yes      | —                        |
| held_delta_kobo       | bigint                      | Yes      | —                        |
| hold_id               | uuid                        | Yes      | —                        |
| operation             | character varying(24)       | Yes      | —                        |
| request_hash          | character varying(64)       | Yes      | —                        |
| source_transaction_id | uuid                        | Yes      | —                        |
| wallet_id             | uuid                        | Yes      | —                        |

Relations and constraints:

- `ledger_transaction_balanced`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `ledger_transactions_currency_ngn`: `CHECK (currency::text = 'NGN'::text)`
- `ledger_transactions_hold_id_wallet_id_fkey`: `FOREIGN KEY (hold_id, wallet_id) REFERENCES wallet_holds(id, wallet_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `ledger_transactions_pkey`: `PRIMARY KEY (id)`
- `ledger_transactions_source_transaction_id_wallet_id_fkey`: `FOREIGN KEY (source_transaction_id, wallet_id) REFERENCES ledger_transactions(id, wallet_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `ledger_transactions_type_allowed`: `CHECK (type::text = ANY (ARRAY['topup'::character varying, 'hold'::character varying, 'release'::character varying, 'debit'::character varying, 'refund'::character varying, 'payout'::character varying]::text[]))`
- `ledger_transactions_wallet_id_fkey`: `FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `wallet_journal_matches_postings`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `wallet_journal_metadata`: `CHECK (wallet_id IS NULL AND operation IS NULL AND amount_kobo IS NULL AND request_hash IS NULL AND available_delta_kobo IS NULL AND held_delta_kobo IS NULL AND hold_id IS NULL AND source_transaction_id IS NULL OR wallet_id IS NOT NULL AND operation IS NOT NULL AND amount_kobo IS NOT NULL AND request_hash IS NOT NULL AND available_delta_kobo IS NOT NULL AND held_delta_kobo IS NOT NULL AND amount_kobo >= 1 AND amount_kobo <= '9007199254740991'::bigint AND request_hash::text ~ '^[a-f0-9]{64}$'::text AND (operation::text = ANY (ARRAY['topup'::character varying, 'hold'::character varying, 'release'::character varying, 'capture'::character varying, 'debit'::character varying, 'refund'::character varying, 'payout'::character varying]::text[])) AND type::text = CASE WHEN operation::text = 'capture'::text THEN 'debit'::character varying ELSE operation END::text AND available_delta_kobo >= '-9007199254740991'::bigint AND available_delta_kobo <= '9007199254740991'::bigint AND held_delta_kobo >= '-9007199254740991'::bigint AND held_delta_kobo <= '9007199254740991'::bigint AND (operation::text = ANY (ARRAY['hold'::character varying, 'release'::character varying, 'capture'::character varying]::text[])) = (hold_id IS NOT NULL) AND (operation::text = 'refund'::text) = (source_transaction_id IS NOT NULL) AND CASE WHEN operation::text = ANY (ARRAY['topup'::character varying, 'refund'::character varying]::text[]) THEN available_delta_kobo = amount_kobo AND held_delta_kobo = 0 WHEN operation::text = ANY (ARRAY['debit'::character varying, 'payout'::character varying]::text[]) THEN available_delta_kobo = (- amount_kobo) AND held_delta_kobo = 0 WHEN operation::text = 'hold'::text THEN available_delta_kobo = (- amount_kobo) AND held_delta_kobo = amount_kobo WHEN operation::text = 'release'::text THEN available_delta_kobo = amount_kobo AND held_delta_kobo = (- amount_kobo) WHEN operation::text = 'capture'::text THEN held_delta_kobo < 0 AND available_delta_kobo >= 0 AND (available_delta_kobo::numeric + held_delta_kobo::numeric) = (- amount_kobo::numeric) ELSE false END)`

Indexes (including those backing primary/unique keys):

- `ledger_transactions_created_at_id_idx`: `CREATE INDEX ledger_transactions_created_at_id_idx ON public.ledger_transactions USING btree (created_at, id)`
- `ledger_transactions_hold_id_wallet_id_idx`: `CREATE INDEX ledger_transactions_hold_id_wallet_id_idx ON public.ledger_transactions USING btree (hold_id, wallet_id)`
- `ledger_transactions_id_wallet_id_key`: `CREATE UNIQUE INDEX ledger_transactions_id_wallet_id_key ON public.ledger_transactions USING btree (id, wallet_id)`
- `ledger_transactions_idempotency_key_key`: `CREATE UNIQUE INDEX ledger_transactions_idempotency_key_key ON public.ledger_transactions USING btree (idempotency_key)`
- `ledger_transactions_pkey`: `CREATE UNIQUE INDEX ledger_transactions_pkey ON public.ledger_transactions USING btree (id)`
- `ledger_transactions_reference_key`: `CREATE UNIQUE INDEX ledger_transactions_reference_key ON public.ledger_transactions USING btree (reference)`
- `ledger_transactions_source_transaction_id_wallet_id_idx`: `CREATE INDEX ledger_transactions_source_transaction_id_wallet_id_idx ON public.ledger_transactions USING btree (source_transaction_id, wallet_id)`
- `ledger_transactions_wallet_id_created_at_id_idx`: `CREATE INDEX ledger_transactions_wallet_id_created_at_id_idx ON public.ledger_transactions USING btree (wallet_id, created_at, id)`

## locations

| Column            | PostgreSQL type             | Nullable | Default           |
| ----------------- | --------------------------- | -------- | ----------------- |
| id                | uuid                        | No       | gen_random_uuid() |
| code              | character varying(32)       | No       | —                 |
| name              | character varying(120)      | No       | —                 |
| address           | text                        | No       | —                 |
| hours             | jsonb                       | No       | —                 |
| capacity_per_slot | integer                     | No       | —                 |
| created_at        | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP |

Relations and constraints:

- `locations_pkey`: `PRIMARY KEY (id)`
- `locations_positive_capacity`: `CHECK (capacity_per_slot > 0)`

Indexes (including those backing primary/unique keys):

- `locations_code_key`: `CREATE UNIQUE INDEX locations_code_key ON public.locations USING btree (code)`
- `locations_pkey`: `CREATE UNIQUE INDEX locations_pkey ON public.locations USING btree (id)`

## lot_images

| Column          | PostgreSQL type | Nullable | Default           |
| --------------- | --------------- | -------- | ----------------- |
| id              | uuid            | No       | gen_random_uuid() |
| lot_id          | uuid            | No       | —                 |
| url             | text            | No       | —                 |
| sort_order      | integer         | No       | —                 |
| thumbnail_url   | text            | Yes      | —                 |
| width           | integer         | Yes      | —                 |
| height          | integer         | Yes      | —                 |
| thumbnail_bytes | integer         | Yes      | —                 |

Relations and constraints:

- `lot_images_derivatives_check`: `CHECK (thumbnail_url IS NULL AND width IS NULL AND height IS NULL AND thumbnail_bytes IS NULL OR thumbnail_url IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND thumbnail_bytes IS NOT NULL AND thumbnail_url ~~ 'https://%'::text AND url ~~ 'https://%'::text AND width >= 1 AND width <= 960 AND height >= 1 AND height <= 960 AND thumbnail_bytes >= 1 AND thumbnail_bytes <= 30000)`
- `lot_images_lot_id_fkey`: `FOREIGN KEY (lot_id) REFERENCES lots(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `lot_images_nonnegative_order`: `CHECK (sort_order >= 0)`
- `lot_images_pkey`: `PRIMARY KEY (id)`

Indexes (including those backing primary/unique keys):

- `lot_images_lot_id_sort_order_key`: `CREATE UNIQUE INDEX lot_images_lot_id_sort_order_key ON public.lot_images USING btree (lot_id, sort_order)`
- `lot_images_pkey`: `CREATE UNIQUE INDEX lot_images_pkey ON public.lot_images USING btree (id)`

## lot_settlements

| Column         | PostgreSQL type             | Nullable | Default                     |
| -------------- | --------------------------- | -------- | --------------------------- |
| lot_id         | uuid                        | No       | —                           |
| namespace      | character varying(160)      | No       | —                           |
| winner_id      | uuid                        | Yes      | —                           |
| group_id       | uuid                        | Yes      | —                           |
| hammer_kobo    | bigint                      | Yes      | —                           |
| fee_version    | character varying(40)       | No       | —                           |
| stream_id      | character varying(80)       | No       | —                           |
| barrier_id     | character varying(80)       | No       | —                           |
| end_at         | timestamp(3) with time zone | No       | —                           |
| closed_at      | timestamp(3) with time zone | No       | —                           |
| snapshot       | jsonb                       | No       | —                           |
| status         | character varying(24)       | No       | 'frozen'::character varying |
| invoice_id     | uuid                        | Yes      | —                           |
| relist_lot_id  | uuid                        | Yes      | —                           |
| payment_due_at | timestamp(3) with time zone | Yes      | —                           |
| last_error_at  | timestamp(3) with time zone | Yes      | —                           |

Relations and constraints:

- `lot_settlements_check`: `CHECK (winner_id IS NULL AND group_id IS NULL AND hammer_kobo IS NULL OR winner_id IS NOT NULL AND group_id IS NOT NULL AND hammer_kobo IS NOT NULL)`
- `lot_settlements_check1`: `CHECK (closed_at >= end_at)`
- `lot_settlements_check2`: `CHECK (status::text <> 'paid'::text OR invoice_id IS NOT NULL)`
- `lot_settlements_check3`: `CHECK (status::text <> 'payment_due'::text OR invoice_id IS NOT NULL AND payment_due_at IS NOT NULL)`
- `lot_settlements_check4`: `CHECK (status::text <> 'defaulted'::text OR relist_lot_id IS NOT NULL)`
- `lot_settlements_hammer_kobo_check`: `CHECK (hammer_kobo > 0 AND hammer_kobo <= '9007199254740991'::bigint)`
- `lot_settlements_invoice_id_fkey`: `FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `lot_settlements_invoice_id_key`: `UNIQUE (invoice_id)`
- `lot_settlements_lot_id_fkey`: `FOREIGN KEY (lot_id) REFERENCES lots(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `lot_settlements_namespace_fkey`: `FOREIGN KEY (namespace) REFERENCES bid_engine_runtime(namespace) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `lot_settlements_pkey`: `PRIMARY KEY (lot_id)`
- `lot_settlements_relist_lot_id_fkey`: `FOREIGN KEY (relist_lot_id) REFERENCES lots(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `lot_settlements_relist_lot_id_key`: `UNIQUE (relist_lot_id)`
- `lot_settlements_status_check`: `CHECK (status::text = ANY (ARRAY['frozen'::character varying, 'paid'::character varying, 'unsold'::character varying, 'payment_due'::character varying, 'defaulted'::character varying]::text[]))`
- `lot_settlements_winner_id_fkey`: `FOREIGN KEY (winner_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `lot_settlements_invoice_id_key`: `CREATE UNIQUE INDEX lot_settlements_invoice_id_key ON public.lot_settlements USING btree (invoice_id)`
- `lot_settlements_pending_idx`: `CREATE INDEX lot_settlements_pending_idx ON public.lot_settlements USING btree (namespace, status, payment_due_at, lot_id)`
- `lot_settlements_pkey`: `CREATE UNIQUE INDEX lot_settlements_pkey ON public.lot_settlements USING btree (lot_id)`
- `lot_settlements_relist_lot_id_key`: `CREATE UNIQUE INDEX lot_settlements_relist_lot_id_key ON public.lot_settlements USING btree (relist_lot_id)`
- `lot_settlements_unsold_review_idx`: `CREATE INDEX lot_settlements_unsold_review_idx ON public.lot_settlements USING btree (lot_id) WHERE (((status)::text = 'unsold'::text) AND (relist_lot_id IS NULL))`

## lots

| Column              | PostgreSQL type             | Nullable | Default                             |
| ------------------- | --------------------------- | -------- | ----------------------------------- |
| id                  | uuid                        | No       | gen_random_uuid()                   |
| lot_number          | character varying(40)       | No       | next_auction_reference('lot'::text) |
| title               | character varying(200)      | No       | —                                   |
| description         | text                        | No       | —                                   |
| condition           | character varying(24)       | No       | —                                   |
| retail_price_kobo   | bigint                      | No       | —                                   |
| start_price_kobo    | bigint                      | No       | —                                   |
| category_id         | uuid                        | No       | —                                   |
| location_id         | uuid                        | No       | —                                   |
| start_at            | timestamp(3) with time zone | No       | —                                   |
| end_at              | timestamp(3) with time zone | No       | —                                   |
| status              | character varying(24)       | No       | 'draft'::character varying          |
| created_at          | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP                   |
| updated_at          | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP                   |
| is_top_deal         | boolean                     | No       | false                               |
| top_deal_order      | integer                     | No       | 0                                   |
| auto_relist_enabled | boolean                     | No       | true                                |
| auto_relist_count   | integer                     | No       | 0                                   |
| fixed_price_kobo    | bigint                      | Yes      | —                                   |

Relations and constraints:

- `lots_auto_relist_count_check`: `CHECK (auto_relist_count >= 0 AND auto_relist_count <= 2)`
- `lots_category_id_fkey`: `FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `lots_condition_allowed`: `CHECK (condition::text = ANY (ARRAY['new'::character varying, 'like_new'::character varying, 'open_box'::character varying, 'damaged'::character varying, 'untested'::character varying]::text[]))`
- `lots_fixed_price_kobo_check`: `CHECK (fixed_price_kobo >= 1 AND fixed_price_kobo <= '9007199254740991'::bigint)`
- `lots_location_id_fkey`: `FOREIGN KEY (location_id) REFERENCES locations(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `lots_pkey`: `PRIMARY KEY (id)`
- `lots_positive_start`: `CHECK (start_price_kobo > 0)`
- `lots_retail_price_kobo_safe`: `CHECK (retail_price_kobo >= 0 AND retail_price_kobo <= '9007199254740991'::bigint)`
- `lots_start_price_kobo_safe`: `CHECK (start_price_kobo >= 0 AND start_price_kobo <= '9007199254740991'::bigint)`
- `lots_status_allowed`: `CHECK (status::text = ANY (ARRAY['draft'::character varying, 'scheduled'::character varying, 'open'::character varying, 'closing'::character varying, 'closed'::character varying, 'cancelled'::character varying]::text[]))`
- `lots_top_deal_order_check`: `CHECK (top_deal_order >= 0 AND top_deal_order <= 9999)`
- `lots_valid_dates`: `CHECK (end_at > start_at)`

Indexes (including those backing primary/unique keys):

- `lots_category_id_status_end_at_id_idx`: `CREATE INDEX lots_category_id_status_end_at_id_idx ON public.lots USING btree (category_id, status, end_at, id)`
- `lots_condition_browse_idx`: `CREATE INDEX lots_condition_browse_idx ON public.lots USING btree (status, condition, end_at, id)`
- `lots_location_id_status_end_at_id_idx`: `CREATE INDEX lots_location_id_status_end_at_id_idx ON public.lots USING btree (location_id, status, end_at, id)`
- `lots_lot_number_key`: `CREATE UNIQUE INDEX lots_lot_number_key ON public.lots USING btree (lot_number)`
- `lots_pkey`: `CREATE UNIQUE INDEX lots_pkey ON public.lots USING btree (id)`
- `lots_status_end_at_id_idx`: `CREATE INDEX lots_status_end_at_id_idx ON public.lots USING btree (status, end_at, id)`
- `lots_status_start_price_kobo_end_at_id_idx`: `CREATE INDEX lots_status_start_price_kobo_end_at_id_idx ON public.lots USING btree (status, start_price_kobo, end_at, id)`
- `lots_top_deal_order_idx`: `CREATE INDEX lots_top_deal_order_idx ON public.lots USING btree (is_top_deal, top_deal_order, id)`

## notifications

| Column             | PostgreSQL type             | Nullable | Default                      |
| ------------------ | --------------------------- | -------- | ---------------------------- |
| id                 | uuid                        | No       | gen_random_uuid()            |
| user_id            | uuid                        | No       | —                            |
| channel            | character varying(24)       | No       | —                            |
| template           | character varying(80)       | No       | —                            |
| payload_ciphertext | bytea                       | No       | —                            |
| status             | character varying(24)       | No       | 'pending'::character varying |
| sent_at            | timestamp(3) with time zone | Yes      | —                            |
| created_at         | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP            |
| reference          | character varying(160)      | Yes      | —                            |

Relations and constraints:

- `notifications_channel_allowed`: `CHECK (channel::text = ANY (ARRAY['sms'::character varying, 'push'::character varying, 'email'::character varying]::text[]))`
- `notifications_pkey`: `PRIMARY KEY (id)`
- `notifications_reference_key`: `UNIQUE (reference)`
- `notifications_status_allowed`: `CHECK (status::text = ANY (ARRAY['pending'::character varying, 'sent'::character varying, 'failed'::character varying]::text[]))`
- `notifications_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `notifications_pkey`: `CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)`
- `notifications_reference_key`: `CREATE UNIQUE INDEX notifications_reference_key ON public.notifications USING btree (reference)`
- `notifications_status_created_at_id_idx`: `CREATE INDEX notifications_status_created_at_id_idx ON public.notifications USING btree (status, created_at, id)`
- `notifications_user_id_created_at_id_idx`: `CREATE INDEX notifications_user_id_created_at_id_idx ON public.notifications USING btree (user_id, created_at, id)`

## payments

| Column                      | PostgreSQL type             | Nullable | Default                      |
| --------------------------- | --------------------------- | -------- | ---------------------------- |
| id                          | uuid                        | No       | gen_random_uuid()            |
| user_id                     | uuid                        | No       | —                            |
| wallet_id                   | uuid                        | No       | —                            |
| provider                    | character varying(24)       | No       | —                            |
| provider_ref                | character varying(160)      | No       | —                            |
| amount_kobo                 | bigint                      | No       | —                            |
| currency                    | character varying(3)        | No       | 'NGN'::character varying     |
| status                      | character varying(24)       | No       | 'pending'::character varying |
| raw_webhook_ciphertext      | bytea                       | Yes      | —                            |
| verified_at                 | timestamp(3) with time zone | Yes      | —                            |
| created_at                  | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP            |
| fee_kobo                    | bigint                      | Yes      | —                            |
| credit_kobo                 | bigint                      | Yes      | —                            |
| funding_method              | character varying(24)       | Yes      | —                            |
| fee_policy                  | character varying(40)       | Yes      | —                            |
| card_type                   | character varying(16)       | Yes      | —                            |
| initialization_key          | character varying(200)      | Yes      | —                            |
| checkout_url_ciphertext     | bytea                       | Yes      | —                            |
| initialization_attempted_at | timestamp(3) with time zone | Yes      | —                            |
| consented_at                | timestamp(3) with time zone | Yes      | —                            |

Relations and constraints:

- `payments_amount_kobo_safe`: `CHECK (amount_kobo >= 0 AND amount_kobo <= '9007199254740991'::bigint)`
- `payments_currency_ngn`: `CHECK (currency::text = 'NGN'::text)`
- `payments_funding_metadata`: `CHECK (funding_method IS NULL AND fee_policy IS NULL AND card_type IS NULL AND initialization_key IS NULL AND checkout_url_ciphertext IS NULL AND initialization_attempted_at IS NULL AND consented_at IS NULL OR funding_method IS NOT NULL AND funding_method::text = 'bank_transfer'::text AND fee_policy IS NOT NULL AND fee_policy::text = 'paystack-dva-v1'::text AND card_type IS NULL AND initialization_key IS NULL AND checkout_url_ciphertext IS NULL AND initialization_attempted_at IS NULL OR funding_method IS NOT NULL AND funding_method::text = 'card'::text AND card_type IS NOT NULL AND (card_type::text = ANY (ARRAY['local'::character varying, 'international'::character varying]::text[])) AND fee_policy IS NOT NULL AND fee_policy::text = CASE WHEN card_type::text = 'local'::text THEN 'paystack-card-local-v1'::text ELSE 'paystack-card-international-v1'::text END AND initialization_key IS NOT NULL AND consented_at IS NOT NULL AND fee_kobo IS NOT NULL AND credit_kobo IS NOT NULL AND (checkout_url_ciphertext IS NULL OR initialization_attempted_at IS NOT NULL))`
- `payments_net_amount`: `CHECK (fee_kobo IS NULL AND credit_kobo IS NULL OR fee_kobo IS NOT NULL AND credit_kobo IS NOT NULL AND fee_kobo >= 0 AND credit_kobo > 0 AND amount_kobo::numeric = (fee_kobo::numeric + credit_kobo::numeric))`
- `payments_pkey`: `PRIMARY KEY (id)`
- `payments_positive_amount`: `CHECK (amount_kobo > 0)`
- `payments_status_allowed`: `CHECK (status::text = ANY (ARRAY['pending'::character varying, 'verified'::character varying, 'credited'::character varying, 'failed'::character varying]::text[]))`
- `payments_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `payments_wallet_id_user_id_fkey`: `FOREIGN KEY (wallet_id, user_id) REFERENCES wallets(id, user_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `payments_initialization_key_key`: `CREATE UNIQUE INDEX payments_initialization_key_key ON public.payments USING btree (initialization_key)`
- `payments_pkey`: `CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id)`
- `payments_provider_provider_ref_key`: `CREATE UNIQUE INDEX payments_provider_provider_ref_key ON public.payments USING btree (provider, provider_ref)`
- `payments_status_created_at_id_idx`: `CREATE INDEX payments_status_created_at_id_idx ON public.payments USING btree (status, created_at, id)`
- `payments_user_id_created_at_id_idx`: `CREATE INDEX payments_user_id_created_at_id_idx ON public.payments USING btree (user_id, created_at, id)`
- `payments_wallet_id_created_at_id_idx`: `CREATE INDEX payments_wallet_id_created_at_id_idx ON public.payments USING btree (wallet_id, created_at, id)`

## purchases

| Column                      | PostgreSQL type             | Nullable | Default                      |
| --------------------------- | --------------------------- | -------- | ---------------------------- |
| id                          | uuid                        | No       | gen_random_uuid()            |
| lot_id                      | uuid                        | No       | —                            |
| user_id                     | uuid                        | No       | —                            |
| wallet_id                   | uuid                        | No       | —                            |
| namespace                   | character varying(160)      | No       | —                            |
| request_key                 | uuid                        | No       | —                            |
| method                      | character varying(24)       | No       | —                            |
| status                      | character varying(24)       | No       | 'pending'::character varying |
| price_kobo                  | bigint                      | No       | —                            |
| tax_kobo                    | bigint                      | No       | —                            |
| total_kobo                  | bigint                      | No       | —                            |
| amount_kobo                 | bigint                      | No       | —                            |
| processing_fee_kobo         | bigint                      | No       | —                            |
| credit_kobo                 | bigint                      | No       | —                            |
| expires_at                  | timestamp(3) with time zone | No       | —                            |
| provider_ref                | character varying(160)      | No       | —                            |
| initialization_attempted_at | timestamp(3) with time zone | Yes      | —                            |
| checkout_url_ciphertext     | bytea                       | Yes      | —                            |
| verified_at                 | timestamp(3) with time zone | Yes      | —                            |
| credited_at                 | timestamp(3) with time zone | Yes      | —                            |
| invoice_id                  | uuid                        | Yes      | —                            |
| created_at                  | timestamp(3) with time zone | No       | now()                        |
| holds_released_at           | timestamp(3) with time zone | Yes      | —                            |

Relations and constraints:

- `purchases_amount_kobo_check`: `CHECK (amount_kobo >= 1 AND amount_kobo <= '9007199254740991'::bigint)`
- `purchases_check`: `CHECK (total_kobo >= 1 AND total_kobo <= '9007199254740991'::bigint AND total_kobo::numeric = (price_kobo::numeric + tax_kobo::numeric))`
- `purchases_check1`: `CHECK (credit_kobo >= 1 AND credit_kobo <= '9007199254740991'::bigint AND credit_kobo::numeric = (amount_kobo::numeric - processing_fee_kobo::numeric) AND credit_kobo >= total_kobo)`
- `purchases_check2`: `CHECK (status::text <> 'paid'::text OR invoice_id IS NOT NULL)`
- `purchases_check3`: `CHECK (method::text <> 'wallet'::text OR processing_fee_kobo = 0 AND amount_kobo = total_kobo)`
- `purchases_invoice_id_fkey`: `FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `purchases_invoice_id_key`: `UNIQUE (invoice_id)`
- `purchases_lot_id_fkey`: `FOREIGN KEY (lot_id) REFERENCES lots(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `purchases_method_check`: `CHECK (method::text = ANY (ARRAY['wallet'::character varying, 'local_card'::character varying, 'international_card'::character varying, 'bank_transfer'::character varying]::text[]))`
- `purchases_namespace_fkey`: `FOREIGN KEY (namespace) REFERENCES bid_engine_runtime(namespace) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `purchases_pkey`: `PRIMARY KEY (id)`
- `purchases_price_kobo_check`: `CHECK (price_kobo >= 1 AND price_kobo <= '9007199254740991'::bigint)`
- `purchases_processing_fee_kobo_check`: `CHECK (processing_fee_kobo >= 0 AND processing_fee_kobo <= '9007199254740991'::bigint)`
- `purchases_provider_ref_key`: `UNIQUE (provider_ref)`
- `purchases_status_check`: `CHECK (status::text = ANY (ARRAY['pending'::character varying, 'paid'::character varying, 'expired'::character varying, 'cancelled'::character varying]::text[]))`
- `purchases_tax_kobo_check`: `CHECK (tax_kobo >= 0 AND tax_kobo <= '9007199254740991'::bigint)`
- `purchases_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `purchases_user_id_request_key_key`: `UNIQUE (user_id, request_key)`
- `purchases_wallet_id_user_id_fkey`: `FOREIGN KEY (wallet_id, user_id) REFERENCES wallets(id, user_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `purchases_active_lot_idx`: `CREATE UNIQUE INDEX purchases_active_lot_idx ON public.purchases USING btree (lot_id) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying])::text[]))`
- `purchases_buyer_idx`: `CREATE INDEX purchases_buyer_idx ON public.purchases USING btree (user_id, created_at, id)`
- `purchases_invoice_id_key`: `CREATE UNIQUE INDEX purchases_invoice_id_key ON public.purchases USING btree (invoice_id)`
- `purchases_pkey`: `CREATE UNIQUE INDEX purchases_pkey ON public.purchases USING btree (id)`
- `purchases_provider_ref_key`: `CREATE UNIQUE INDEX purchases_provider_ref_key ON public.purchases USING btree (provider_ref)`
- `purchases_recovery_idx`: `CREATE INDEX purchases_recovery_idx ON public.purchases USING btree (namespace, status, expires_at, id)`
- `purchases_unfinished_idx`: `CREATE INDEX purchases_unfinished_idx ON public.purchases USING btree (namespace, id) WHERE (((status)::text = 'pending'::text) OR (((status)::text = 'paid'::text) AND (holds_released_at IS NULL)))`
- `purchases_user_id_request_key_key`: `CREATE UNIQUE INDEX purchases_user_id_request_key_key ON public.purchases USING btree (user_id, request_key)`
- `purchases_wallet_idx`: `CREATE INDEX purchases_wallet_idx ON public.purchases USING btree (wallet_id)`

## search_index_jobs

| Column          | PostgreSQL type             | Nullable | Default                                        |
| --------------- | --------------------------- | -------- | ---------------------------------------------- |
| lot_id          | uuid                        | No       | —                                              |
| version         | bigint                      | No       | nextval('search_index_revision_seq'::regclass) |
| applied_version | bigint                      | No       | 0                                              |
| updated_at      | timestamp(3) with time zone | No       | now()                                          |

Relations and constraints:

- `search_index_jobs_lot_id_fkey`: `FOREIGN KEY (lot_id) REFERENCES lots(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `search_index_jobs_pkey`: `PRIMARY KEY (lot_id)`
- `search_index_jobs_version_check`: `CHECK (version > 0 AND applied_version >= 0 AND applied_version <= version)`

Indexes (including those backing primary/unique keys):

- `search_index_jobs_pending_idx`: `CREATE INDEX search_index_jobs_pending_idx ON public.search_index_jobs USING btree (version) WHERE (version > applied_version)`
- `search_index_jobs_pkey`: `CREATE UNIQUE INDEX search_index_jobs_pkey ON public.search_index_jobs USING btree (lot_id)`

## staff_credentials

| Column                 | PostgreSQL type             | Nullable | Default           |
| ---------------------- | --------------------------- | -------- | ----------------- |
| user_id                | uuid                        | No       | —                 |
| password_hash          | text                        | No       | —                 |
| totp_secret_ciphertext | bytea                       | No       | —                 |
| last_counter           | bigint                      | Yes      | —                 |
| created_at             | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP |

Relations and constraints:

- `staff_credentials_last_counter_check`: `CHECK (last_counter >= 0)`
- `staff_credentials_pkey`: `PRIMARY KEY (user_id)`
- `staff_credentials_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `staff_credentials_pkey`: `CREATE UNIQUE INDEX staff_credentials_pkey ON public.staff_credentials USING btree (user_id)`

## strikes

| Column       | PostgreSQL type             | Nullable | Default           |
| ------------ | --------------------------- | -------- | ----------------- |
| id           | uuid                        | No       | gen_random_uuid() |
| user_id      | uuid                        | No       | —                 |
| issued_by_id | uuid                        | Yes      | —                 |
| reference    | character varying(160)      | No       | —                 |
| reason       | text                        | No       | —                 |
| created_at   | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP |
| revoked_at   | timestamp(3) with time zone | Yes      | —                 |

Relations and constraints:

- `strikes_issued_by_id_fkey`: `FOREIGN KEY (issued_by_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `strikes_pkey`: `PRIMARY KEY (id)`
- `strikes_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `strikes_issued_by_id_id_idx`: `CREATE INDEX strikes_issued_by_id_id_idx ON public.strikes USING btree (issued_by_id, id)`
- `strikes_pkey`: `CREATE UNIQUE INDEX strikes_pkey ON public.strikes USING btree (id)`
- `strikes_reference_key`: `CREATE UNIQUE INDEX strikes_reference_key ON public.strikes USING btree (reference)`
- `strikes_user_id_revoked_at_created_at_id_idx`: `CREATE INDEX strikes_user_id_revoked_at_created_at_id_idx ON public.strikes USING btree (user_id, revoked_at, created_at, id)`

## users

| Column              | PostgreSQL type             | Nullable | Default                         |
| ------------------- | --------------------------- | -------- | ------------------------------- |
| id                  | uuid                        | No       | gen_random_uuid()               |
| name                | character varying(120)      | No       | —                               |
| phone_ciphertext    | bytea                       | Yes      | —                               |
| phone_hash          | character varying(64)       | Yes      | —                               |
| email_ciphertext    | bytea                       | Yes      | —                               |
| email_hash          | character varying(64)       | Yes      | —                               |
| bvn_ciphertext      | bytea                       | Yes      | —                               |
| bvn_hash            | character varying(64)       | Yes      | —                               |
| role                | character varying(24)       | No       | 'buyer'::character varying      |
| status              | character varying(24)       | No       | 'active'::character varying     |
| kyc_status          | character varying(24)       | No       | 'unverified'::character varying |
| phone_verified_at   | timestamp(3) with time zone | Yes      | —                               |
| created_at          | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP               |
| updated_at          | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP               |
| email_verified_at   | timestamp(3) with time zone | Yes      | —                               |
| wallet_consented_at | timestamp(3) with time zone | Yes      | —                               |
| topup_fee_policy    | character varying(40)       | Yes      | —                               |

Relations and constraints:

- `users_bvn_envelope`: `CHECK (bvn_ciphertext IS NULL AND bvn_hash IS NULL OR octet_length(bvn_ciphertext) >= 29 AND bvn_hash::text ~ '^[a-f0-9]{64}$'::text AND bvn_ciphertext IS NOT NULL AND bvn_hash IS NOT NULL)`
- `users_email_envelope`: `CHECK (email_ciphertext IS NULL AND email_hash IS NULL OR octet_length(email_ciphertext) >= 29 AND email_hash::text ~ '^[a-f0-9]{64}$'::text AND email_ciphertext IS NOT NULL AND email_hash IS NOT NULL)`
- `users_email_verification_requires_email`: `CHECK (email_verified_at IS NULL OR email_hash IS NOT NULL)`
- `users_identity_required`: `CHECK (phone_hash IS NOT NULL OR email_hash IS NOT NULL)`
- `users_kyc_status_allowed`: `CHECK (kyc_status::text = ANY (ARRAY['unverified'::character varying, 'pending'::character varying, 'verified'::character varying, 'rejected'::character varying]::text[]))`
- `users_phone_envelope`: `CHECK (octet_length(phone_ciphertext) >= 29 AND phone_hash::text ~ '^[a-f0-9]{64}$'::text)`
- `users_phone_pair`: `CHECK ((phone_hash IS NULL) = (phone_ciphertext IS NULL))`
- `users_phone_verification_requires_phone`: `CHECK (phone_verified_at IS NULL OR phone_hash IS NOT NULL)`
- `users_pkey`: `PRIMARY KEY (id)`
- `users_role_allowed`: `CHECK (role::text = ANY (ARRAY['buyer'::character varying, 'admin'::character varying, 'intake'::character varying, 'warehouse'::character varying, 'finance'::character varying, 'support'::character varying, 'supplier'::character varying]::text[]))`
- `users_status_allowed`: `CHECK (status::text = ANY (ARRAY['active'::character varying, 'suspended'::character varying]::text[]))`
- `users_topup_consent`: `CHECK (wallet_consented_at IS NULL AND topup_fee_policy IS NULL OR wallet_consented_at IS NOT NULL AND topup_fee_policy::text = 'paystack-dva-v1'::text)`

Indexes (including those backing primary/unique keys):

- `users_bvn_hash_key`: `CREATE UNIQUE INDEX users_bvn_hash_key ON public.users USING btree (bvn_hash)`
- `users_email_hash_key`: `CREATE UNIQUE INDEX users_email_hash_key ON public.users USING btree (email_hash)`
- `users_phone_hash_key`: `CREATE UNIQUE INDEX users_phone_hash_key ON public.users USING btree (phone_hash)`
- `users_pkey`: `CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)`
- `users_role_id_idx`: `CREATE INDEX users_role_id_idx ON public.users USING btree (role, id)`

## virtual_accounts

| Column                    | PostgreSQL type             | Nullable | Default           |
| ------------------------- | --------------------------- | -------- | ----------------- |
| id                        | uuid                        | No       | gen_random_uuid() |
| user_id                   | uuid                        | No       | —                 |
| provider                  | character varying(24)       | No       | —                 |
| provider_ref              | character varying(160)      | No       | —                 |
| bank_name                 | character varying(120)      | No       | —                 |
| account_number_ciphertext | bytea                       | No       | —                 |
| consented_at              | timestamp(3) with time zone | No       | —                 |
| created_at                | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP |
| customer_code             | character varying(160)      | Yes      | —                 |

Relations and constraints:

- `virtual_accounts_pkey`: `PRIMARY KEY (id)`
- `virtual_accounts_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `virtual_accounts_customer_code_key`: `CREATE UNIQUE INDEX virtual_accounts_customer_code_key ON public.virtual_accounts USING btree (customer_code)`
- `virtual_accounts_pkey`: `CREATE UNIQUE INDEX virtual_accounts_pkey ON public.virtual_accounts USING btree (id)`
- `virtual_accounts_provider_provider_ref_key`: `CREATE UNIQUE INDEX virtual_accounts_provider_provider_ref_key ON public.virtual_accounts USING btree (provider, provider_ref)`
- `virtual_accounts_user_id_id_idx`: `CREATE INDEX virtual_accounts_user_id_id_idx ON public.virtual_accounts USING btree (user_id, id)`

## wallet_holds

| Column      | PostgreSQL type             | Nullable | Default                     |
| ----------- | --------------------------- | -------- | --------------------------- |
| id          | uuid                        | No       | —                           |
| wallet_id   | uuid                        | No       | —                           |
| amount_kobo | bigint                      | No       | —                           |
| status      | character varying(24)       | No       | 'active'::character varying |
| created_at  | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP           |
| updated_at  | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP           |

Relations and constraints:

- `wallet_holds_amount`: `CHECK (amount_kobo >= 1 AND amount_kobo <= '9007199254740991'::bigint)`
- `wallet_holds_funds_invariant`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `wallet_holds_pkey`: `PRIMARY KEY (id)`
- `wallet_holds_status`: `CHECK (status::text = ANY (ARRAY['active'::character varying, 'released'::character varying, 'captured'::character varying]::text[]))`
- `wallet_holds_wallet_id_fkey`: `FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `wallet_holds_id_wallet_id_key`: `CREATE UNIQUE INDEX wallet_holds_id_wallet_id_key ON public.wallet_holds USING btree (id, wallet_id)`
- `wallet_holds_pkey`: `CREATE UNIQUE INDEX wallet_holds_pkey ON public.wallet_holds USING btree (id)`
- `wallet_holds_wallet_id_status_id_idx`: `CREATE INDEX wallet_holds_wallet_id_status_id_idx ON public.wallet_holds USING btree (wallet_id, status, id)`

## wallets

| Column     | PostgreSQL type             | Nullable | Default                  |
| ---------- | --------------------------- | -------- | ------------------------ |
| id         | uuid                        | No       | gen_random_uuid()        |
| user_id    | uuid                        | No       | —                        |
| currency   | character varying(3)        | No       | 'NGN'::character varying |
| created_at | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP        |

Relations and constraints:

- `wallets_currency_ngn`: `CHECK (currency::text = 'NGN'::text)`
- `wallets_pkey`: `PRIMARY KEY (id)`
- `wallets_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `wallets_id_user_id_key`: `CREATE UNIQUE INDEX wallets_id_user_id_key ON public.wallets USING btree (id, user_id)`
- `wallets_pkey`: `CREATE UNIQUE INDEX wallets_pkey ON public.wallets USING btree (id)`
- `wallets_user_id_key`: `CREATE UNIQUE INDEX wallets_user_id_key ON public.wallets USING btree (user_id)`

## watchlist

| Column     | PostgreSQL type             | Nullable | Default           |
| ---------- | --------------------------- | -------- | ----------------- |
| user_id    | uuid                        | No       | —                 |
| lot_id     | uuid                        | No       | —                 |
| created_at | timestamp(3) with time zone | No       | CURRENT_TIMESTAMP |

Relations and constraints:

- `watchlist_lot_id_fkey`: `FOREIGN KEY (lot_id) REFERENCES lots(id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `watchlist_pkey`: `PRIMARY KEY (user_id, lot_id)`
- `watchlist_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT`

Indexes (including those backing primary/unique keys):

- `watchlist_lot_id_user_id_idx`: `CREATE INDEX watchlist_lot_id_user_id_idx ON public.watchlist USING btree (lot_id, user_id)`
- `watchlist_pkey`: `CREATE UNIQUE INDEX watchlist_pkey ON public.watchlist USING btree (user_id, lot_id)`
- `watchlist_user_id_created_at_lot_id_idx`: `CREATE INDEX watchlist_user_id_created_at_lot_id_idx ON public.watchlist USING btree (user_id, created_at, lot_id)`

## Ledger triggers

All ledger accounts, journals and postings are immutable. Posting inserts must occur in the same PostgreSQL transaction as their journal (`writer_xid` records the full transaction ID). Deferred constraint triggers run at commit and reject empty or unbalanced journals. Ledger accounts bind each wallet’s available/held accounts uniquely; system accounts have no wallet. All accounts and journals are NGN-only. T05 adds deferred wallet row locking and rejects negative balances, unsafe total funds, held balances that differ from active reservations, foreign-wallet postings and journal metadata that differs from postings. Hold transitions cannot reduce reservations, change ownership or reopen settled holds; holds cannot be deleted. Legacy system-only journals may omit wallet metadata. Fee calculations and proxy bidding remain in the shared rules and later integrations.

## Funding intent guards

The payments_accepted_intent_immutable trigger freezes accepted funding ownership, references, currency, gross/fee/net amounts, method, card tier, policy, retry key and consent time. An issued encrypted checkout URL cannot be replaced and a credited payment cannot be downgraded. Legacy rows without funding metadata remain compatible. Funding refund requests are encrypted audit events with idempotent receipts; requesting a refund does not move or reserve money.

## Search outbox trigger

The lots_enqueue_search_change trigger calls enqueue_lot_search_change after every lot insert/update. It coalesces pending changes by lot UUID and assigns a new bigint version from search_index_revision_seq. The outbox row commits or rolls back with its lot change. The partial pending index covers rows whose version exceeds applied_version. Only a successfully completed Meilisearch task permits acknowledgement of the exact version read; a concurrent newer version remains pending. This projection never writes bids or ledger entries. Existing lots are backfilled by the additive migration without changing their status.

## Accepted bid history guards

bid_acceptances stores one immutable, namespace-scoped stream receipt per funded intent. Its unique namespace/stream ID and intent primary key prevent replay duplication. Each receipt owns one request bid and, when the previous leader counters, one counter bid; unique acceptance/role keys prevent duplicate projections. The bids_immutable and bid_acceptances_immutable triggers reject updates and deletes. The original positive amount and max-at-least-amount checks remain enforced. Full private leader/result snapshots belong to the receipt, not public DTOs. Persistence never writes ledger postings or determines settlement.

## Bid funding guards

Bid funding intents bind a buyer-owned session, wallet, lot, immutable request fingerprint and optional additive wallet hold. Composite foreign keys enforce session/wallet ownership; a hold may belong to one intent only. Amount checks enforce safe integer kobo. Funding contract fields cannot change after insertion, settled intent rows cannot reopen, and rows cannot be deleted. The runtime namespace pins the Redis process identity; a mismatch pauses acceptance and release pending reviewed reconciliation. Once a runtime exists, auth-session revocation and user eligibility/strike changes require a transaction-local bid fence marker set only after Redis revocation succeeds. Staff eligibility mutation APIs must use this boundary when added; direct unfenced SQL changes are rejected.
