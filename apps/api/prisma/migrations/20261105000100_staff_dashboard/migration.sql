-- AlterTable
ALTER TABLE "users" ADD COLUMN     "archived_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "lots" ADD COLUMN     "archived_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "staff_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(80) NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "permissions" TEXT[],
    "built_in" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_memberships" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "staff_memberships_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "staff_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "secret_ciphertext" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_actions" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    "result_ciphertext" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "reason_ciphertext" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_roles_key_key" ON "staff_roles"("key");

-- CreateIndex
CREATE INDEX "staff_roles_archived_at_created_at_id_idx" ON "staff_roles"("archived_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "staff_memberships_role_id_user_id_idx" ON "staff_memberships"("role_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invitations_token_hash_key" ON "staff_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "staff_invitations_user_id_expires_at_id_idx" ON "staff_invitations"("user_id", "expires_at", "id");

-- CreateIndex
CREATE INDEX "staff_actions_actor_id_created_at_id_idx" ON "staff_actions"("actor_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_refunds_invoice_id_key" ON "staff_refunds"("invoice_id");

-- CreateIndex
CREATE INDEX "staff_refunds_created_at_id_idx" ON "staff_refunds"("created_at", "id");

-- AddForeignKey
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "staff_roles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "staff_actions" ADD CONSTRAINT "staff_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "staff_refunds" ADD CONSTRAINT "staff_refunds_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "staff_refunds" ADD CONSTRAINT "staff_refunds_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE users DROP CONSTRAINT users_role_allowed;
ALTER TABLE users ADD CONSTRAINT users_role_allowed CHECK(role IN ('buyer','admin','manager','intake','warehouse','finance','support','supplier'));
ALTER TABLE staff_roles ALTER COLUMN permissions SET NOT NULL;
ALTER TABLE staff_roles ADD CONSTRAINT staff_role_permissions CHECK(permissions <@ ARRAY['dashboard.view','inventory.read','inventory.write','auctions.manage','pickup.manage','buyers.read','buyers.manage','support.manage','finance.read','refunds.manage','withdrawals.manage','wallet.manage','fees.manage','bids.cancel','audit.read','records.archive','staff.manage','records.purge']::text[] AND revision>0);
ALTER TABLE staff_roles ADD CONSTRAINT staff_role_root_permissions CHECK((key='admin' AND built_in) OR NOT permissions && ARRAY['staff.manage','records.purge']);
ALTER TABLE users ADD CONSTRAINT archived_user_suspended CHECK(archived_at IS NULL OR status='suspended');
ALTER TABLE lots ADD CONSTRAINT archived_lot_inactive CHECK(archived_at IS NULL OR status IN ('draft','closed','cancelled'));
CREATE INDEX users_archive_created_idx ON users(archived_at,created_at,id);
CREATE INDEX lots_archive_created_idx ON lots(archived_at,created_at,id);
ALTER TABLE staff_refunds ADD CONSTRAINT staff_refund_positive CHECK(amount_kobo>0);
ALTER TABLE staff_invitations ADD CONSTRAINT staff_invitation_attempts CHECK(attempts>=0 AND attempts<=5);
INSERT INTO staff_roles(id,name,key,permissions,built_in) VALUES('00000000-0000-4000-8000-000000000001','Admin','admin',ARRAY['dashboard.view','inventory.read','inventory.write','auctions.manage','pickup.manage','buyers.read','buyers.manage','support.manage','finance.read','refunds.manage','withdrawals.manage','wallet.manage','fees.manage','bids.cancel','audit.read','records.archive','staff.manage','records.purge']::text[],true);
INSERT INTO staff_roles(id,name,key,permissions,built_in) VALUES('00000000-0000-4000-8000-000000000002','Manager','manager',ARRAY['dashboard.view','inventory.read','inventory.write','auctions.manage','pickup.manage','records.archive']::text[],true);
INSERT INTO staff_roles(id,name,key,permissions,built_in) VALUES('00000000-0000-4000-8000-000000000003','Support','support',ARRAY['dashboard.view','buyers.read','support.manage']::text[],true);
CREATE FUNCTION preserve_staff_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'staff history is immutable'; END; $$;
CREATE TRIGGER staff_actions_immutable BEFORE UPDATE OR DELETE ON staff_actions FOR EACH ROW EXECUTE FUNCTION preserve_staff_history();
CREATE TRIGGER staff_refunds_immutable BEFORE UPDATE OR DELETE ON staff_refunds FOR EACH ROW EXECUTE FUNCTION preserve_staff_history();

INSERT INTO staff_memberships(user_id,role_id) SELECT u.id,r.id FROM users u JOIN staff_roles r ON r.key=u.role WHERE u.role IN ('admin','support');
