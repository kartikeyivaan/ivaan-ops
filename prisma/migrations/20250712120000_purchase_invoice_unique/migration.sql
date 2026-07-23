UPDATE "inventory_lots"
SET "purchase_invoice_no" = 'LEGACY-' || "lot_number"
WHERE "purchase_invoice_no" IS NULL OR BTRIM("purchase_invoice_no") = '';

WITH ranked AS (
  SELECT
    id,
    "purchase_invoice_no",
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(BTRIM("purchase_invoice_no"))
      ORDER BY "created_at", id
    ) AS rn
  FROM "inventory_lots"
)
UPDATE "inventory_lots" AS lot
SET "purchase_invoice_no" = lot."purchase_invoice_no" || '-DUP' || ranked.rn::text
FROM ranked
WHERE lot.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE "inventory_lots" ALTER COLUMN "purchase_invoice_no" SET NOT NULL;

CREATE UNIQUE INDEX "inventory_lots_purchase_invoice_no_key" ON "inventory_lots"("purchase_invoice_no");
