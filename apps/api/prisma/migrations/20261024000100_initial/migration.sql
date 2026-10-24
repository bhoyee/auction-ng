-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "phone_ciphertext" BYTEA NOT NULL,
    "phone_hash" VARCHAR(64) NOT NULL,
    "email_ciphertext" BYTEA,
    "email_hash" VARCHAR(64),
    "bvn_ciphertext" BYTEA,
    "bvn_hash" VARCHAR(64),
    "role" VARCHAR(24) NOT NULL DEFAULT 'buyer',
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "kyc_status" VARCHAR(24) NOT NULL DEFAULT 'unverified',
    "phone_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(120) NOT NULL,
    "wallet_id" UUID,
    "kind" VARCHAR(24) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "idempotency_key" VARCHAR(160) NOT NULL,
    "reference" VARCHAR(160) NOT NULL,
    "type" VARCHAR(24) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "writer_xid" BIGINT NOT NULL DEFAULT txid_current(),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transaction_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "side" VARCHAR(6) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "virtual_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(24) NOT NULL,
    "provider_ref" VARCHAR(160) NOT NULL,
    "bank_name" VARCHAR(120) NOT NULL,
    "account_number_ciphertext" BYTEA NOT NULL,
    "consented_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "virtual_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "provider" VARCHAR(24) NOT NULL,
    "provider_ref" VARCHAR(160) NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "raw_webhook_ciphertext" BYTEA,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "address" TEXT NOT NULL,
    "hours" JSONB NOT NULL,
    "capacity_per_slot" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "parent_id" UUID,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_number" VARCHAR(40) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "condition" VARCHAR(24) NOT NULL,
    "retail_price_kobo" BIGINT NOT NULL,
    "start_price_kobo" BIGINT NOT NULL,
    "category_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "lot_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "max_kobo" BIGINT NOT NULL,
    "is_proxy" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "stream_id" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist" (
    "user_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_pkey" PRIMARY KEY ("user_id","lot_id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" VARCHAR(40) NOT NULL,
    "user_id" UUID NOT NULL,
    "hammer_total_kobo" BIGINT NOT NULL,
    "premium_kobo" BIGINT NOT NULL,
    "lot_fee_kobo" BIGINT NOT NULL,
    "vat_kobo" BIGINT NOT NULL,
    "total_kobo" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "hammer_kobo" BIGINT NOT NULL,
    "premium_kobo" BIGINT NOT NULL,
    "lot_fee_kobo" BIGINT NOT NULL,
    "vat_kobo" BIGINT NOT NULL,
    "total_kobo" BIGINT NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "type" VARCHAR(24) NOT NULL DEFAULT 'pickup',
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "slot_at" TIMESTAMPTZ(3),
    "qr_token_hash" VARCHAR(64),
    "delivery_address_ciphertext" BYTEA,
    "courier" VARCHAR(80),
    "tracking_number_ciphertext" BYTEA,
    "collected_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "channel" VARCHAR(24) NOT NULL,
    "template" VARCHAR(80) NOT NULL,
    "payload_ciphertext" BYTEA NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strikes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "issued_by_id" UUID,
    "reference" VARCHAR(160) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "strikes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(160) NOT NULL,
    "before_ciphertext" BYTEA,
    "after_ciphertext" BYTEA,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "scope" VARCHAR(80) NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response_ciphertext" BYTEA,
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_hash_key" ON "users"("phone_hash");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_hash_key" ON "users"("email_hash");

-- CreateIndex
CREATE UNIQUE INDEX "users_bvn_hash_key" ON "users"("bvn_hash");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_id_user_id_key" ON "wallets"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_wallet_id_kind_key" ON "ledger_accounts"("wallet_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_idempotency_key_key" ON "ledger_transactions"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_reference_key" ON "ledger_transactions"("reference");

-- CreateIndex
CREATE INDEX "ledger_transactions_created_at_id_idx" ON "ledger_transactions"("created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_idempotency_key_key" ON "ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_created_at_id_idx" ON "ledger_entries"("account_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "virtual_accounts_user_id_id_idx" ON "virtual_accounts"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "virtual_accounts_provider_provider_ref_key" ON "virtual_accounts"("provider", "provider_ref");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_id_idx" ON "payments"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "payments_wallet_id_created_at_id_idx" ON "payments"("wallet_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "payments_status_created_at_id_idx" ON "payments"("status", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_ref_key" ON "payments"("provider", "provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_id_idx" ON "categories"("parent_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lots_lot_number_key" ON "lots"("lot_number");

-- CreateIndex
CREATE INDEX "lots_status_end_at_id_idx" ON "lots"("status", "end_at", "id");

-- CreateIndex
CREATE INDEX "lots_category_id_status_end_at_id_idx" ON "lots"("category_id", "status", "end_at", "id");

-- CreateIndex
CREATE INDEX "lots_location_id_status_end_at_id_idx" ON "lots"("location_id", "status", "end_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lot_images_lot_id_sort_order_key" ON "lot_images"("lot_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "bids_idempotency_key_key" ON "bids"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "bids_stream_id_key" ON "bids"("stream_id");

-- CreateIndex
CREATE INDEX "bids_lot_id_amount_kobo_idx" ON "bids"("lot_id", "amount_kobo" DESC);

-- CreateIndex
CREATE INDEX "bids_lot_id_created_at_id_idx" ON "bids"("lot_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "bids_user_id_created_at_id_idx" ON "bids"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "watchlist_lot_id_user_id_idx" ON "watchlist"("lot_id", "user_id");

-- CreateIndex
CREATE INDEX "watchlist_user_id_created_at_lot_id_idx" ON "watchlist"("user_id", "created_at", "lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_user_id_created_at_id_idx" ON "invoices"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "invoices_status_created_at_id_idx" ON "invoices"("status", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_id_user_id_key" ON "invoices"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_lot_id_key" ON "invoice_lines"("lot_id");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_id_idx" ON "invoice_lines"("invoice_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilments_invoice_id_key" ON "fulfilments"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilments_qr_token_hash_key" ON "fulfilments"("qr_token_hash");

-- CreateIndex
CREATE INDEX "fulfilments_location_id_slot_at_id_idx" ON "fulfilments"("location_id", "slot_at", "id");

-- CreateIndex
CREATE INDEX "fulfilments_user_id_created_at_id_idx" ON "fulfilments"("user_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilments_invoice_id_user_id_key" ON "fulfilments"("invoice_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_id_idx" ON "notifications"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "notifications_status_created_at_id_idx" ON "notifications"("status", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "strikes_reference_key" ON "strikes"("reference");

-- CreateIndex
CREATE INDEX "strikes_user_id_revoked_at_created_at_id_idx" ON "strikes"("user_id", "revoked_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "strikes_issued_by_id_id_idx" ON "strikes"("issued_by_id", "id");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_created_at_id_idx" ON "audit_log"("actor_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_created_at_id_idx" ON "audit_log"("entity_type", "entity_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "idempotency_keys_user_id_created_at_id_idx" ON "idempotency_keys"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_id_idx" ON "idempotency_keys"("expires_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys"("scope", "key");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "virtual_accounts" ADD CONSTRAINT "virtual_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_wallet_id_user_id_fkey" FOREIGN KEY ("wallet_id", "user_id") REFERENCES "wallets"("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lot_images" ADD CONSTRAINT "lot_images_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fulfilments" ADD CONSTRAINT "fulfilments_invoice_id_user_id_fkey" FOREIGN KEY ("invoice_id", "user_id") REFERENCES "invoices"("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fulfilments" ADD CONSTRAINT "fulfilments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fulfilments" ADD CONSTRAINT "fulfilments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "strikes" ADD CONSTRAINT "strikes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "strikes" ADD CONSTRAINT "strikes_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Additional invariant constraints not expressible in Prisma schema syntax.
ALTER TABLE "users" ADD CONSTRAINT "users_role_allowed" CHECK ("role" IN ('buyer', 'admin', 'intake', 'warehouse', 'finance', 'support', 'supplier'));
ALTER TABLE "users" ADD CONSTRAINT "users_status_allowed" CHECK ("status" IN ('active', 'suspended'));
ALTER TABLE "users" ADD CONSTRAINT "users_kyc_status_allowed" CHECK ("kyc_status" IN ('unverified', 'pending', 'verified', 'rejected'));
ALTER TABLE "lots" ADD CONSTRAINT "lots_condition_allowed" CHECK ("condition" IN ('new', 'like_new', 'open_box', 'damaged', 'untested'));
ALTER TABLE "lots" ADD CONSTRAINT "lots_status_allowed" CHECK ("status" IN ('draft', 'scheduled', 'open', 'closing', 'closed', 'cancelled'));
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_allowed" CHECK ("status" IN ('pending', 'verified', 'credited', 'failed'));
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_status_allowed" CHECK ("status" IN ('pending', 'paid', 'refunded', 'cancelled'));
ALTER TABLE "fulfilments" ADD CONSTRAINT "fulfilments_type_allowed" CHECK ("type" IN ('pickup', 'delivery'));
ALTER TABLE "fulfilments" ADD CONSTRAINT "fulfilments_status_allowed" CHECK ("status" IN ('pending', 'booked', 'ready', 'collected', 'in_transit', 'delivered', 'cancelled'));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_channel_allowed" CHECK ("channel" IN ('sms', 'push', 'email'));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_status_allowed" CHECK ("status" IN ('pending', 'sent', 'failed'));
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_status_allowed" CHECK ("status" IN ('pending', 'completed', 'failed'));
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_kind_allowed" CHECK ("kind" IN ('available', 'held', 'system'));
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_type_allowed" CHECK ("type" IN ('topup', 'hold', 'release', 'debit', 'refund', 'payout'));
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_side_allowed" CHECK ("side" IN ('debit', 'credit'));
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_currency_ngn" CHECK (currency = 'NGN');
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_currency_ngn" CHECK (currency = 'NGN');
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_currency_ngn" CHECK (currency = 'NGN');
ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_ngn" CHECK (currency = 'NGN');
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_currency_ngn" CHECK (currency = 'NGN');
ALTER TABLE "lots" ADD CONSTRAINT "lots_retail_price_kobo_safe" CHECK ("retail_price_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "lots" ADD CONSTRAINT "lots_start_price_kobo_safe" CHECK ("start_price_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "bids" ADD CONSTRAINT "bids_amount_kobo_safe" CHECK ("amount_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "bids" ADD CONSTRAINT "bids_max_kobo_safe" CHECK ("max_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_kobo_safe" CHECK ("amount_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_hammer_total_kobo_safe" CHECK ("hammer_total_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_premium_kobo_safe" CHECK ("premium_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_lot_fee_kobo_safe" CHECK ("lot_fee_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vat_kobo_safe" CHECK ("vat_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_total_kobo_safe" CHECK ("total_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_hammer_kobo_safe" CHECK ("hammer_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_premium_kobo_safe" CHECK ("premium_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_lot_fee_kobo_safe" CHECK ("lot_fee_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_vat_kobo_safe" CHECK ("vat_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_total_kobo_safe" CHECK ("total_kobo" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "lots" ADD CONSTRAINT "lots_positive_start" CHECK (start_price_kobo > 0);
ALTER TABLE "lots" ADD CONSTRAINT "lots_valid_dates" CHECK (end_at > start_at);
ALTER TABLE "bids" ADD CONSTRAINT "bids_valid_max" CHECK (amount_kobo > 0 AND max_kobo >= amount_kobo);
ALTER TABLE "payments" ADD CONSTRAINT "payments_positive_amount" CHECK (amount_kobo > 0);
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_positive_amount" CHECK (amount_kobo > 0);
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_wallet_kind" CHECK ((kind = 'system' AND wallet_id IS NULL) OR (kind IN ('available','held') AND wallet_id IS NOT NULL));
ALTER TABLE "locations" ADD CONSTRAINT "locations_positive_capacity" CHECK (capacity_per_slot > 0);
ALTER TABLE "lot_images" ADD CONSTRAINT "lot_images_nonnegative_order" CHECK (sort_order >= 0);
ALTER TABLE "categories" ADD CONSTRAINT "categories_not_own_parent" CHECK (parent_id IS DISTINCT FROM id);
ALTER TABLE "users" ADD CONSTRAINT "users_phone_envelope" CHECK (octet_length(phone_ciphertext) >= 29 AND phone_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE "users" ADD CONSTRAINT "users_email_envelope" CHECK ((email_ciphertext IS NULL AND email_hash IS NULL) OR (octet_length(email_ciphertext) >= 29 AND email_hash ~ '^[a-f0-9]{64}$' AND email_ciphertext IS NOT NULL AND email_hash IS NOT NULL));
ALTER TABLE "users" ADD CONSTRAINT "users_bvn_envelope" CHECK ((bvn_ciphertext IS NULL AND bvn_hash IS NULL) OR (octet_length(bvn_ciphertext) >= 29 AND bvn_hash ~ '^[a-f0-9]{64}$' AND bvn_ciphertext IS NOT NULL AND bvn_hash IS NOT NULL));
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_total_matches" CHECK (total_kobo::numeric = hammer_total_kobo::numeric + premium_kobo + lot_fee_kobo + vat_kobo);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_total_matches" CHECK (total_kobo::numeric = hammer_kobo::numeric + premium_kobo + lot_fee_kobo + vat_kobo);

-- Journals and postings are immutable. Corrections require a new reversal journal.
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Ledger records are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER ledger_transactions_immutable BEFORE UPDATE OR DELETE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER ledger_accounts_immutable BEFORE UPDATE OR DELETE ON ledger_accounts FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

CREATE FUNCTION require_current_ledger_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_xid bigint;
BEGIN
  SELECT writer_xid INTO journal_xid FROM ledger_transactions WHERE id = NEW.transaction_id;
  IF journal_xid IS NOT NULL AND journal_xid <> txid_current() THEN
    RAISE EXCEPTION 'Postings must be created in the same transaction as their journal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_entries_current_journal BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION require_current_ledger_journal();

CREATE FUNCTION require_balanced_ledger_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_id uuid; posting_count bigint; net numeric;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN journal_id := NEW.id; ELSE journal_id := NEW.transaction_id; END IF;
  SELECT count(*), coalesce(sum(CASE WHEN side = 'debit' THEN amount_kobo::numeric ELSE -amount_kobo::numeric END), 0)
    INTO posting_count, net FROM ledger_entries WHERE transaction_id = journal_id;
  IF posting_count < 2 OR net <> 0 THEN
    RAISE EXCEPTION 'Ledger journal must contain at least two balanced postings' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER ledger_transaction_balanced AFTER INSERT ON ledger_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_balanced_ledger_journal();
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_balanced_ledger_journal();

