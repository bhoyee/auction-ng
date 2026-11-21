-- Admin WhatsApp sale alerts (owner decision 2026-11-21): one row per paid
-- sale event, delivered through CallMeBot by the notification job. The
-- payload (item, amounts, buyer first name and initial) is encrypted
-- application-side. A unique source event makes queueing idempotent.
CREATE TABLE "admin_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_event_id" UUID NOT NULL,
    "channel" VARCHAR(16) NOT NULL DEFAULT 'whatsapp',
    "payload_ciphertext" BYTEA NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_alerts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_alerts_channel_check" CHECK ("channel" IN ('whatsapp')),
    CONSTRAINT "admin_alerts_status_check" CHECK ("status" IN ('pending', 'sending', 'sent', 'failed')),
    CONSTRAINT "admin_alerts_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "admin_alerts_source_event_id_key" ON "admin_alerts"("source_event_id");
CREATE INDEX "admin_alerts_status_created_at_id_idx" ON "admin_alerts"("status", "created_at", "id");
