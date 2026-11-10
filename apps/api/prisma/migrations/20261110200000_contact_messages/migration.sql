-- Public "Contact us" form messages; payload is encrypted application-side.
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" VARCHAR(12) NOT NULL,
    "request_key" UUID NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "payload_ciphertext" BYTEA NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "inbox_sent_at" TIMESTAMPTZ(3),
    "ack_sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contact_messages_status_check" CHECK ("status" IN ('pending', 'sent', 'failed')),
    CONSTRAINT "contact_messages_reference_check" CHECK ("reference" ~ '^CS-[0-9]{6}$')
);
CREATE UNIQUE INDEX "contact_messages_reference_key" ON "contact_messages"("reference");
CREATE UNIQUE INDEX "contact_messages_request_key_key" ON "contact_messages"("request_key");
CREATE INDEX "contact_messages_status_created_at_id_idx" ON "contact_messages"("status", "created_at", "id");
