-- Default-visible: no existing account is hidden by deploying this migration.
ALTER TABLE "users" ADD COLUMN "hidden_from_staff_directory" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "users_staff_directory_idx" ON "users" ("hidden_from_staff_directory", "role", "id");
