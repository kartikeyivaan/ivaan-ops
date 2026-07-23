-- Add Modified By audit column for customers.
-- Backfill existing rows from Created By so the column can be NOT NULL.

ALTER TABLE "customers" ADD COLUMN "updated_by" UUID;

UPDATE "customers"
SET "updated_by" = "created_by"
WHERE "updated_by" IS NULL;

ALTER TABLE "customers" ALTER COLUMN "updated_by" SET NOT NULL;

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
