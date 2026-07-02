-- Make product pricing global (shared across all companies/users) instead of company-scoped.

-- Collapse existing company-scoped prices into a single global price per product.
-- Keep only the most recently effective price row per product; it becomes the global current price.
DELETE FROM "product_prices" p
USING (
    SELECT "id",
           ROW_NUMBER() OVER (
               PARTITION BY "product_id"
               ORDER BY "effective_from" DESC, "created_at" DESC
           ) AS rn
    FROM "product_prices"
) ranked
WHERE p."id" = ranked."id" AND ranked.rn > 1;

-- The surviving row per product is now the open/current global price.
UPDATE "product_prices" SET "effective_to" = NULL;

-- Drop company scoping.
ALTER TABLE "product_prices" DROP CONSTRAINT IF EXISTS "product_prices_company_id_fkey";
DROP INDEX IF EXISTS "product_prices_product_id_company_id_effective_from_idx";
ALTER TABLE "product_prices" DROP COLUMN "company_id";

-- CreateIndex
CREATE INDEX "product_prices_product_id_effective_from_idx" ON "product_prices"("product_id", "effective_from");
