-- User password policy: first-login change + 30-day rotation

ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "password_changed_at" TIMESTAMPTZ;

-- Existing accounts keep working without a forced reset after deploy
UPDATE "users"
SET "must_change_password" = false,
    "password_changed_at" = NOW()
WHERE "password_changed_at" IS NULL;
