-- Make the customer master global (shared across all companies).
-- Drops per-company scoping and switches to globally unique customer code + GST.

-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_company_id_fkey";

-- DropIndex (per-company unique + lookup indexes)
DROP INDEX IF EXISTS "customers_company_id_customer_code_key";
DROP INDEX IF EXISTS "customers_company_id_gst_number_key";
DROP INDEX IF EXISTS "customers_company_id_customer_name_idx";
DROP INDEX IF EXISTS "customers_company_id_city_idx";

-- DropColumn
ALTER TABLE "customers" DROP COLUMN IF EXISTS "company_id";

-- CreateIndex (global uniqueness)
CREATE UNIQUE INDEX "customers_customer_code_key" ON "customers"("customer_code");
CREATE UNIQUE INDEX "customers_gst_number_key" ON "customers"("gst_number");

-- CreateIndex (global lookup)
CREATE INDEX "customers_customer_name_idx" ON "customers"("customer_name");
CREATE INDEX "customers_city_idx" ON "customers"("city");
