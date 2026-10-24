-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMPTZ(3),
ALTER COLUMN "phone_ciphertext" DROP NOT NULL,
ALTER COLUMN "phone_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "auth_challenges" (
    "id" UUID NOT NULL,
    "email_hash" VARCHAR(64) NOT NULL,
    "email_ciphertext" BYTEA NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "device_hash" VARCHAR(64) NOT NULL,
    "client" VARCHAR(8) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "device_hash" VARCHAR(64) NOT NULL,
    "client" VARCHAR(8) NOT NULL,
    "access_hash" VARCHAR(64) NOT NULL,
    "refresh_hash" VARCHAR(64) NOT NULL,
    "access_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_rate_limits" (
    "key" VARCHAR(64) NOT NULL,
    "count" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "auth_challenges_email_hash_created_at_id_idx" ON "auth_challenges"("email_hash", "created_at", "id");

-- CreateIndex
CREATE INDEX "auth_challenges_expires_at_id_idx" ON "auth_challenges"("expires_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_access_hash_key" ON "auth_sessions"("access_hash");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_hash_key" ON "auth_sessions"("refresh_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_created_at_id_idx" ON "auth_sessions"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "auth_sessions_family_id_id_idx" ON "auth_sessions"("family_id", "id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_id_idx" ON "auth_sessions"("expires_at", "id");

-- CreateIndex
CREATE INDEX "auth_rate_limits_expires_at_idx" ON "auth_rate_limits"("expires_at");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Email-first identities retain the existing phone verification requirements.
ALTER TABLE users ADD CONSTRAINT users_phone_pair CHECK ((phone_hash IS NULL) = (phone_ciphertext IS NULL));
ALTER TABLE users ADD CONSTRAINT users_identity_required CHECK (phone_hash IS NOT NULL OR email_hash IS NOT NULL);
ALTER TABLE users ADD CONSTRAINT users_phone_verification_requires_phone CHECK (phone_verified_at IS NULL OR phone_hash IS NOT NULL);
ALTER TABLE users ADD CONSTRAINT users_email_verification_requires_email CHECK (email_verified_at IS NULL OR email_hash IS NOT NULL);
ALTER TABLE auth_challenges ADD CONSTRAINT auth_challenges_client CHECK (client IN ('web','mobile'));
ALTER TABLE auth_challenges ADD CONSTRAINT auth_challenges_attempts CHECK (attempts BETWEEN 0 AND 5);
ALTER TABLE auth_challenges ADD CONSTRAINT auth_challenges_expiry CHECK (expires_at > created_at);
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_client CHECK (client IN ('web','mobile'));
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_expiry CHECK (expires_at > created_at AND access_expires_at > created_at);
ALTER TABLE auth_rate_limits ADD CONSTRAINT auth_rate_limits_count CHECK (count BETWEEN 1 AND 1000000);
