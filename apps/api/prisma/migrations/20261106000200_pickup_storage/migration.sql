-- CreateTable
CREATE TABLE "pickup_storage_centres" (
    "location_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "daily_kobo" BIGINT NOT NULL DEFAULT 100000,
    "cap_kobo" BIGINT NOT NULL DEFAULT 1000000,
    "calendar" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_storage_centres_pkey" PRIMARY KEY ("location_id")
);

-- CreateTable
CREATE TABLE "pickup_storage_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_line_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "assigned_to_id" UUID,
    "daily_kobo" BIGINT NOT NULL,
    "cap_kobo" BIGINT NOT NULL,
    "calendar" JSONB NOT NULL,
    "policy_revision" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "terms_revision" INTEGER NOT NULL DEFAULT 1,
    "ready_at" TIMESTAMPTZ(3) NOT NULL,
    "notified_at" TIMESTAMPTZ(3) NOT NULL,
    "original_due_at" TIMESTAMPTZ(3) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "review_at" TIMESTAMPTZ(3) NOT NULL,
    "reminder_one_at" TIMESTAMPTZ(3) NOT NULL,
    "reminder_two_at" TIMESTAMPTZ(3) NOT NULL,
    "reminder_one_sent" BOOLEAN NOT NULL DEFAULT false,
    "reminder_two_sent" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_at" TIMESTAMPTZ(3),
    "collected_at" TIMESTAMPTZ(3),
    "carried_kobo" BIGINT NOT NULL DEFAULT 0,
    "paid_kobo" BIGINT NOT NULL DEFAULT 0,
    "waived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_storage_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_storage_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_key" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(24) NOT NULL,
    "reason_ciphertext" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_storage_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_storage_payments" (
    "confirmation_key" UUID,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "request_key" UUID NOT NULL,
    "case_revision" INTEGER NOT NULL,
    "method" VARCHAR(24) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "storage_kobo" BIGINT NOT NULL,
    "fee_kobo" BIGINT NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "provider_ref" VARCHAR(160) NOT NULL,
    "checkout_ciphertext" BYTEA,
    "initialization_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "settled_at" TIMESTAMPTZ(3),
    "ledger_transaction_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_storage_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_storage_scans" (
    "id" INTEGER NOT NULL,
    "after_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_storage_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_storage_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "reference" VARCHAR(180) NOT NULL,
    "kind" VARCHAR(48) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'open',
    "note_ciphertext" BYTEA,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_storage_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pickup_storage_cases_invoice_line_id_key" ON "pickup_storage_cases"("invoice_line_id");

-- CreateIndex
CREATE INDEX "pickup_storage_cases_user_id_due_at_id_idx" ON "pickup_storage_cases"("user_id", "due_at", "id");

-- CreateIndex
CREATE INDEX "pickup_storage_cases_collected_at_due_at_id_idx" ON "pickup_storage_cases"("collected_at", "due_at", "id");

-- CreateIndex
CREATE INDEX "pickup_storage_cases_assigned_to_id_collected_at_review_at__idx" ON "pickup_storage_cases"("assigned_to_id", "collected_at", "review_at", "id");

-- CreateIndex
CREATE INDEX "pickup_storage_cases_location_id_collected_at_due_at_id_idx" ON "pickup_storage_cases"("location_id", "collected_at", "due_at", "id");

-- CreateIndex
CREATE INDEX "pickup_storage_cases_collected_at_reminder_one_sent_reminde_idx" ON "pickup_storage_cases"("collected_at", "reminder_one_sent", "reminder_one_at", "id");

-- CreateIndex
CREATE INDEX "pickup_storage_cases_collected_at_reminder_two_sent_reminde_idx" ON "pickup_storage_cases"("collected_at", "reminder_two_sent", "reminder_two_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_storage_adjustments_request_key_key" ON "pickup_storage_adjustments"("request_key");

-- CreateIndex
CREATE INDEX "pickup_storage_adjustments_case_id_created_at_id_idx" ON "pickup_storage_adjustments"("case_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "pickup_storage_adjustments_actor_id_created_at_id_idx" ON "pickup_storage_adjustments"("actor_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_storage_payments_confirmation_key_key" ON "pickup_storage_payments"("confirmation_key");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_storage_payments_provider_ref_key" ON "pickup_storage_payments"("provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_storage_payments_ledger_transaction_id_key" ON "pickup_storage_payments"("ledger_transaction_id");

-- CreateIndex
CREATE INDEX "pickup_storage_payments_case_id_status_expires_at_id_idx" ON "pickup_storage_payments"("case_id", "status", "expires_at", "id");

-- CreateIndex
CREATE INDEX "pickup_storage_payments_status_updated_at_id_idx" ON "pickup_storage_payments"("status", "updated_at", "id");

-- CreateIndex
CREATE INDEX "pickup_storage_payments_user_id_created_at_id_idx" ON "pickup_storage_payments"("user_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_storage_payments_user_id_request_key_key" ON "pickup_storage_payments"("user_id", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_storage_exceptions_reference_key" ON "pickup_storage_exceptions"("reference");

-- CreateIndex
CREATE INDEX "pickup_storage_exceptions_status_created_at_id_idx" ON "pickup_storage_exceptions"("status", "created_at", "id");

-- CreateIndex
CREATE INDEX "pickup_storage_exceptions_case_id_status_id_idx" ON "pickup_storage_exceptions"("case_id", "status", "id");

-- AddForeignKey
ALTER TABLE "pickup_storage_centres" ADD CONSTRAINT "pickup_storage_centres_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pickup_storage_cases" ADD CONSTRAINT "pickup_storage_cases_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pickup_storage_cases" ADD CONSTRAINT "pickup_storage_cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pickup_storage_cases" ADD CONSTRAINT "pickup_storage_cases_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pickup_storage_cases" ADD CONSTRAINT "pickup_storage_cases_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pickup_storage_adjustments" ADD CONSTRAINT "pickup_storage_adjustments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "pickup_storage_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pickup_storage_adjustments" ADD CONSTRAINT "pickup_storage_adjustments_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pickup_storage_payments" ADD CONSTRAINT "pickup_storage_payments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "pickup_storage_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pickup_storage_payments" ADD CONSTRAINT "pickup_storage_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pickup_storage_payments" ADD CONSTRAINT "pickup_storage_payments_ledger_transaction_id_fkey" FOREIGN KEY ("ledger_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pickup_storage_exceptions" ADD CONSTRAINT "pickup_storage_exceptions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "pickup_storage_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE pickup_storage_centres ADD CONSTRAINT storage_centre_amounts CHECK(daily_kobo BETWEEN 0 AND 9007199254740991 AND cap_kobo BETWEEN 0 AND 9007199254740991 AND revision>0);
ALTER TABLE pickup_storage_cases ADD CONSTRAINT storage_case_amounts CHECK(daily_kobo BETWEEN 0 AND 9007199254740991 AND cap_kobo BETWEEN 0 AND 9007199254740991 AND carried_kobo BETWEEN 0 AND cap_kobo AND paid_kobo BETWEEN 0 AND cap_kobo AND revision>0 AND policy_revision>0 AND due_at>=notified_at AND original_due_at>=notified_at AND review_at>=due_at);
ALTER TABLE pickup_storage_payments ADD CONSTRAINT storage_payment_amounts CHECK(storage_kobo BETWEEN 1 AND 9007199254740991 AND fee_kobo BETWEEN 0 AND 9007199254740991 AND amount_kobo=storage_kobo+fee_kobo AND amount_kobo<=9007199254740991 AND case_revision>0 AND method IN ('wallet','local_card','international_card','bank_transfer') AND status IN ('pending','paid','expired','cancelled','review') AND (method<>'wallet' OR fee_kobo=0) AND (status<>'paid' OR (settled_at IS NOT NULL AND ledger_transaction_id IS NOT NULL)));
ALTER TABLE pickup_storage_adjustments ADD CONSTRAINT storage_adjustment_action CHECK(action IN ('extend','waive','assign','contact'));
ALTER TABLE pickup_storage_exceptions ADD CONSTRAINT storage_exception_status CHECK(status IN ('open','resolved'));
CREATE FUNCTION preserve_storage_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Storage history cannot be deleted'; END IF;
  IF TG_TABLE_NAME='pickup_storage_adjustments' THEN RAISE EXCEPTION 'Storage adjustments are immutable'; END IF;
  IF TG_TABLE_NAME='pickup_storage_cases' THEN
    IF ROW(NEW.invoice_line_id,NEW.user_id,NEW.location_id,NEW.daily_kobo,NEW.cap_kobo,NEW.calendar,NEW.policy_revision,NEW.ready_at,NEW.notified_at,NEW.original_due_at)
       IS DISTINCT FROM ROW(OLD.invoice_line_id,OLD.user_id,OLD.location_id,OLD.daily_kobo,OLD.cap_kobo,OLD.calendar,OLD.policy_revision,OLD.ready_at,OLD.notified_at,OLD.original_due_at)
       THEN RAISE EXCEPTION 'Storage policy snapshot is immutable'; END IF;
    IF OLD.collected_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Collected storage case is frozen'; END IF;
  END IF;
  IF TG_TABLE_NAME='pickup_storage_payments' THEN
    IF ROW(NEW.case_id,NEW.user_id,NEW.request_key,NEW.case_revision,NEW.method,NEW.storage_kobo,NEW.fee_kobo,NEW.amount_kobo,NEW.provider_ref,NEW.expires_at)
       IS DISTINCT FROM ROW(OLD.case_id,OLD.user_id,OLD.request_key,OLD.case_revision,OLD.method,OLD.storage_kobo,OLD.fee_kobo,OLD.amount_kobo,OLD.provider_ref,OLD.expires_at)
       THEN RAISE EXCEPTION 'Storage checkout terms are immutable'; END IF;
    IF OLD.status='paid' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Paid storage checkout is immutable'; END IF;
    IF OLD.confirmation_key IS NOT NULL AND NEW.confirmation_key IS DISTINCT FROM OLD.confirmation_key THEN RAISE EXCEPTION 'Storage consent reference is immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER storage_case_history BEFORE UPDATE OR DELETE ON pickup_storage_cases FOR EACH ROW EXECUTE FUNCTION preserve_storage_history();
ALTER TABLE pickup_storage_cases ADD CONSTRAINT storage_terms_revision_positive CHECK(terms_revision>0);
CREATE TRIGGER storage_payment_history BEFORE UPDATE OR DELETE ON pickup_storage_payments FOR EACH ROW EXECUTE FUNCTION preserve_storage_history();
CREATE TRIGGER storage_adjustment_history BEFORE UPDATE OR DELETE ON pickup_storage_adjustments FOR EACH ROW EXECUTE FUNCTION preserve_storage_history();
ALTER TABLE staff_roles DROP CONSTRAINT staff_role_permissions;
ALTER TABLE staff_roles ADD CONSTRAINT staff_role_permissions CHECK(permissions <@ ARRAY['dashboard.view','inventory.read','inventory.write','auctions.manage','pickup.manage','buyers.read','buyers.manage','support.manage','finance.read','refunds.manage','withdrawals.manage','wallet.manage','fees.manage','bids.cancel','audit.read','records.archive','staff.manage','records.purge','setup.manage','bids.read','storage.manage','storage.adjust']::text[] AND revision>0);
UPDATE staff_roles SET permissions=permissions||ARRAY['storage.manage','storage.adjust'] WHERE key='admin';
-- Add the explicit direct-storage receipt kind; all balance and writer guards remain enforced.
ALTER TABLE ledger_transactions DROP CONSTRAINT ledger_transactions_type_allowed;
ALTER TABLE ledger_transactions ADD CONSTRAINT ledger_transactions_type_allowed
  CHECK(type IN ('topup','hold','release','debit','refund','payout','storage_receipt'));
