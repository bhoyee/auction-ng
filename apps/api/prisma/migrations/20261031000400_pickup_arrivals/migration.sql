CREATE TABLE "pickup_arrivals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fulfilment_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "request_key" UUID NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'waiting',
  "handled_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pickup_arrivals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pickup_arrivals_status_check" CHECK ("status" IN ('waiting','acknowledged','closed','cancelled')),
  CONSTRAINT "pickup_arrivals_fulfilment_id_fkey" FOREIGN KEY ("fulfilment_id") REFERENCES "fulfilments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "pickup_arrivals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "pickup_arrivals_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "pickup_arrivals_user_id_request_key_key" ON "pickup_arrivals"("user_id","request_key");
CREATE UNIQUE INDEX "pickup_arrivals_one_active" ON "pickup_arrivals"("fulfilment_id") WHERE "status" IN ('waiting','acknowledged');
CREATE INDEX "pickup_arrivals_user_id_created_at_id_idx" ON "pickup_arrivals"("user_id","created_at","id");
CREATE INDEX "pickup_arrivals_status_created_at_id_idx" ON "pickup_arrivals"("status","created_at","id");
CREATE INDEX "pickup_arrivals_fulfilment_id_idx" ON "pickup_arrivals"("fulfilment_id");
CREATE INDEX "pickup_arrivals_handled_by_id_idx" ON "pickup_arrivals"("handled_by_id");
